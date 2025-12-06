import { Router, Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { shouldRefreshQuota, calculateNextRefreshTime, formatRefreshTime } from '../utils/quotaRefresh';
import { logger } from '../utils/logger';

const router = Router();

// --- PostgreSQL 回傳資料介面 ---
interface QuotaDbRow {
  scheme_id: string | null;
  payment_method_id: string | null;
  card_id: string | null;
  payment_method_id_for_group: string | null;
  name: string | null;
  card_name: string | null;
  scheme_name: string | null;
  payment_method_name: string | null;
  shared_reward_group_id: string | null;
  reward_id: string;
  reward_percentage: string | number;
  calculation_method: string;
  quota_limit: string | number | null;
  quota_refresh_type: string;
  quota_refresh_value: number;
  quota_refresh_date: Date | null;
  quota_calculation_basis: string;
  activity_end_date: Date | null;
  display_order: number;
  used_quota: string | number | null;
  remaining_quota: string | number | null;
  current_amount: string | number | null;
  next_refresh_at: Date | null;
}

// 取得所有額度資訊
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. 查詢 Card Schemes
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

    // 2. 查詢 Payment Methods
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
         qt.next_refresh_at
       FROM payment_methods pm
       INNER JOIN payment_rewards pr ON pm.id = pr.payment_method_id
       LEFT JOIN quota_trackings qt ON pm.id = qt.payment_method_id 
         AND pr.id = qt.payment_reward_id
         AND qt.scheme_id IS NULL
       ORDER BY pm.display_order, pr.display_order`
    );

    // 3. 檢查並刷新額度 (Transaction)
    const client = await pool.connect();
    let hasUpdates = false;
    
    const allQuotasToCheck = [
      ...schemeQuotasResult.rows,
      ...paymentQuotasResult.rows,
    ];

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
              [quotaLimit, nextRefresh, quota.scheme_id, quota.payment_method_id, quota.reward_id]
            );
            hasUpdates = true;
          } else if (quota.payment_method_id && quota.reward_id) {
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
              [quotaLimit, nextRefresh, quota.payment_method_id, quota.reward_id]
            );
            hasUpdates = true;
          }
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('額度刷新交易失敗:', error);
    } finally {
      client.release();
    }

    // 4. 若有更新，重新查詢以獲取最新數據
    let finalSchemeRows = schemeQuotasResult.rows;
    let finalPaymentRows = paymentQuotasResult.rows;

    if (hasUpdates) {
       // 重複執行查詢以確保數據一致性
       const updatedSchemeResult = await pool.query<QuotaDbRow>(
         `SELECT cs.id as scheme_id, NULL::uuid as payment_method_id, c.id as card_id, NULL::uuid as payment_method_id_for_group, c.name || '-' || cs.name as name, c.name as card_name, cs.name as scheme_name, srgm.root_scheme_id as shared_reward_group_id, sr.id as reward_id, sr.reward_percentage, sr.calculation_method, sr.quota_limit, sr.quota_refresh_type, sr.quota_refresh_value, sr.quota_refresh_date, sr.quota_calculation_basis, cs.activity_end_date, sr.display_order, qt.used_quota, qt.remaining_quota, qt.current_amount, qt.next_refresh_at FROM card_schemes cs INNER JOIN cards c ON cs.card_id = c.id INNER JOIN scheme_rewards sr ON cs.id = sr.scheme_id LEFT JOIN shared_reward_group_members srgm ON srgm.scheme_id = cs.id LEFT JOIN quota_trackings qt ON cs.id = qt.scheme_id AND sr.id = qt.reward_id AND qt.payment_method_id IS NULL WHERE cs.card_id IS NOT NULL ORDER BY c.display_order, cs.display_order, sr.display_order`
       );
       
       const updatedPaymentResult = await pool.query<QuotaDbRow>(
         `SELECT NULL::uuid as scheme_id, pm.id as payment_method_id, NULL::uuid as card_id, pm.id as payment_method_id_for_group, pm.name, pm.name as payment_method_name, pr.id as reward_id, pr.reward_percentage, pr.calculation_method, pr.quota_limit, pr.quota_refresh_type, pr.quota_refresh_value, pr.quota_refresh_date, pr.quota_calculation_basis, NULL::date as activity_end_date, pr.display_order, COALESCE(qt.used_quota, 0) as used_quota, qt.remaining_quota, COALESCE(qt.current_amount, 0) as current_amount, qt.next_refresh_at FROM payment_methods pm INNER JOIN payment_rewards pr ON pm.id = pr.payment_method_id LEFT JOIN quota_trackings qt ON pm.id = qt.payment_method_id AND pr.id = qt.payment_reward_id AND qt.scheme_id IS NULL ORDER BY pm.display_order, pr.display_order`
       );
       
       finalSchemeRows = updatedSchemeResult.rows;
       finalPaymentRows = updatedPaymentResult.rows;
    }

    // 5. 資料轉換 (Mapping)
    const quotaMap = new Map<string, any>(); 

    const processRow = (row: QuotaDbRow) => {
      const key = `${row.scheme_id || 'null'}_${row.payment_method_id || 'null'}`;
      const percentage = Number(row.reward_percentage);
      const usedQuota = row.used_quota ? Number(row.used_quota) : 0;
      const currentAmount = row.current_amount ? Number(row.current_amount) : 0;
      const quotaLimit = row.quota_limit ? Number(row.quota_limit) : null;
      
      let remainingQuota: number | null = null;
      if (quotaLimit !== null) {
        remainingQuota = Math.max(0, quotaLimit - usedQuota);
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
          rewards: [],
        });
      }

      const quota = quotaMap.get(key)!;
      
      const referenceAmount =
        remainingQuota !== null && percentage > 0 ? (remainingQuota / percentage) * 100 : null;

      const refreshTime = formatRefreshTime(
        row.quota_refresh_type,
        row.quota_refresh_value,
        row.quota_refresh_date ? new Date(row.quota_refresh_date).toISOString().split('T')[0] : null,
        row.activity_end_date ? new Date(row.activity_end_date).toISOString().split('T')[0] : null
      );

      quota.rewards.push({
        percentage,
        rewardId: row.reward_id || '',
        calculationMethod: row.calculation_method || 'round',
        quotaLimit,
        currentAmount,
        usedQuota,
        remainingQuota,
        referenceAmount,
        refreshTime,
        quotaRefreshType: row.quota_refresh_type || null,
        quotaRefreshValue: row.quota_refresh_value || null,
        quotaRefreshDate: row.quota_refresh_date ? new Date(row.quota_refresh_date).toISOString().split('T')[0] : null,
        quotaCalculationBasis: row.quota_calculation_basis || 'transaction',
      });
    };

    [...finalSchemeRows, ...finalPaymentRows].forEach(processRow);

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
        rewardComposition: quota.rewards.map((r: any) => `${r.percentage}%`).join('/'),
        calculationMethods: quota.rewards.map((r: any) => r.calculationMethod),
        quotaLimits: quota.rewards.map((r: any) => r.quotaLimit),
        currentAmounts: quota.rewards.map((r: any) => r.currentAmount),
        usedQuotas: quota.rewards.map((r: any) => r.usedQuota),
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
  }
});

// 更新額度
router.put('/:schemeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { schemeId } = req.params;
    const { paymentMethodId, rewardId, usedQuota, remainingQuota } = req.body;

    if (!rewardId) {
        res.status(400).json({ success: false, error: '回饋 ID 必填' });
        return;
    }

    const actualSchemeId = schemeId === 'null' ? null : schemeId;
    
    // 檢查是否存在記錄
    let checkResult;
    if (actualSchemeId) {
      checkResult = await pool.query(
        `SELECT id, used_quota FROM quota_trackings WHERE scheme_id = $1 AND reward_id = $2 AND payment_reward_id IS NULL`,
        [actualSchemeId, rewardId]
      );
    } else if (paymentMethodId) {
      checkResult = await pool.query(
        `SELECT id, used_quota FROM quota_trackings WHERE payment_method_id = $1 AND payment_reward_id = $2 AND scheme_id IS NULL`,
        [paymentMethodId, rewardId]
      );
    } else {
      res.status(400).json({ success: false, error: '參數錯誤' });
      return;
    }

    if (checkResult.rows.length > 0) {
      // 更新 (使用 Postgres NOW())
      await pool.query(
        `UPDATE quota_trackings SET used_quota = $1, remaining_quota = $2, updated_at = NOW() WHERE id = $3`,
        [usedQuota, remainingQuota, checkResult.rows[0].id]
      );
    } else {
      // 新增
      if (actualSchemeId) {
        await pool.query(
          `INSERT INTO quota_trackings (scheme_id, reward_id, used_quota, remaining_quota, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [actualSchemeId, rewardId, usedQuota, remainingQuota]
        );
      } else {
        await pool.query(
          `INSERT INTO quota_trackings (payment_method_id, payment_reward_id, used_quota, remaining_quota, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [paymentMethodId, rewardId, usedQuota, remainingQuota]
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