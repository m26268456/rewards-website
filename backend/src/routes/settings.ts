import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

const handleError = (message: string, error: unknown, next: NextFunction): void => {
  logger.error(message, error);
  next(error);
};

// ============================================
// A: 回饋查詢設定
// ============================================

// 更新卡片順序
router.put('/cards/order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orders } = req.body; // [{ id, displayOrder }]

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: '請提供順序陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        await client.query(
          'UPDATE cards SET display_order = $1 WHERE id = $2',
          [order.displayOrder, order.id]
        );
      }

      await client.query('COMMIT');
      return res.json({ success: true, message: '順序已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return handleError('更新卡片順序失敗', error, next);
  }
});

// 更新支付方式順序
router.put('/payment-methods/order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: '請提供順序陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        await client.query(
          'UPDATE payment_methods SET display_order = $1 WHERE id = $2',
          [order.displayOrder, order.id]
        );
      }

      await client.query('COMMIT');
      return res.json({ success: true, message: '順序已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return handleError('更新支付方式順序失敗', error, next);
  }
});

// 更新常用通路順序
router.put('/channels/common/order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: '請提供順序陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        await client.query(
          'UPDATE channels SET display_order = $1 WHERE id = $2',
          [order.displayOrder, order.id]
        );
      }

      await client.query('COMMIT');
      return res.json({ success: true, message: '順序已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return handleError('更新常用通路順序失敗', error, next);
  }
});

// ============================================
// B: 回饋計算設定
// ============================================

// 取得計算方案列表
router.get('/calculation-schemes', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // 取得所有計算方案，按 display_order 排序
    const result = await pool.query(
      `SELECT cs.id, cs.scheme_id, cs.payment_method_id, cs.display_order,
              CASE
                WHEN cs.payment_method_id IS NOT NULL AND cs.scheme_id IS NOT NULL THEN
                  (SELECT c.name || '-' || cs2.name || '-' || pm.name
                   FROM card_schemes cs2
                   JOIN cards c ON cs2.card_id = c.id
                   JOIN payment_methods pm ON cs.payment_method_id = pm.id
                   WHERE cs2.id = cs.scheme_id)
                WHEN cs.scheme_id IS NOT NULL THEN
                  (SELECT c.name || '-' || cs2.name
                   FROM card_schemes cs2
                   JOIN cards c ON cs2.card_id = c.id
                   WHERE cs2.id = cs.scheme_id)
                WHEN cs.payment_method_id IS NOT NULL THEN
                  (SELECT name FROM payment_methods WHERE id = cs.payment_method_id)
              END as name
       FROM calculation_schemes cs
       ORDER BY cs.display_order, cs.id`
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return handleError('取得計算方案列表失敗', error, next);
  }
});

// 新增計算方案
router.post('/calculation-schemes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { schemeId, paymentMethodId, displayOrder } = req.body;

    const result = await pool.query(
      `INSERT INTO calculation_schemes (scheme_id, payment_method_id, display_order)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [schemeId || null, paymentMethodId || null, displayOrder || 0]
    );

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return handleError('新增計算方案失敗', error, next);
  }
});

// 更新計算方案順序
router.put('/calculation-schemes/order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: '請提供順序陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        if (!order.id || order.displayOrder === undefined) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: '順序資料格式錯誤' });
        }
        await client.query(
          'UPDATE calculation_schemes SET display_order = $1 WHERE id = $2',
          [order.displayOrder, order.id]
        );
      }

      await client.query('COMMIT');
      return res.json({ success: true, message: '順序已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return handleError('更新計算方案順序失敗', error, next);
  }
});

// 刪除計算方案
router.delete('/calculation-schemes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM calculation_schemes WHERE id = $1', [id]);

    return res.json({ success: true, message: '方案已刪除' });
  } catch (error) {
    return handleError('刪除計算方案失敗', error, next);
  }
});

// ============================================
// C: 記帳功能設定
// ============================================

// 取得事由字串
router.get('/reason-strings', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT id, content FROM reason_strings ORDER BY created_at');
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return handleError('取得事由字串失敗', error, next);
  }
});

// 更新事由字串
router.put('/reason-strings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content } = req.body;

    // 刪除舊的
    await pool.query('DELETE FROM reason_strings');

    // 插入新的
    if (content) {
      await pool.query('INSERT INTO reason_strings (content) VALUES ($1)', [content]);
    }

    return res.json({ success: true, message: '事由字串已更新' });
  } catch (error) {
    return handleError('更新事由字串失敗', error, next);
  }
});

// 取得交易類型
router.get('/transaction-types', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'SELECT id, name, display_order FROM transaction_types ORDER BY display_order, created_at'
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return handleError('取得交易類型失敗', error, next);
  }
});

// 新增交易類型
router.post('/transaction-types', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, displayOrder } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: '類型名稱必填' });
    }

    const result = await pool.query(
      `INSERT INTO transaction_types (name, display_order)
       VALUES ($1, $2)
       RETURNING id, name, display_order`,
      [name, displayOrder || 0]
    );

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return handleError('新增交易類型失敗', error, next);
  }
});

// 更新交易類型順序（必須在 /:id 之前）
router.put('/transaction-types/order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: '請提供順序陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        await client.query(
          'UPDATE transaction_types SET display_order = $1 WHERE id = $2',
          [order.displayOrder, order.id]
        );
      }

      await client.query('COMMIT');
      return res.json({ success: true, message: '順序已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return handleError('更新交易類型順序失敗', error, next);
  }
});

// 更新交易類型
router.put('/transaction-types/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, displayOrder } = req.body;

    const result = await pool.query(
      `UPDATE transaction_types
       SET name = $1, display_order = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, name, display_order`,
      [name, displayOrder, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '類型不存在' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return handleError('更新交易類型失敗', error, next);
  }
});

// 刪除交易類型
router.delete('/transaction-types/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM transaction_types WHERE id = $1', [id]);

    return res.json({ success: true, message: '類型已刪除' });
  } catch (error) {
    return handleError('刪除交易類型失敗', error, next);
  }
});

// 清除交易明細（依時間區間）
router.delete('/transactions/clear', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: '請提供開始日期和結束日期',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 先取得所有要刪除的交易（包含方案和金額）
      const transactionsResult = await client.query(
        `SELECT id, scheme_id, payment_method_id, amount
         FROM transactions
         WHERE transaction_date >= $1 AND transaction_date <= $2`,
        [startDate, endDate]
      );

      const transactions = transactionsResult.rows;

      // 對每筆交易回退額度
      for (const transaction of transactions) {
        if (transaction.scheme_id && transaction.amount) {
          // 取得方案的回饋組成
          const rewardsResult = await client.query(
            `SELECT sr.id, sr.reward_percentage, sr.calculation_method
             FROM scheme_rewards sr
             WHERE sr.scheme_id = $1
             ORDER BY sr.display_order`,
            [transaction.scheme_id]
          );

          const rewards = rewardsResult.rows;
          
          // 計算回饋（需要導入計算函數）
          const { calculateTotalReward } = require('../utils/rewardCalculation');
          const calculation = calculateTotalReward(
            parseFloat(transaction.amount),
            rewards.map((r: any) => ({
              percentage: parseFloat(r.reward_percentage),
              calculationMethod: r.calculation_method,
            }))
          );

          // 回退額度
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
      }

      // 刪除交易
      const deleteResult = await client.query(
        `DELETE FROM transactions
         WHERE transaction_date >= $1 AND transaction_date <= $2
         RETURNING id`,
        [startDate, endDate]
      );

      await client.query('COMMIT');

      return res.json({
        success: true,
        message: `已清除 ${deleteResult.rows.length} 筆交易`,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return handleError('清除交易明細失敗', error, next);
  }
});

export default router;

