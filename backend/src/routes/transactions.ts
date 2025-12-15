import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { calculateMarginalReward, calculateReward } from '../utils/rewardCalculation';
import { calculateNextRefreshTime } from '../utils/quotaRefresh';
import { CalculationMethod, QuotaCalculationBasis } from '../utils/types';
import { logger } from '../utils/logger';
import { validate } from '../middleware/validate';
import { createTransactionSchema } from '../utils/validators';
import * as XLSX from 'xlsx';

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
        if (!Number.isInteger(amountNum)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: '金額必須為整數' });
        }

        // 1. 取得所有相關的回饋組成 (Scheme Rewards + Payment Rewards)
        // 這裡需要分別處理，因為我們要支持獨立計算 (Item 1 需求)
        // 但此處 Transactions 主要是扣額度，所以我們會遍歷所有適用規則並扣除

        // 取得 Scheme Rewards (如果有)
        let schemeRewards: any[] = [];
        const targetSchemeId: string | null = validSchemeId || null;
        if (targetSchemeId) {
          const res = await client.query(
            `SELECT sr.id, sr.reward_percentage, sr.calculation_method, sr.quota_limit, 
                    sr.quota_calculation_basis, sr.quota_refresh_type, sr.quota_refresh_value, sr.quota_refresh_date,
                    cs.activity_end_date
             FROM scheme_rewards sr
             JOIN card_schemes cs ON sr.scheme_id = cs.id
             WHERE sr.scheme_id = $1 ORDER BY sr.display_order`,
            [targetSchemeId]
          );
          schemeRewards = res.rows.map(r => ({ ...r, type: 'scheme' }));
        }

        // 取得 Payment Rewards (如果有)
        let paymentRewards: any[] = [];
        if (validPaymentMethodId) {
          const res = await client.query(
            `SELECT id, reward_percentage, calculation_method, quota_limit,
                    quota_calculation_basis, quota_refresh_type, quota_refresh_value, quota_refresh_date
             FROM payment_rewards 
             WHERE payment_method_id = $1 ORDER BY display_order`,
            [validPaymentMethodId]
          );
          paymentRewards = res.rows.map(r => ({ ...r, type: 'payment' }));
        }

        const allRewards = [...schemeRewards, ...paymentRewards];

        // 若追蹤已過期，重置用量並計算下一次刷新
        const refreshTrackingIfExpired = async (row: any, reward: any) => {
          const nextRefreshAt = row.next_refresh_at ? new Date(row.next_refresh_at) : null;
          if (!nextRefreshAt || nextRefreshAt > new Date()) return row;

          const quotaLimit = reward.quota_limit ? parseFloat(reward.quota_limit) : null;
          const manualAdj = row.manual_adjustment ? parseFloat(row.manual_adjustment) : 0;
          const remaining = quotaLimit !== null ? Math.max(0, quotaLimit - manualAdj) : null;

          const nextRefresh = calculateNextRefreshTime(
            reward.quota_refresh_type,
            reward.quota_refresh_value,
            reward.quota_refresh_date
              ? new Date(reward.quota_refresh_date).toISOString().split('T')[0]
              : null,
            reward.activity_end_date
              ? new Date(reward.activity_end_date).toISOString().split('T')[0]
              : null
          );

          await client.query(
            `UPDATE quota_trackings
             SET used_quota = 0,
                 manual_adjustment = 0,
                 current_amount = 0,
                 remaining_quota = $1,
                 last_refresh_at = NOW(),
                 next_refresh_at = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [remaining, nextRefresh, row.id]
          );

          return {
            ...row,
            used_quota: 0,
            current_amount: 0,
            remaining_quota: remaining,
            next_refresh_at: nextRefresh,
          };
        };

        // 更新每個回饋組成的額度追蹤
        for (const reward of allRewards) {
          const percentage = parseFloat(reward.reward_percentage);
          const method = (reward.calculation_method || 'round') as CalculationMethod;
          const basis = (reward.quota_calculation_basis || 'transaction') as QuotaCalculationBasis;

          // 查找現有額度記錄以獲取累積金額
          // 根據 reward type 決定查詢條件
          let quotaQuery = '';
          let quotaParams: any[] = [];

          if (reward.type === 'scheme') {
            quotaQuery = `
              SELECT id, used_quota, remaining_quota, current_amount, COALESCE(manual_adjustment, 0) as manual_adjustment,
                     next_refresh_at, last_refresh_at
              FROM quota_trackings
              WHERE scheme_id = $1 AND reward_id = $2 
              AND (payment_method_id = $3 OR (payment_method_id IS NULL AND $3 IS NULL))
              AND payment_reward_id IS NULL`;
            quotaParams = [targetSchemeId, reward.id, validPaymentMethodId];
          } else {
            // Payment reward
            quotaQuery = `
              SELECT id, used_quota, remaining_quota, current_amount, COALESCE(manual_adjustment, 0) as manual_adjustment,
                     next_refresh_at, last_refresh_at
              FROM quota_trackings
              WHERE payment_method_id = $1 
              AND payment_reward_id = $2
              AND scheme_id IS NULL`; // 純支付額度通常不綁定 scheme_id
            quotaParams = [validPaymentMethodId, reward.id];
          }

          const quotaResult = await client.query(quotaQuery, quotaParams);
          let currentAccumulated = 0;
          let quotaId: string | null = null;
          let currentUsedQuota = 0;

          if (quotaResult.rows.length > 0) {
            const refreshedRow = await refreshTrackingIfExpired(quotaResult.rows[0], reward);
            currentAccumulated = parseFloat(refreshedRow.current_amount) || 0;
            currentUsedQuota = parseFloat(refreshedRow.used_quota) || 0;
            quotaId = refreshedRow.id;
            quotaResult.rows[0] = refreshedRow;
            // manual_adjustment 不需要在這裡讀取，因為我們只更新 used_quota（系統計算值）
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
            // 需要考慮 manual_adjustment，但這裡只更新 used_quota（系統計算值）
            // remaining_quota 會在查詢時動態計算：quota_limit - (used_quota + manual_adjustment)
            // 為了保持資料一致性，這裡先計算（假設 manual_adjustment 不變）
            const currentManualAdjustment = quotaResult.rows.length > 0 
              ? (parseFloat(quotaResult.rows[0].manual_adjustment) || 0)
              : 0;
            newRemainingQuota = Math.max(0, quotaLimit - (newUsedQuota + currentManualAdjustment));
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
              ? [validSchemeId, validPaymentMethodId, reward.id, null, newUsedQuota, newRemainingQuota, newCurrentAmount, 0, nextRefreshAt]
              : [null, validPaymentMethodId, null, reward.id, newUsedQuota, newRemainingQuota, newCurrentAmount, 0, nextRefreshAt];
            
            await client.query(
              `INSERT INTO quota_trackings 
               (scheme_id, payment_method_id, reward_id, payment_reward_id, used_quota, remaining_quota, current_amount, manual_adjustment, next_refresh_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
    const schemeId: string | null = tx.scheme_id || null;
    const paymentMethodId: string | null = tx.payment_method_id || null;

    // 若追蹤已過期，重置用量並計算下一次刷新（在刪除區塊內定義）
    const refreshTrackingIfExpired = async (row: any, reward: any) => {
      const nextRefreshAt = row.next_refresh_at ? new Date(row.next_refresh_at) : null;
      if (!nextRefreshAt || nextRefreshAt > new Date()) return row;

      const quotaLimit = reward.quota_limit ? parseFloat(reward.quota_limit) : null;
      const manualAdj = row.manual_adjustment ? parseFloat(row.manual_adjustment) : 0;
      const remaining = quotaLimit !== null ? Math.max(0, quotaLimit - manualAdj) : null;

      // 需要取得刷新設定
      let refreshSettings: any = null;
      if (reward.type === 'scheme') {
        const settingResult = await client.query(
          `SELECT sr.quota_refresh_type, sr.quota_refresh_value, sr.quota_refresh_date, cs.activity_end_date
           FROM scheme_rewards sr
           JOIN card_schemes cs ON sr.scheme_id = cs.id
           WHERE sr.id = $1`,
          [reward.id]
        );
        refreshSettings = settingResult.rows[0];
      } else {
        const settingResult = await client.query(
          `SELECT quota_refresh_type, quota_refresh_value, quota_refresh_date
           FROM payment_rewards
           WHERE id = $1`,
          [reward.id]
        );
        refreshSettings = settingResult.rows[0];
      }

      const nextRefresh = refreshSettings
        ? calculateNextRefreshTime(
            refreshSettings.quota_refresh_type,
            refreshSettings.quota_refresh_value,
            refreshSettings.quota_refresh_date
              ? new Date(refreshSettings.quota_refresh_date).toISOString().split('T')[0]
              : null,
            refreshSettings.activity_end_date
              ? new Date(refreshSettings.activity_end_date).toISOString().split('T')[0]
              : null
          )
        : null;

      await client.query(
        `UPDATE quota_trackings
         SET used_quota = 0,
             current_amount = 0,
             remaining_quota = $1,
             last_refresh_at = NOW(),
             next_refresh_at = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [remaining, nextRefresh, row.id]
      );

      return {
        ...row,
        used_quota: 0,
        current_amount: 0,
        remaining_quota: remaining,
        next_refresh_at: nextRefresh,
      };
    };

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
        const method = (reward.calculation_method || 'round') as CalculationMethod;
        const basis = (reward.quota_calculation_basis || 'transaction') as QuotaCalculationBasis;

        // 取得對應的 quota_tracking
        let quotaQuery = '';
        let quotaParams: any[] = [];

        if (reward.type === 'scheme') {
          quotaQuery = `
            SELECT id, used_quota, remaining_quota, current_amount, COALESCE(manual_adjustment, 0) as manual_adjustment,
                   next_refresh_at, last_refresh_at
            FROM quota_trackings
            WHERE scheme_id = $1 AND reward_id = $2
              AND (payment_method_id = $3 OR (payment_method_id IS NULL AND $3 IS NULL))
              AND payment_reward_id IS NULL`;
          quotaParams = [schemeId, reward.id, paymentMethodId];
        } else {
          quotaQuery = `
            SELECT id, used_quota, remaining_quota, current_amount, COALESCE(manual_adjustment, 0) as manual_adjustment,
                   next_refresh_at, last_refresh_at
            FROM quota_trackings
            WHERE payment_method_id = $1
              AND payment_reward_id = $2
              AND scheme_id IS NULL`;
          quotaParams = [paymentMethodId, reward.id];
        }

        const quotaResult = await client.query(quotaQuery, quotaParams);
        if (quotaResult.rows.length === 0) {
          // 沒有追蹤記錄，直接跳過
          continue;
        }

        const quotaRowRaw = quotaResult.rows[0];
        const quotaRow = await refreshTrackingIfExpired(quotaRowRaw, reward);
        const currentAmount = quotaRow.current_amount ? parseFloat(quotaRow.current_amount) : 0;
        const currentUsed = quotaRow.used_quota ? parseFloat(quotaRow.used_quota) : 0;
        const currentManualAdjustment = parseFloat(quotaRow.manual_adjustment) || 0;
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
        // 計算 remaining_quota 時需考慮 manual_adjustment
        const newRemaining = quotaLimit !== null 
          ? Math.max(0, quotaLimit - (newUsed + currentManualAdjustment))
          : null;

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

// 導出交易記錄為 Excel
router.get('/export', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT t.transaction_date, t.reason, t.amount, t.note, t.created_at,
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
       ORDER BY t.created_at ASC`
    );

    const rows = result.rows.map((r: any) => {
      const ts = new Date(r.created_at);
      const timestamp =
        isNaN(ts.getTime()) ? '' : ts.toISOString().replace('T', ' ').replace('Z', '');
      const amountInt = r.amount !== null && r.amount !== undefined
        ? Math.trunc(Number(r.amount))
        : '';
      return {
        時間戳記: timestamp,
        交易日期: r.transaction_date,
        事由: r.reason,
        金額: amountInt,
        類型: r.type_name,
        使用方案: r.scheme_name || '',
        備註: r.note || '',
      };
    });

    const sheet = XLSX.utils.json_to_sheet(rows);
    // 調整欄寬以符合內容
    const headers = Object.keys(rows[0] || {});
    sheet['!cols'] = headers.map((key) => {
      const maxLen = rows.reduce((len: number, row: any) => {
        const cell = row[key] !== undefined && row[key] !== null ? String(row[key]) : '';
        return Math.max(len, cell.length);
      }, key.length);
      return { wch: Math.max(8, maxLen + 2) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Transactions');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="transactions.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

export default router;