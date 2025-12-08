import { Router, Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { shouldRefreshQuota, calculateNextRefreshTime, formatRefreshTime } from '../utils/quotaRefresh';
import { logger } from '../utils/logger';
import { QuotaDbRow, QuotaRefreshType } from '../utils/types';

const router = Router();

// 取得所有額度資訊
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  let client;
  try {
    // 1. 檢查並刷新額度 (Transaction)
    client = await pool.connect();
    
    const quotasResult = await client.query(`
      -- 1. 卡片方案回饋
      SELECT 
        qt.id as tracking_id,
        qt.scheme_id,
        NULL::uuid as payment_method_id,
        qt.reward_id,
        NULL::uuid as payment_reward_id,
        qt.next_refresh_at,
        sr.quota_limit,
        sr.quota_refresh_type,
        sr.quota_refresh_value,
        sr.quota_refresh_date,
        cs.activity_end_date
      FROM quota_trackings qt
      JOIN card_schemes cs ON qt.scheme_id = cs.id
      JOIN scheme_rewards sr ON qt.reward_id = sr.id
      WHERE qt.next_refresh_at IS NOT NULL 
        AND qt.scheme_id IS NOT NULL 
        AND qt.payment_method_id IS NULL

      UNION ALL

      -- 2. 純支付方式回饋
      SELECT 
        qt.id as tracking_id,
        NULL::uuid as scheme_id,
        qt.payment_method_id,
        NULL::uuid as reward_id,
        qt.payment_reward_id,
        qt.next_refresh_at,
        pr.quota_limit,
        pr.quota_refresh_type,
        pr.quota_refresh_value,
        pr.quota_refresh_date,
        NULL::date as activity_end_date
      FROM quota_trackings qt
      JOIN payment_rewards pr ON qt.payment_reward_id = pr.id
      WHERE qt.next_refresh_at IS NOT NULL 
        AND qt.scheme_id IS NULL
        AND qt.payment_method_id IS NOT NULL
    `);
    
    const allQuotasToCheck = quotasResult.rows as any[];

    try {
      await client.query('BEGIN');
      
      for (const quota of allQuotasToCheck) {
        if (quota.next_refresh_at && shouldRefreshQuota(new Date(quota.next_refresh_at))) {
          const nextRefresh = calculateNextRefreshTime(
            quota.quota_refresh_type,
            quota.quota_refresh_value,
            quota.quota_refresh_date ? new Date(quota.quota_refresh_date).toISOString().split('T')[0] : null,
            quota.activity_end_date
              ? new Date(quota.activity_end_date).toISOString().split('T')[0]
              : null
          );

          const quotaLimit = quota.quota_limit ? Number(quota.quota_limit) : null;

          // 刷新時需要考慮 manual_adjustment
          // remaining_quota = quota_limit - (0 + manual_adjustment)
          let refreshRemainingQuota: number | null = null;
          if (quotaLimit !== null) {
            // 需要先取得當前的 manual_adjustment
            let currentManualAdjustment = 0;
            if (quota.scheme_id) {
              const adjResult = await client.query(
                `SELECT COALESCE(manual_adjustment, 0) as manual_adjustment FROM quota_trackings
                 WHERE scheme_id = $1 AND reward_id = $2 AND payment_reward_id IS NULL
                   AND (payment_method_id = $3 OR (payment_method_id IS NULL AND $3 IS NULL))`,
                [quota.scheme_id, quota.reward_id, quota.payment_method_id]
              );
              currentManualAdjustment = adjResult.rows[0] ? parseFloat(adjResult.rows[0].manual_adjustment) || 0 : 0;
            } else if (quota.payment_method_id && quota.payment_reward_id) {
              const adjResult = await client.query(
                `SELECT COALESCE(manual_adjustment, 0) as manual_adjustment FROM quota_trackings
                 WHERE payment_method_id = $1 AND payment_reward_id = $2 AND scheme_id IS NULL`,
                [quota.payment_method_id, quota.payment_reward_id]
              );
              currentManualAdjustment = adjResult.rows[0] ? parseFloat(adjResult.rows[0].manual_adjustment) || 0 : 0;
            }
            refreshRemainingQuota = Math.max(0, quotaLimit - currentManualAdjustment);
          }

          if (quota.scheme_id) {
            await client.query(
              `UPDATE quota_trackings
               SET used_quota = 0,
                   remaining_quota = $1,
                   current_amount = 0,
                   next_refresh_at = $2,
                   last_refresh_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE scheme_id = $3 
                 AND (payment_method_id = $4 OR (payment_method_id IS NULL AND $4 IS NULL))
                 AND reward_id = $5
                 AND payment_reward_id IS NULL`,
              [refreshRemainingQuota, nextRefresh, quota.scheme_id, quota.payment_method_id, quota.reward_id]
            );
          } else if (quota.payment_method_id && quota.payment_reward_id) {
            await client.query(
              `UPDATE quota_trackings
               SET used_quota = 0,
                   remaining_quota = $1,
                   current_amount = 0,
                   next_refresh_at = $2,
                   last_refresh_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE payment_method_id = $3 
                 AND payment_reward_id = $4
                 AND scheme_id IS NULL`,
              [refreshRemainingQuota, nextRefresh, quota.payment_method_id, quota.payment_reward_id]
            );
          }
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('額度刷新交易失敗:', error);
    }

    // 2. 查詢最新額度資料（只查一次）
    const schemeQuotasResult = await pool.query<QuotaDbRow>(
      `SELECT 
         cs.id as scheme_id,
         NULL::uuid as payment_method_id,
         c.id as card_id,
         NULL::uuid as payment_method_id_for_group,
         c.name || '-' || cs.name as name,
         c.name as card_name,
         cs.name as scheme_name,
         srgm.root_scheme_id as shared_reward_group_id,
         sr.id as reward_id,
         sr.reward_percentage,
         sr.calculation_method,
         sr.quota_limit,
         sr.quota_refresh_type,
         sr.quota_refresh_value,
         sr.quota_refresh_date,
         sr.quota_calculation_basis,
         cs.activity_end_date,
         sr.display_order,
         qt.used_quota,
         qt.remaining_quota,
         qt.current_amount,
         COALESCE(qt.manual_adjustment, 0) as manual_adjustment,
         qt.next_refresh_at
       FROM card_schemes cs
       INNER JOIN cards c ON cs.card_id = c.id
       INNER JOIN scheme_rewards sr ON cs.id = sr.scheme_id
       LEFT JOIN shared_reward_group_members srgm ON srgm.scheme_id = cs.id
       LEFT JOIN quota_trackings qt ON cs.id = qt.scheme_id 
         AND sr.id = qt.reward_id 
         AND qt.payment_method_id IS NULL
       WHERE cs.card_id IS NOT NULL
       ORDER BY c.display_order, cs.display_order, sr.display_order`
    );

    const paymentQuotasResult = await pool.query<QuotaDbRow>(
      `SELECT 
         NULL::uuid as scheme_id,
         pm.id as payment_method_id,
         NULL::uuid as card_id,
         pm.id as payment_method_id_for_group,
         pm.name,
         pm.name as payment_method_name,
         pr.id as reward_id,
         pr.reward_percentage,
         pr.calculation_method,
         pr.quota_limit,
         pr.quota_refresh_type,
         pr.quota_refresh_value,
         pr.quota_refresh_date,
         pr.quota_calculation_basis,
         NULL::date as activity_end_date,
         pr.display_order,
         COALESCE(qt.used_quota, 0) as used_quota,
         qt.remaining_quota,
         COALESCE(qt.current_amount, 0) as current_amount,
         COALESCE(qt.manual_adjustment, 0) as manual_adjustment,
         qt.next_refresh_at
       FROM payment_methods pm
       INNER JOIN payment_rewards pr ON pm.id = pr.payment_method_id
       LEFT JOIN quota_trackings qt ON pm.id = qt.payment_method_id 
         AND pr.id = qt.payment_reward_id
         AND qt.scheme_id IS NULL
       ORDER BY pm.display_order, pr.display_order`
    );

    // 3. 資料轉換 (Mapping)
    const quotaMap = new Map<string, any>(); 

    const processRow = (row: QuotaDbRow) => {
      const key = `${row.scheme_id || 'null'}_${row.payment_method_id || 'null'}`;
      const rootSchemeId = row.shared_reward_group_id || row.scheme_id || null;
      const percentage = Number(row.reward_percentage);
      const usedQuota = row.used_quota ? Number(row.used_quota) : 0; // a: 系統計算的額度
      const manualAdjustment = row.manual_adjustment ? Number(row.manual_adjustment) : 0; // b: 人工調整值
      const currentAmount = row.current_amount ? Number(row.current_amount) : 0;
      const quotaLimit = row.quota_limit ? Number(row.quota_limit) : null;
      
      // c = a + b (顯示的總額度)
      const totalUsedQuota = usedQuota + manualAdjustment;
      
      let remainingQuota: number | null = null;
      if (quotaLimit !== null) {
        remainingQuota = Math.max(0, quotaLimit - totalUsedQuota);
      }

      if (!quotaMap.has(key)) {
        quotaMap.set(key, {
          name: row.name || row.payment_method_name,
          cardId: row.card_id || null,
          paymentMethodId: row.payment_method_id_for_group || row.payment_method_id || null,
          cardName: row.card_name || null,
          paymentMethodName: row.payment_method_name || null,
          schemeName: row.scheme_name || null,
          sharedRewardGroupId: row.shared_reward_group_id || null,
        rewardSourceSchemeId: row.scheme_id ? rootSchemeId : null,
          rewards: [],
        });
      }

      const quota = quotaMap.get(key)!;
      
      const referenceAmount =
        remainingQuota !== null && percentage > 0 ? (remainingQuota / percentage) * 100 : null;

      const refreshTime = formatRefreshTime(
        (row.quota_refresh_type as QuotaRefreshType | null) || null,
        row.quota_refresh_value || null,
        row.quota_refresh_date ? new Date(row.quota_refresh_date).toISOString().split('T')[0] : null,
        row.activity_end_date ? new Date(row.activity_end_date).toISOString().split('T')[0] : null
      );

      quota.rewards.push({
        percentage,
        rewardId: row.reward_id || '',
        calculationMethod: row.calculation_method || 'round',
        quotaLimit,
        currentAmount,
        usedQuota, // a: 系統計算的額度
        manualAdjustment, // b: 人工調整值
        totalUsedQuota, // c: a + b
        remainingQuota,
        referenceAmount,
        refreshTime,
        quotaRefreshType: row.quota_refresh_type || null,
        quotaRefreshValue: row.quota_refresh_value || null,
        quotaRefreshDate: row.quota_refresh_date ? new Date(row.quota_refresh_date).toISOString().split('T')[0] : null,
        quotaCalculationBasis: row.quota_calculation_basis || 'transaction',
      });
    };

    // 先建立 root rows 映射（scheme_id 為 root 的行）
    const schemeRows = schemeQuotasResult.rows;
    const paymentRows = paymentQuotasResult.rows;
    const rootRowsMap = new Map<string, QuotaDbRow[]>();
    schemeRows.forEach((row) => {
      const rootId = row.shared_reward_group_id || row.scheme_id || '';
      if (!rootRowsMap.has(rootId)) rootRowsMap.set(rootId, []);
      rootRowsMap.get(rootId)!.push(row);
    });

    // 將方案行展開：同一共同回饋群組的方案使用 root 行的 quota/used/remaining，並帶出全部 reward rows
    const expandedSchemeRows: QuotaDbRow[] = [];
    rootRowsMap.forEach((sourceRows, rootId) => {
      if (!sourceRows || sourceRows.length === 0) return;

      // root 範本（若找不到 root，使用 shared_reward_group_id 為 null 的或第一筆）
      const templateRows =
        sourceRows.filter((r) => r.scheme_id === rootId || r.shared_reward_group_id === null);
      const rewardTemplateRows = templateRows.length > 0 ? templateRows : sourceRows;

      // 方案列表（去重）
      const memberMap = new Map<string, QuotaDbRow>();
      sourceRows.forEach((member) => {
        const sid = member.scheme_id || '';
        if (!memberMap.has(sid)) memberMap.set(sid, member);
      });

      // 每個方案帶上完整的 rewardTemplateRows
      memberMap.forEach((member) => {
        rewardTemplateRows.forEach((r) => {
          expandedSchemeRows.push({
            ...r,
            scheme_id: member.scheme_id, // 前端顯示用：各自方案 id
            scheme_name: member.scheme_name,
            name: member.name,
            card_id: member.card_id,
            card_name: member.card_name,
            // 只有綁定時帶出 root；未綁定保持 null
            shared_reward_group_id: member.shared_reward_group_id || null,
          });
        });
      });
    });

    [...expandedSchemeRows, ...paymentRows].forEach(processRow);

    const result = Array.from(quotaMap.entries()).map(([key, quota]) => {
      const [schemeId, paymentMethodId] = key.split('_');
      quota.rewards.sort((a: any, b: any) => a.percentage - b.percentage);
      
      return {
        schemeId: schemeId !== 'null' ? schemeId : null,
        paymentMethodId: paymentMethodId !== 'null' ? paymentMethodId : null,
        name: quota.name,
        cardId: quota.cardId,
        paymentMethodIdForGroup: quota.paymentMethodId,
        cardName: quota.cardName,
        paymentMethodName: quota.paymentMethodName,
        schemeName: quota.schemeName,
        sharedRewardGroupId: quota.sharedRewardGroupId,
        rewardSourceSchemeId: quota.rewardSourceSchemeId || null,
        rewardComposition: quota.rewards.map((r: any) => `${r.percentage}%`).join('/'),
        calculationMethods: quota.rewards.map((r: any) => r.calculationMethod),
        quotaLimits: quota.rewards.map((r: any) => r.quotaLimit),
        currentAmounts: quota.rewards.map((r: any) => r.currentAmount),
        usedQuotas: quota.rewards.map((r: any) => r.usedQuota), // a: 系統計算的額度
        manualAdjustments: quota.rewards.map((r: any) => r.manualAdjustment || 0), // b: 人工調整值
        totalUsedQuotas: quota.rewards.map((r: any) => r.totalUsedQuota || r.usedQuota), // c: a + b
        remainingQuotas: quota.rewards.map((r: any) => r.remainingQuota),
        referenceAmounts: quota.rewards.map((r: any) => r.referenceAmount),
        refreshTimes: quota.rewards.map((r: any) => r.refreshTime),
        rewardIds: quota.rewards.map((r: any) => r.rewardId),
        quotaRefreshTypes: quota.rewards.map((r: any) => r.quotaRefreshType),
        quotaRefreshValues: quota.rewards.map((r: any) => r.quotaRefreshValue),
        quotaRefreshDates: quota.rewards.map((r: any) => r.quotaRefreshDate),
        quotaCalculationBases: quota.rewards.map((r: any) => r.quotaCalculationBasis),
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('取得額度 API 錯誤:', error);
    next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

// 更新額度
router.put('/:schemeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { schemeId } = req.params;
    const { paymentMethodId, rewardId, manualAdjustment } = req.body;

    if (!rewardId) {
        res.status(400).json({ success: false, error: '回饋 ID 必填' });
        return;
    }

    const actualSchemeId = schemeId === 'null' ? null : schemeId;
    const adjustmentValue = manualAdjustment !== undefined && manualAdjustment !== null 
      ? parseFloat(String(manualAdjustment)) 
      : 0;
    
    // 檢查是否存在記錄
    let checkResult;
    if (actualSchemeId) {
      checkResult = await pool.query(
        `SELECT id, used_quota, quota_limit FROM quota_trackings qt
         JOIN scheme_rewards sr ON qt.reward_id = sr.id
         WHERE qt.scheme_id = $1 AND qt.reward_id = $2 AND qt.payment_reward_id IS NULL`,
        [actualSchemeId, rewardId]
      );
    } else if (paymentMethodId) {
      checkResult = await pool.query(
        `SELECT id, used_quota, quota_limit FROM quota_trackings qt
         JOIN payment_rewards pr ON qt.payment_reward_id = pr.id
         WHERE qt.payment_method_id = $1 AND qt.payment_reward_id = $2 AND qt.scheme_id IS NULL`,
        [paymentMethodId, rewardId]
      );
    } else {
      res.status(400).json({ success: false, error: '參數錯誤' });
      return;
    }

    if (checkResult.rows.length > 0) {
      const row = checkResult.rows[0];
      const currentUsedQuota = parseFloat(row.used_quota) || 0; // a: 系統計算的額度
      const quotaLimit = row.quota_limit ? parseFloat(row.quota_limit) : null;
      
      // 計算新的 remaining_quota = quota_limit - (used_quota + manual_adjustment)
      let newRemainingQuota: number | null = null;
      if (quotaLimit !== null) {
        newRemainingQuota = Math.max(0, quotaLimit - (currentUsedQuota + adjustmentValue));
      }
      
      // 更新 manual_adjustment 和 remaining_quota
      await pool.query(
        `UPDATE quota_trackings SET manual_adjustment = $1, remaining_quota = $2, updated_at = NOW() WHERE id = $3`,
        [adjustmentValue, newRemainingQuota, row.id]
      );
    } else {
      // 新增並初始化 next_refresh_at
      const fetchRewardSettings = async () => {
        if (actualSchemeId) {
          const rewardResult = await pool.query(
            `SELECT sr.quota_refresh_type, sr.quota_refresh_value, sr.quota_refresh_date, cs.activity_end_date
             FROM scheme_rewards sr
             JOIN card_schemes cs ON sr.scheme_id = cs.id
             WHERE sr.id = $1`,
            [rewardId]
          );
          return rewardResult.rows[0];
        }
        if (paymentMethodId) {
          const rewardResult = await pool.query(
            `SELECT quota_refresh_type, quota_refresh_value, quota_refresh_date
             FROM payment_rewards
             WHERE id = $1`,
            [rewardId]
          );
          return rewardResult.rows[0];
        }
        return null;
      };

      const reward = await fetchRewardSettings();
      const nextRefreshAt = reward
        ? calculateNextRefreshTime(
            reward.quota_refresh_type,
            reward.quota_refresh_value,
            reward.quota_refresh_date
              ? new Date(reward.quota_refresh_date).toISOString().split('T')[0]
              : null,
            reward.activity_end_date
              ? new Date(reward.activity_end_date).toISOString().split('T')[0]
              : null
          )
        : null;

      // 取得 quota_limit
      let quotaLimit: number | null = null;
      if (actualSchemeId) {
        const limitResult = await pool.query(
          `SELECT quota_limit FROM scheme_rewards WHERE id = $1`,
          [rewardId]
        );
        quotaLimit = limitResult.rows[0]?.quota_limit ? parseFloat(limitResult.rows[0].quota_limit) : null;
      } else if (paymentMethodId) {
        const limitResult = await pool.query(
          `SELECT quota_limit FROM payment_rewards WHERE id = $1`,
          [rewardId]
        );
        quotaLimit = limitResult.rows[0]?.quota_limit ? parseFloat(limitResult.rows[0].quota_limit) : null;
      }
      
      // 計算 remaining_quota
      let newRemainingQuota: number | null = null;
      if (quotaLimit !== null) {
        // 新記錄時 used_quota 為 0，所以 remaining = limit - adjustment
        newRemainingQuota = Math.max(0, quotaLimit - adjustmentValue);
      }

      if (actualSchemeId) {
        await pool.query(
          `INSERT INTO quota_trackings (scheme_id, reward_id, used_quota, remaining_quota, manual_adjustment, next_refresh_at, created_at, updated_at) VALUES ($1, $2, 0, $3, $4, $5, NOW(), NOW())`,
          [actualSchemeId, rewardId, newRemainingQuota, adjustmentValue, nextRefreshAt]
        );
      } else {
        await pool.query(
          `INSERT INTO quota_trackings (payment_method_id, payment_reward_id, used_quota, remaining_quota, manual_adjustment, next_refresh_at, created_at, updated_at) VALUES ($1, $2, 0, $3, $4, $5, NOW(), NOW())`,
          [paymentMethodId, rewardId, newRemainingQuota, adjustmentValue, nextRefreshAt]
        );
      }
    }
    
    res.json({ success: true, message: '額度已更新' });
  } catch (error) {
    logger.error('更新額度錯誤:', error);
    next(error);
  }
});

export default router;