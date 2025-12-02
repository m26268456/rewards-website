import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { shouldRefreshQuota, calculateNextRefreshTime, formatRefreshTime } from '../utils/quotaRefresh';

const router = Router();

// 取得所有額度資訊
router.get('/', async (req: Request, res: Response) => {
  try {
    // 取得所有卡片方案的額度
    const schemeQuotasResult = await pool.query(
      `SELECT 
         cs.id as scheme_id,
         NULL::uuid as payment_method_id,
         c.id as card_id,
         NULL::uuid as payment_method_id_for_group,
         c.name || '-' || cs.name as name,
         c.name as card_name,
         cs.name as scheme_name,
         sr.id as reward_id,
         sr.reward_percentage,
         sr.calculation_method,
         sr.quota_limit,
         sr.quota_refresh_type,
         sr.quota_refresh_value,
         sr.quota_refresh_date,
         cs.activity_end_date,
         sr.display_order,
         qt.used_quota,
         qt.remaining_quota,
         qt.current_amount,
         qt.next_refresh_at
       FROM card_schemes cs
       INNER JOIN cards c ON cs.card_id = c.id
       INNER JOIN scheme_rewards sr ON cs.id = sr.scheme_id
       LEFT JOIN quota_trackings qt ON cs.id = qt.scheme_id 
         AND sr.id = qt.reward_id 
         AND qt.payment_method_id IS NULL
       WHERE cs.card_id IS NOT NULL
       ORDER BY c.display_order, cs.display_order, sr.display_order`
    );

    // 移除支付方式綁定卡片方案的額度查詢（因為使用信用卡方案額度）

    // 取得純支付方式的額度（只從 payment_rewards 表取得回饋組成）
    const paymentQuotasResult = await pool.query(
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

    // 組合所有結果並檢查是否需要刷新（移除支付方式綁定卡片方案）
    const allQuotas = [
      ...schemeQuotasResult.rows,
      ...paymentQuotasResult.rows,
    ];

    // 檢查並刷新額度
    const client = await pool.connect();
    try {
      for (const quota of allQuotas) {
        if (quota.next_refresh_at && shouldRefreshQuota(quota.next_refresh_at)) {
          // 需要刷新：重置額度
          const nextRefresh = calculateNextRefreshTime(
            quota.quota_refresh_type,
            quota.quota_refresh_value,
            quota.quota_refresh_date,
            quota.activity_end_date
              ? quota.activity_end_date.toISOString().split('T')[0]
              : null
          );

          const quotaLimit = quota.quota_limit ? parseFloat(quota.quota_limit) : null;

          // 判斷是卡片方案還是支付方式的回饋組成
          if (quota.scheme_id) {
            // 卡片方案的回饋組成
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
              [
                quotaLimit,
                nextRefresh,
                quota.scheme_id,
                quota.payment_method_id,
                quota.reward_id,
              ]
            );
          } else if (quota.payment_method_id && quota.reward_id) {
            // 支付方式的回饋組成
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
              [
                quotaLimit,
                nextRefresh,
                quota.payment_method_id,
                quota.reward_id,
              ]
            );
          }
        }
      }
    } finally {
      client.release();
    }

    // 重新查詢更新後的額度
    const updatedSchemeQuotas = await pool.query(
      `SELECT 
         cs.id as scheme_id,
         NULL::uuid as payment_method_id,
         c.id as card_id,
         NULL::uuid as payment_method_id_for_group,
         c.name || '-' || cs.name as name,
         c.name as card_name,
         cs.name as scheme_name,
         sr.id as reward_id,
         sr.reward_percentage,
         sr.calculation_method,
         sr.quota_limit,
         sr.quota_refresh_type,
         sr.quota_refresh_value,
         sr.quota_refresh_date,
         cs.activity_end_date,
         qt.used_quota,
         qt.remaining_quota,
         qt.current_amount,
         qt.next_refresh_at
       FROM card_schemes cs
       INNER JOIN cards c ON cs.card_id = c.id
       INNER JOIN scheme_rewards sr ON cs.id = sr.scheme_id
       LEFT JOIN quota_trackings qt ON cs.id = qt.scheme_id 
         AND sr.id = qt.reward_id 
         AND qt.payment_method_id IS NULL
       WHERE cs.card_id IS NOT NULL
       ORDER BY c.display_order, cs.display_order, sr.display_order`
    );

    // 移除支付方式綁定卡片方案的額度查詢（因為使用信用卡方案額度）

    const updatedPaymentQuotas = await pool.query(
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
         NULL::date as activity_end_date,
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

    // 組織資料格式 - 按方案和回饋組成正確分組
    const quotaMap = new Map<string, {
      name: string;
      cardId: string | null;
      paymentMethodId: string | null;
      cardName: string | null;
      paymentMethodName: string | null;
      schemeName: string | null;
      rewards: Array<{
        percentage: number;
        rewardId: string;
        calculationMethod: string;
        quotaLimit: number | null;
        currentAmount: number;
        usedQuota: number;
        remainingQuota: number | null;
        referenceAmount: number | null;
        refreshTime: string;
        quotaRefreshType: string | null;
        quotaRefreshValue: number | null;
        quotaRefreshDate: string | null;
      }>;
    }>();

    [...updatedSchemeQuotas.rows, ...updatedPaymentQuotas.rows].forEach((row) => {
      const key = `${row.scheme_id || 'null'}_${row.payment_method_id || 'null'}`;
      const percentage = parseFloat(row.reward_percentage);
      const usedQuota = row.used_quota ? parseFloat(row.used_quota) : 0;
      const currentAmount = row.current_amount ? parseFloat(row.current_amount) : 0;
      const quotaLimit = row.quota_limit ? parseFloat(row.quota_limit) : null;
      
      // 計算剩餘額度：如果有額度上限，剩餘額度 = 額度上限 - 已使用額度
      // 如果沒有額度上限（quotaLimit 為 null），剩餘額度也為 null（無上限）
      let remainingQuota: number | null = null;
      if (quotaLimit !== null) {
        remainingQuota = quotaLimit - usedQuota;
        // 如果計算結果小於 0，設為 0
        if (remainingQuota < 0) {
          remainingQuota = 0;
        }
      }
      // 如果 quotaLimit 為 null，remainingQuota 保持為 null（無上限）

      if (!quotaMap.has(key)) {
        // 確保卡片方案必須有 card_id（不應該為 null）
        const cardId = row.card_id || null;
        if (row.scheme_id && !cardId) {
          console.warn('警告：卡片方案缺少 card_id', { scheme_id: row.scheme_id, row });
        }
        quotaMap.set(key, {
          name: row.name,
          cardId: cardId,
          paymentMethodId: row.payment_method_id_for_group || null,
          cardName: row.card_name || null,
          paymentMethodName: row.payment_method_name || null,
          schemeName: row.scheme_name || null,
          rewards: [],
        });
      }

      const quota = quotaMap.get(key)!;
      
      // 計算參考餘額：剩餘額度除以回饋%數（不考慮四捨五入等計算方式）
      // 如果剩餘額度為 null（無上限），參考餘額也為 null
      const referenceAmount =
        remainingQuota !== null && percentage > 0 ? (remainingQuota / percentage) * 100 : null;

      // 格式化刷新時間
      const refreshTime = formatRefreshTime(
        row.quota_refresh_type,
        row.quota_refresh_value,
        row.quota_refresh_date
          ? row.quota_refresh_date.toISOString().split('T')[0]
          : null,
        row.activity_end_date ? row.activity_end_date.toISOString().split('T')[0] : null
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
        quotaRefreshDate: row.quota_refresh_date ? row.quota_refresh_date.toISOString().split('T')[0] : null,
      });
    });

    // 處理純支付方式的額度（從 payment_rewards 表取得回饋組成）
    const paymentQuotaMap = new Map<string, {
      name: string;
      cardId: string | null;
      paymentMethodId: string | null;
      cardName: string | null;
      paymentMethodName: string | null;
      schemeName: string | null;
      rewards: Array<{
        percentage: number;
        rewardId: string;
        calculationMethod: string;
        quotaLimit: number | null;
        currentAmount: number;
        usedQuota: number;
        remainingQuota: number | null;
        referenceAmount: number | null;
        refreshTime: string;
        quotaRefreshType: string | null;
        quotaRefreshValue: number | null;
        quotaRefreshDate: string | null;
      }>;
    }>();

    paymentQuotasResult.rows.forEach((row) => {
      const key = `null_${row.payment_method_id}`;
      const percentage = parseFloat(row.reward_percentage);
      const usedQuota = row.used_quota ? parseFloat(row.used_quota) : 0;
      const currentAmount = row.current_amount ? parseFloat(row.current_amount) : 0;
      const quotaLimit = row.quota_limit ? parseFloat(row.quota_limit) : null;
      
      let remainingQuota: number | null = null;
      if (quotaLimit !== null) {
        remainingQuota = quotaLimit - usedQuota;
        if (remainingQuota < 0) {
          remainingQuota = 0;
        }
      }

      if (!paymentQuotaMap.has(key)) {
        paymentQuotaMap.set(key, {
          name: row.name,
          cardId: null,
          paymentMethodId: row.payment_method_id,
          cardName: null,
          paymentMethodName: row.payment_method_name || row.name,
          schemeName: null,
          rewards: [],
        });
      }

      const quota = paymentQuotaMap.get(key)!;
      const referenceAmount =
        remainingQuota !== null && percentage > 0 ? (remainingQuota / percentage) * 100 : null;

      const refreshTime = formatRefreshTime(
        row.quota_refresh_type,
        row.quota_refresh_value,
        row.quota_refresh_date
          ? row.quota_refresh_date.toISOString().split('T')[0]
          : null,
        null
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
        quotaRefreshDate: row.quota_refresh_date ? row.quota_refresh_date.toISOString().split('T')[0] : null,
      });
    });

    // 轉換為前端需要的格式
    const result: Array<{
      schemeId: string | null;
      paymentMethodId: string | null;
      name: string;
      cardId: string | null;
      paymentMethodIdForGroup: string | null;
      cardName: string | null;
      paymentMethodName: string | null;
      schemeName: string | null;
      rewardComposition: string;
      calculationMethods: string[];
      quotaLimits: Array<number | null>;
      currentAmounts: number[];
      usedQuotas: number[];
      remainingQuotas: Array<number | null>;
      referenceAmounts: Array<number | null>;
      refreshTimes: string[];
      rewardIds: string[];
      quotaRefreshTypes: Array<string | null>;
      quotaRefreshValues: Array<number | null>;
      quotaRefreshDates: Array<string | null>;
    }> = [];
    
    // 處理卡片方案的額度（只處理有 schemeId 且沒有 paymentMethodId 的）
    quotaMap.forEach((quota, key) => {
      const [schemeId, paymentMethodId] = key.split('_');
      // 只處理卡片方案（有 schemeId 且沒有 paymentMethodId）
      if (schemeId !== 'null' && paymentMethodId === 'null' && quota.rewards.length > 0) {
        quota.rewards.sort((a, b) => a.percentage - b.percentage);
        result.push({
          schemeId: schemeId,
          paymentMethodId: null,
          name: quota.name,
          cardId: quota.cardId,
          paymentMethodIdForGroup: null,
          cardName: quota.cardName,
          paymentMethodName: null,
          schemeName: quota.schemeName,
          rewardComposition: quota.rewards.map(r => `${r.percentage}%`).join('/'),
          calculationMethods: quota.rewards.map(r => r.calculationMethod),
          quotaLimits: quota.rewards.map(r => r.quotaLimit),
          currentAmounts: quota.rewards.map(r => r.currentAmount),
          usedQuotas: quota.rewards.map(r => r.usedQuota),
          remainingQuotas: quota.rewards.map(r => r.remainingQuota),
          referenceAmounts: quota.rewards.map(r => r.referenceAmount),
          refreshTimes: quota.rewards.map(r => r.refreshTime),
          rewardIds: quota.rewards.map(r => r.rewardId),
          quotaRefreshTypes: quota.rewards.map(r => r.quotaRefreshType),
          quotaRefreshValues: quota.rewards.map(r => r.quotaRefreshValue),
          quotaRefreshDates: quota.rewards.map(r => r.quotaRefreshDate),
        });
      }
    });

    // 添加支付方式的額度（只從 paymentQuotaMap 取得，避免重複）
    paymentQuotaMap.forEach((quota, key) => {
      if (quota.rewards.length > 0) {
        quota.rewards.sort((a, b) => a.percentage - b.percentage);
        const [, paymentMethodId] = key.split('_');
        result.push({
          schemeId: null,
          paymentMethodId: paymentMethodId,
          name: quota.name,
          cardId: quota.cardId,
          paymentMethodIdForGroup: quota.paymentMethodId,
          cardName: quota.cardName,
          paymentMethodName: quota.paymentMethodName,
          schemeName: quota.schemeName,
          rewardComposition: quota.rewards.map(r => `${r.percentage}%`).join('/'),
          calculationMethods: quota.rewards.map(r => r.calculationMethod),
          quotaLimits: quota.rewards.map(r => r.quotaLimit),
          currentAmounts: quota.rewards.map(r => r.currentAmount),
          usedQuotas: quota.rewards.map(r => r.usedQuota),
          remainingQuotas: quota.rewards.map(r => r.remainingQuota),
          referenceAmounts: quota.rewards.map(r => r.referenceAmount),
          refreshTimes: quota.rewards.map(r => r.refreshTime),
          rewardIds: quota.rewards.map(r => r.rewardId),
          quotaRefreshTypes: quota.rewards.map(r => r.quotaRefreshType),
          quotaRefreshValues: quota.rewards.map(r => r.quotaRefreshValue),
          quotaRefreshDates: quota.rewards.map(r => r.quotaRefreshDate),
        });
      }
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('取得額度錯誤:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新額度（手動編輯）
router.put('/:schemeId', async (req: Request, res: Response) => {
  try {
    const { schemeId } = req.params;
    const { paymentMethodId, rewardId, quotaLimit, usedQuota, remainingQuota } = req.body;

    if (!rewardId) {
      return res.status(400).json({ success: false, error: '回饋 ID 必填' });
    }

    // 處理 schemeId 為 "null" 字符串的情況（純支付方式）
    const actualSchemeId = schemeId === 'null' ? null : schemeId;

    // 判斷是卡片方案還是支付方式的回饋組成
    let checkResult;
    if (actualSchemeId) {
      // 卡片方案的回饋組成
      checkResult = await pool.query(
        `SELECT id, used_quota FROM quota_trackings
         WHERE scheme_id = $1 
           AND (payment_method_id = $2 OR (payment_method_id IS NULL AND $2 IS NULL))
           AND reward_id = $3
           AND payment_reward_id IS NULL`,
        [actualSchemeId, paymentMethodId || null, rewardId]
      );
    } else if (paymentMethodId) {
      // 支付方式的回饋組成
      checkResult = await pool.query(
        `SELECT id, used_quota FROM quota_trackings
         WHERE payment_method_id = $1 
           AND payment_reward_id = $2
           AND scheme_id IS NULL`,
        [paymentMethodId, rewardId]
      );
    } else {
      return res.status(400).json({ success: false, error: '缺少必要參數' });
    }

    if (checkResult.rows.length > 0) {
      // 更新現有記錄
      // 處理增減邏輯：如果 usedQuota 以 + 或 - 開頭，則進行增減
      let newUsedQuota = usedQuota;
      if (typeof usedQuota === 'string') {
        const currentUsedQuota = parseFloat(checkResult.rows[0].used_quota) || 0;
        if (usedQuota.startsWith('+')) {
          newUsedQuota = currentUsedQuota + parseFloat(usedQuota.substring(1));
        } else if (usedQuota.startsWith('-')) {
          newUsedQuota = currentUsedQuota - parseFloat(usedQuota.substring(1));
        } else {
          newUsedQuota = parseFloat(usedQuota);
        }
      }

      // 計算新的剩餘額度
      let newRemainingQuota = remainingQuota;
      if (actualSchemeId) {
        // 從 scheme_rewards 取得 quota_limit
        const schemeRewardResult = await pool.query(
          `SELECT quota_limit FROM scheme_rewards WHERE id = $1`,
          [rewardId]
        );
        if (schemeRewardResult.rows.length > 0 && schemeRewardResult.rows[0].quota_limit) {
          const quotaLimit = parseFloat(schemeRewardResult.rows[0].quota_limit);
          newRemainingQuota = quotaLimit - (newUsedQuota as number);
          if (newRemainingQuota < 0) {
            newRemainingQuota = 0;
          }
        }
      } else if (paymentMethodId) {
        // 從 payment_rewards 取得 quota_limit
        const paymentRewardResult = await pool.query(
          `SELECT quota_limit FROM payment_rewards WHERE id = $1`,
          [rewardId]
        );
        if (paymentRewardResult.rows.length > 0 && paymentRewardResult.rows[0].quota_limit) {
          const quotaLimit = parseFloat(paymentRewardResult.rows[0].quota_limit);
          newRemainingQuota = quotaLimit - (newUsedQuota as number);
          if (newRemainingQuota < 0) {
            newRemainingQuota = 0;
          }
        }
      }

      await pool.query(
        `UPDATE quota_trackings
         SET used_quota = COALESCE($1, used_quota), 
             remaining_quota = $2, 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [
          newUsedQuota !== undefined ? newUsedQuota : checkResult.rows[0].used_quota,
          newRemainingQuota !== undefined ? newRemainingQuota : null,
          checkResult.rows[0].id,
        ]
      );
    } else {
      // 如果不存在，創建新記錄
      if (actualSchemeId) {
        // 卡片方案的回饋組成
        await pool.query(
          `INSERT INTO quota_trackings 
           (scheme_id, payment_method_id, reward_id, used_quota, remaining_quota)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            actualSchemeId,
            paymentMethodId || null,
            rewardId,
            usedQuota !== undefined ? usedQuota : 0,
            remainingQuota !== undefined ? remainingQuota : null,
          ]
        );
      } else if (paymentMethodId) {
        // 支付方式的回饋組成
        await pool.query(
          `INSERT INTO quota_trackings 
           (payment_method_id, payment_reward_id, used_quota, remaining_quota)
           VALUES ($1, $2, $3, $4)`,
          [
            paymentMethodId,
            rewardId,
            usedQuota !== undefined ? usedQuota : 0,
            remainingQuota !== undefined ? remainingQuota : null,
          ]
        );
      }
    }

    res.json({ success: true, message: '額度已更新' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;

