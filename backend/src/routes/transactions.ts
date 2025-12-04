import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { calculateTotalReward } from '../utils/rewardCalculation';
import { utcToZonedTime, format as formatTz } from 'date-fns-tz';
import * as XLSX from 'xlsx';

// 時區設定：UTC+8 (Asia/Taipei)
const TIMEZONE = 'Asia/Taipei';

const router = Router();

// 取得所有交易記錄
router.get('/', async (req: Request, res: Response) => {
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
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 新增交易記錄
router.post('/', async (req: Request, res: Response) => {
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
      // 如果只有 paymentMethodId（純支付方式），不需要 schemeId
      let validSchemeId: string | null = null;
      let validPaymentMethodId: string | null = null;
      
      if (paymentMethodId && !schemeId) {
        // 純支付方式
        const paymentCheck = await client.query(
          'SELECT id FROM payment_methods WHERE id = $1',
          [paymentMethodId]
        );
        if (paymentCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: '無效的支付方式 ID',
          });
        }
        validPaymentMethodId = paymentMethodId;
      } else if (schemeId) {
        // 有 schemeId 的情況（可能同時有 paymentMethodId）
        const schemeCheck = await client.query(
          'SELECT id FROM card_schemes WHERE id = $1',
          [schemeId]
        );
        if (schemeCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: '無效的方案 ID',
          });
        }
        validSchemeId = schemeId;
        
        // 如果同時提供了 paymentMethodId，驗證它是否存在
        if (paymentMethodId) {
          const paymentCheck = await client.query(
            'SELECT id FROM payment_methods WHERE id = $1',
            [paymentMethodId]
          );
          if (paymentCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              error: '無效的支付方式 ID',
            });
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
        [
          transactionDate,
          reason,
          amount || null,
          typeId,
          note || null,
          validSchemeId,
          validPaymentMethodId,
        ]
      );

      const transaction = transactionResult.rows[0];

      // 如果有選擇方案，計算回饋並更新額度
      if (validSchemeId && amount) {
        // 取得方案的回饋組成
        const rewardsResult = await client.query(
          `SELECT sr.id, sr.reward_percentage, sr.calculation_method, 
                  sr.quota_limit, sr.quota_refresh_type, sr.quota_refresh_value, 
                  sr.quota_refresh_date, sr.quota_calculation_mode, cs.activity_end_date
           FROM scheme_rewards sr
           JOIN card_schemes cs ON sr.scheme_id = cs.id
           WHERE sr.scheme_id = $1
           ORDER BY sr.display_order`,
          [validSchemeId]
        );

        const rewards = rewardsResult.rows;

        // 計算回饋
        const calculation = calculateTotalReward(
          parseFloat(amount),
          rewards.map((r) => ({
            percentage: parseFloat(r.reward_percentage),
            calculationMethod: r.calculation_method,
          }))
        );

        // 更新每個回饋組成的額度追蹤
        for (let i = 0; i < rewards.length; i++) {
          const reward = rewards[i];
          const quotaCalculationMode = reward.quota_calculation_mode || 'per_transaction';
          
          // 查找或創建額度追蹤記錄
          const quotaResult = await client.query(
            `SELECT id, used_quota, remaining_quota, current_amount
             FROM quota_trackings
             WHERE scheme_id = $1 AND reward_id = $2 
             AND (payment_method_id = $3 OR (payment_method_id IS NULL AND $3 IS NULL))`,
            [validSchemeId, reward.id, validPaymentMethodId]
          );

          if (quotaResult.rows.length > 0) {
            const quota = quotaResult.rows[0];
            const currentAmount = parseFloat(quota.current_amount) + parseFloat(amount);
            
            let calculatedReward: number;
            let newUsedQuota: number;
            let newRemainingQuota: number | null;
            
            if (quotaCalculationMode === 'total_bill') {
              // 帳單總額模式：使用累積的消費金額計算回饋
              const totalCalculation = calculateTotalReward(
                currentAmount,
                rewards.map((r) => ({
                  percentage: parseFloat(r.reward_percentage),
                  calculationMethod: r.calculation_method,
                }))
              );
              calculatedReward = totalCalculation.breakdown[i].calculatedReward;
              // 已使用額度 = 總回饋金額
              newUsedQuota = calculatedReward;
            } else {
              // 單筆回饋模式：每筆消費後計算回饋
              calculatedReward = calculation.breakdown[i].calculatedReward;
              newUsedQuota = parseFloat(quota.used_quota) + calculatedReward;
            }
            
            newRemainingQuota = quota.remaining_quota
              ? (reward.quota_limit ? parseFloat(reward.quota_limit) : null) - newUsedQuota
              : null;

            await client.query(
              `UPDATE quota_trackings
               SET used_quota = $1, remaining_quota = $2, current_amount = $3,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $4`,
              [newUsedQuota, newRemainingQuota, currentAmount, quota.id]
            );
          } else {
            // 創建新的額度追蹤記錄
            const quotaLimit = reward.quota_limit
              ? parseFloat(reward.quota_limit)
              : null;
            
            let calculatedReward: number;
            let initialUsedQuota: number;
            
            if (quotaCalculationMode === 'total_bill') {
              // 帳單總額模式：使用累積的消費金額計算回饋
              const totalCalculation = calculateTotalReward(
                parseFloat(amount),
                rewards.map((r) => ({
                  percentage: parseFloat(r.reward_percentage),
                  calculationMethod: r.calculation_method,
                }))
              );
              calculatedReward = totalCalculation.breakdown[i].calculatedReward;
              initialUsedQuota = calculatedReward;
            } else {
              // 單筆回饋模式：每筆消費後計算回饋
              calculatedReward = calculation.breakdown[i].calculatedReward;
              initialUsedQuota = calculatedReward;
            }
            
            const initialRemainingQuota = quotaLimit
              ? quotaLimit - initialUsedQuota
              : null;

            await client.query(
              `INSERT INTO quota_trackings 
               (scheme_id, payment_method_id, reward_id, used_quota, remaining_quota, current_amount)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                validSchemeId,
                validPaymentMethodId,
                reward.id,
                initialUsedQuota,
                initialRemainingQuota,
                parseFloat(amount),
              ]
            );
          }
        }
      }

      await client.query('COMMIT');

      res.json({ success: true, data: transaction });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 刪除交易記錄
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 取得交易資訊（包含方案和金額）
      const transactionResult = await client.query(
        `SELECT scheme_id, payment_method_id, amount
         FROM transactions
         WHERE id = $1`,
        [id]
      );

      if (transactionResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: '交易不存在' });
      }

      const transaction = transactionResult.rows[0];

      // 如果有方案，需要加回額度
      if (transaction.scheme_id && transaction.amount) {
        const rewardsResult = await client.query(
          `SELECT sr.id, sr.reward_percentage, sr.calculation_method
           FROM scheme_rewards sr
           WHERE sr.scheme_id = $1
           ORDER BY sr.display_order`,
          [transaction.scheme_id]
        );

        const rewards = rewardsResult.rows;
        const calculation = calculateTotalReward(
          parseFloat(transaction.amount),
          rewards.map((r) => ({
            percentage: parseFloat(r.reward_percentage),
            calculationMethod: r.calculation_method,
          }))
        );

        // 加回額度
        for (let i = 0; i < rewards.length; i++) {
          const reward = rewards[i];
          const calculatedReward = calculation.breakdown[i].calculatedReward;

          await client.query(
            `UPDATE quota_trackings
             SET used_quota = used_quota - $1,
                 remaining_quota = CASE 
                   WHEN remaining_quota IS NOT NULL THEN remaining_quota + $1
                   ELSE NULL
                 END,
                 current_amount = current_amount - $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE scheme_id = $3 AND reward_id = $4
             AND (payment_method_id = $5 OR (payment_method_id IS NULL AND $5 IS NULL))`,
            [
              calculatedReward,
              parseFloat(transaction.amount),
              transaction.scheme_id,
              reward.id,
              transaction.payment_method_id || null,
            ]
          );
        }
      }

      // 刪除交易
      await client.query('DELETE FROM transactions WHERE id = $1', [id]);

      await client.query('COMMIT');

      res.json({ success: true, message: '交易已刪除' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 導出交易明細（Excel）
router.get('/export', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT t.transaction_date, t.reason, t.amount, t.note, t.created_at,
              tt.name as type_name,
              CASE 
                WHEN pm.name IS NOT NULL THEN c.name || '-' || cs.name || '-' || pm.name
                WHEN cs.name IS NOT NULL THEN c.name || '-' || cs.name
                ELSE NULL
              END as scheme_name
       FROM transactions t
       LEFT JOIN transaction_types tt ON t.type_id = tt.id
       LEFT JOIN card_schemes cs ON t.scheme_id = cs.id
       LEFT JOIN cards c ON cs.card_id = c.id
       LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
       ORDER BY t.created_at DESC`
    );

    // 轉換為 Excel 格式（使用 UTC+8 時區）
    const formatDate = (date: Date | string | null) => {
      if (!date) return '';
      // 將 UTC 時間轉換為 UTC+8 時區
      const utcDate = typeof date === 'string' ? new Date(date) : date;
      const taipeiDate = utcToZonedTime(utcDate, TIMEZONE);
      return formatTz(taipeiDate, 'yyyy/MM/dd', { timeZone: TIMEZONE });
    };

    const formatDateTime = (date: Date | string | null) => {
      if (!date) return '';
      // 將 UTC 時間轉換為 UTC+8 時區
      const utcDate = typeof date === 'string' ? new Date(date) : date;
      const taipeiDate = utcToZonedTime(utcDate, TIMEZONE);
      return formatTz(taipeiDate, 'yyyy/MM/dd HH:mm:ss', { timeZone: TIMEZONE });
    };

    const worksheet = XLSX.utils.json_to_sheet(
      result.rows.map((row) => ({
        時間戳記: formatDateTime(row.created_at),
        日期: formatDate(row.transaction_date),
        事由: row.reason,
        金額: row.amount || '',
        類型: row.type_name || '',
        使用方案: row.scheme_name || '',
        備註: row.note || '',
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '交易明細');

    // 生成 buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const filename = `交易明細_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;

