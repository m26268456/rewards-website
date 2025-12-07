import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { calculateMarginalReward, calculateReward } from '../utils/rewardCalculation';
import { calculateNextRefreshTime } from '../utils/quotaRefresh';
import { CalculationMethod, QuotaCalculationBasis } from '../utils/types';
import { resolveSharedRewardTargetSchemeId } from '../services/sharedRewardMapping';
import { logger } from '../utils/logger';
import { validate } from '../middleware/validate';
import { createTransactionSchema } from '../utils/validators';

const router = Router();

// ... (GET / 保持不變，省略以節省篇幅) ...
// 取得所有交易記錄
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.transaction_date, t.reason, t.amount, t.note, t.created_at,
              tt.name as type_name,
              CASE 
                WHEN t.scheme_id IS NOT NULL AND t.payment_method_id IS NOT NULL THEN 
                  c.name || '-' || cs.name || '-' || pm.name
                WHEN t.scheme_id IS NOT NULL THEN 
                  c.name || '-' || cs.name
                WHEN t.payment_method_id IS NOT NULL THEN 
                  pm.name
                ELSE NULL
              END as scheme_name
       FROM transactions t
       LEFT JOIN transaction_types tt ON t.type_id = tt.id
       LEFT JOIN card_schemes cs ON t.scheme_id = cs.id
       LEFT JOIN cards c ON cs.card_id = c.id
       LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
       ORDER BY t.created_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('取得交易列表失敗:', error);
    next(error);
  }
});

// 新增交易記錄 (核心修改處)
router.post('/', validate(createTransactionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      transactionDate,
      reason,
      amount,
      typeId,
      note,
      schemeId,
      paymentMethodId,
    } = req.body;

    if (!transactionDate || !reason || !typeId) {
      return res.status(400).json({
        success: false,
        error: '日期、事由、類型為必填欄位',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 驗證 schemeId 和 paymentMethodId
      let validSchemeId: string | null = null;
      let validPaymentMethodId: string | null = null;
      
      if (paymentMethodId && !schemeId) {
        // 純支付方式
        const paymentCheck = await client.query('SELECT id FROM payment_methods WHERE id = $1', [paymentMethodId]);
        if (paymentCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: '無效的支付方式 ID' });
        }
        validPaymentMethodId = paymentMethodId;
      } else if (schemeId) {
        // 卡片方案
        const schemeCheck = await client.query('SELECT id FROM card_schemes WHERE id = $1', [schemeId]);
        if (schemeCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: '無效的方案 ID' });
        }
        validSchemeId = schemeId;
        
        if (paymentMethodId) {
          const paymentCheck = await client.query('SELECT id FROM payment_methods WHERE id = $1', [paymentMethodId]);
          if (paymentCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: '無效的支付方式 ID' });
          }
          validPaymentMethodId = paymentMethodId;
        }
      }

      // 新增交易
      const transactionResult = await client.query(
        `INSERT INTO transactions 
         (transaction_date, reason, amount, type_id, note, scheme_id, payment_method_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, transaction_date, reason, amount, note, created_at`,
        [transactionDate, reason, amount || null, typeId, note || null, validSchemeId, validPaymentMethodId]
      );

      const transaction = transactionResult.rows[0];

      // 如果有選擇方案或支付方式，計算回饋並更新額度
      if ((validSchemeId || validPaymentMethodId) && amount) {
        const amountNum = parseFloat(amount);

        // 1. 取得所有相關的回饋組成 (Scheme Rewards + Payment Rewards)
        // 這裡需要分別處理，因為我們要支持獨立計算 (Item 1 需求)
        // 但此處 Transactions 主要是扣額度，所以我們會遍歷所有適用規則並扣除

        // 取得 Scheme Rewards (如果有)
        let schemeRewards: any[] = [];
        let targetSchemeId: string | null = null;
        if (validSchemeId) {
          targetSchemeId = await resolveSharedRewardTargetSchemeId(validSchemeId, client);
          const res = await client.query(
            `SELECT id, reward_percentage, calculation_method, quota_limit, 
                    quota_calculation_basis
             FROM scheme_rewards 
             WHERE scheme_id = $1 ORDER BY display_order`,
            [targetSchemeId]
          );
          schemeRewards = res.rows.map(r => ({ ...r, type: 'scheme' }));
        }

        // 取得 Payment Rewards (如果有)
        let paymentRewards: any[] = [];
        if (validPaymentMethodId) {
          const res = await client.query(
            `SELECT id, reward_percentage, calculation_method, quota_limit,
                    quota_calculation_basis
             FROM payment_rewards 
             WHERE payment_method_id = $1 ORDER BY display_order`,
            [validPaymentMethodId]
          );
          paymentRewards = res.rows.map(r => ({ ...r, type: 'payment' }));
        }

        const allRewards = [...schemeRewards, ...paymentRewards];

        // 更新每個回饋組成的額度追蹤
        for (const reward of allRewards) {
          const percentage = parseFloat(reward.reward_percentage);
          const method = reward.calculation_method as CalculationMethod;
          const basis = (reward.quota_calculation_basis || 'transaction') as QuotaCalculationBasis;

          // 查找現有額度記錄以獲取累積金額
          // 根據 reward type 決定查詢條件
          let quotaQuery = '';
          let quotaParams: any[] = [];

          if (reward.type === 'scheme') {
            quotaQuery = `
              SELECT id, used_quota, remaining_quota, current_amount, manual_adjustment
              FROM quota_trackings
              WHERE scheme_id = $1 AND reward_id = $2 
              AND (payment_method_id = $3 OR (payment_method_id IS NULL AND $3 IS NULL))
              AND payment_reward_id IS NULL`;
            quotaParams = [targetSchemeId, reward.id, validPaymentMethodId];
          } else {
            // Payment reward
            quotaQuery = `
              SELECT id, used_quota, remaining_quota, current_amount, manual_adjustment
              FROM quota_trackings
              WHERE payment_method_id = $1 
              AND payment_reward_id = $2
              AND scheme_id IS NULL`; // 純支付額度通常不綁定 scheme_id
            quotaParams = [validPaymentMethodId, reward.id];
          }

          // 只取未過期的追蹤
          const quotaResult = await client.query(
            `${quotaQuery} AND (next_refresh_at IS NULL OR next_refresh_at >= NOW())`,
            quotaParams
          );
          let currentAccumulated = 0;
          let quotaId: string | null = null;
          let currentUsedQuota = 0;
		  let currentManualAdjustment = 0;

          if (quotaResult.rows.length > 0) {
            currentAccumulated = parseFloat(quotaResult.rows[0].current_amount) || 0;
            currentUsedQuota = parseFloat(quotaResult.rows[0].used_quota) || 0;
			currentManualAdjustment = parseFloat(quotaResult.rows[0].manual_adjustment) || 0;
            quotaId = quotaResult.rows[0].id;
          }

          // 核心邏輯：根據 basis 計算本次應扣除的回饋額
          let calculatedReward = 0;
          if (basis === 'statement') {
            // 帳單總額模式：使用邊際回饋
            calculatedReward = calculateMarginalReward(currentAccumulated, amountNum, percentage, method);
          } else {
            // 單筆模式 (預設)
            calculatedReward = calculateReward(amountNum, percentage, method);
          }

          const newUsedQuota = currentUsedQuota + calculatedReward;
          // 計算剩餘額度 (若有上限)
          // 注意：如果還沒有記錄，需要從 reward 設定中拿 limit
          const quotaLimit = reward.quota_limit ? parseFloat(reward.quota_limit) : null;
          let newRemainingQuota: number | null = null;

          if (quotaLimit !== null) {
            // 如果已有記錄，基於記錄扣除；如果無記錄，基於上限扣除
            // 但最準確的是: Limit - NewUsed
            newRemainingQuota = quotaLimit - (newUsedQuota + currentManualAdjustment);
            // 允許變負嗎？通常不允許低於0，但記帳可能只記錄事實。這裡保持數學正確性。
          }

          const newCurrentAmount = currentAccumulated + amountNum;

          if (quotaId) {
            await client.query(
              `UPDATE quota_trackings
               SET used_quota = $1, remaining_quota = $2, current_amount = $3,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $4`,
              [newUsedQuota, newRemainingQuota, newCurrentAmount, quotaId]
            );
          } else {
            // 計算 next_refresh_at
            let nextRefreshAt: Date | null = null;
            if (reward.type === 'scheme') {
              const rewardSetting = await client.query(
                `SELECT sr.quota_refresh_type, sr.quota_refresh_value, sr.quota_refresh_date, cs.activity_end_date
                 FROM scheme_rewards sr
                 JOIN card_schemes cs ON sr.scheme_id = cs.id
                 WHERE sr.id = $1`,
                [reward.id]
              );
              if (rewardSetting.rows[0]) {
                const r = rewardSetting.rows[0];
                nextRefreshAt = calculateNextRefreshTime(
                  r.quota_refresh_type,
                  r.quota_refresh_value,
                  r.quota_refresh_date
                    ? new Date(r.quota_refresh_date).toISOString().split('T')[0]
                    : null,
                  r.activity_end_date
                    ? new Date(r.activity_end_date).toISOString().split('T')[0]
                    : null
                );
              }
            } else {
              const rewardSetting = await client.query(
                `SELECT quota_refresh_type, quota_refresh_value, quota_refresh_date
                 FROM payment_rewards
                 WHERE id = $1`,
                [reward.id]
              );
              if (rewardSetting.rows[0]) {
                const r = rewardSetting.rows[0];
                nextRefreshAt = calculateNextRefreshTime(
                  r.quota_refresh_type,
                  r.quota_refresh_value,
                  r.quota_refresh_date
                    ? new Date(r.quota_refresh_date).toISOString().split('T')[0]
                    : null,
                  null
                );
              }
            }

            // 創建新記錄
            const insertParams = reward.type === 'scheme' 
              ? [validSchemeId, validPaymentMethodId, reward.id, null, newUsedQuota, newRemainingQuota, newCurrentAmount, nextRefreshAt]
              : [null, validPaymentMethodId, null, reward.id, newUsedQuota, newRemainingQuota, newCurrentAmount, nextRefreshAt];
            
            await client.query(
              `INSERT INTO quota_trackings 
               (scheme_id, payment_method_id, reward_id, payment_reward_id, used_quota, remaining_quota, current_amount, next_refresh_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              insertParams
            );
          }
        }
      }

      await client.query('COMMIT');
      return res.json({ success: true, data: transaction });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('新增交易失敗:', error);
    return next(error);
  }
});

// ... (其他路由如 delete, export 保持不變，或需同步更新刪除時的回補邏輯) ...
// 注意：刪除交易時的回補邏輯也需要對應更新 (支援 statement 模式的回扣)
// 為了篇幅，若您需要刪除功能的完整代碼請告知，否則目前主要提供新增邏輯的修正。

// 補上 Delete 的簡單修正建議：
// 在 delete 路由中，同樣需要判斷 basis。若是 statement，則回扣量 = calculateReward(total) - calculateReward(total - amount)。
// 這與 calculateMarginalReward(total - amount, amount) 是等價的。

// 刪除交易並回補額度
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 取得交易資料
    const txResult = await client.query(
      `SELECT id, amount, scheme_id, payment_method_id 
       FROM transactions 
       WHERE id = $1`,
      [id]
    );

    if (txResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: '交易不存在' });
    }

    const tx = txResult.rows[0];
    const amountNum = tx.amount ? parseFloat(tx.amount) : null;
    const schemeIdRaw: string | null = tx.scheme_id || null;
    const paymentMethodId: string | null = tx.payment_method_id || null;
    const schemeId: string | null = schemeIdRaw
      ? await resolveSharedRewardTargetSchemeId(schemeIdRaw, client)
      : null;

    // 若有金額且有綁定方案或支付方式，需回補額度
    if (amountNum && (schemeId || paymentMethodId)) {
      // 取得相關回饋組成
      let schemeRewards: any[] = [];
      if (schemeId) {
        const resScheme = await client.query(
          `SELECT id, reward_percentage, calculation_method, quota_limit, quota_calculation_basis
           FROM scheme_rewards
           WHERE scheme_id = $1
           ORDER BY display_order`,
          [schemeId]
        );
        schemeRewards = resScheme.rows.map((r) => ({ ...r, type: 'scheme' }));
      }

      let paymentRewards: any[] = [];
      if (paymentMethodId) {
        const resPay = await client.query(
          `SELECT id, reward_percentage, calculation_method, quota_limit, quota_calculation_basis
           FROM payment_rewards
           WHERE payment_method_id = $1
           ORDER BY display_order`,
          [paymentMethodId]
        );
        paymentRewards = resPay.rows.map((r) => ({ ...r, type: 'payment' }));
      }

      const allRewards = [...schemeRewards, ...paymentRewards];

      for (const reward of allRewards) {
        const percentage = parseFloat(reward.reward_percentage);
        const method = reward.calculation_method as CalculationMethod;
        const basis = (reward.quota_calculation_basis || 'transaction') as QuotaCalculationBasis;

        // 取得對應的 quota_tracking
        let quotaQuery = '';
        let quotaParams: any[] = [];

        if (reward.type === 'scheme') {
          quotaQuery = `
            SELECT id, used_quota, remaining_quota, current_amount
            FROM quota_trackings
            WHERE scheme_id = $1 AND reward_id = $2
              AND (payment_method_id = $3 OR (payment_method_id IS NULL AND $3 IS NULL))
              AND payment_reward_id IS NULL`;
          quotaParams = [schemeId, reward.id, paymentMethodId];
        } else {
          quotaQuery = `
            SELECT id, used_quota, remaining_quota, current_amount
            FROM quota_trackings
            WHERE payment_method_id = $1
              AND payment_reward_id = $2
              AND scheme_id IS NULL`;
          quotaParams = [paymentMethodId, reward.id];
        }

        // 只計算未過期的追蹤；若過期則當作沒有記錄
        const quotaResult = await client.query(
          `${quotaQuery} AND (next_refresh_at IS NULL OR next_refresh_at >= NOW())`,
          quotaParams
        );
        if (quotaResult.rows.length === 0) {
          // 沒有追蹤記錄，直接跳過
          continue;
        }

        const quotaRow = quotaResult.rows[0];
        const currentAmount = quotaRow.current_amount ? parseFloat(quotaRow.current_amount) : 0;
        const currentUsed = quotaRow.used_quota ? parseFloat(quotaRow.used_quota) : 0;
        const quotaLimit = reward.quota_limit ? parseFloat(reward.quota_limit) : null;

        const newCurrentAmount = Math.max(0, currentAmount - amountNum);

        let rollbackAmount = 0;
        if (basis === 'statement') {
          // 回補邊際回饋 = f(total) - f(total - amount)
          rollbackAmount = calculateMarginalReward(newCurrentAmount, amountNum, percentage, method);
        } else {
          rollbackAmount = calculateReward(amountNum, percentage, method);
        }

        const newUsed = Math.max(0, currentUsed - rollbackAmount);
        const newRemaining = quotaLimit !== null ? quotaLimit - newUsed : null;

        await client.query(
          `UPDATE quota_trackings
           SET used_quota = $1,
               remaining_quota = $2,
               current_amount = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [newUsed, newRemaining, newCurrentAmount, quotaRow.id]
        );
      }
    }

    // 刪除交易
    await client.query('DELETE FROM transactions WHERE id = $1', [id]);

    await client.query('COMMIT');
    return res.json({ success: true, message: '交易已刪除並回補額度' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`刪除交易失敗 ID ${id}:`, error);
    return next(error);
  } finally {
    client.release();
  }
});

export default router;