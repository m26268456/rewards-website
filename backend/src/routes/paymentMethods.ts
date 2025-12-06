import { Router, Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { logger } from '../utils/logger';
// 確保您有此檔案，若無可暫時註解，或改用 SQL 實作
import { getAllPaymentMethods } from '../services/paymentService';
import { validate } from '../middleware/validate';
import { createPaymentMethodSchema } from '../utils/validators';
import { bulkInsertRewards } from '../utils/rewardBatchUpdate';

const router = Router();

// 取得所有支付方式（用於管理）
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT pm.id, pm.name, pm.note, pm.own_reward_percentage, pm.display_order,
              (SELECT json_agg(
                json_build_object(
                  'schemeId', cs.id,
                  'cardName', c.name,
                  'schemeName', cs.name
                )
              )
              FROM payment_scheme_links psl
              JOIN card_schemes cs ON psl.scheme_id = cs.id
              JOIN cards c ON cs.card_id = c.id
              WHERE psl.payment_method_id = pm.id) as linked_schemes
       FROM payment_methods pm
       ORDER BY pm.display_order, pm.created_at`
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('取得支付方式列表失敗:', error);
    return next(error);
  }
});

// 取得所有支付方式（用於方案總覽）
router.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getAllPaymentMethods();
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('取得支付方式總覽錯誤:', error);
    return next(error);
  }
});

// 新增支付方式
router.post('/', validate(createPaymentMethodSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, note, displayOrder } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: '支付方式名稱必填' });
    }

    const result = await pool.query(
      `INSERT INTO payment_methods (name, note, own_reward_percentage, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, note, own_reward_percentage, display_order`,
      [name, note || null, 0, displayOrder || 0]
    );

    logger.info(`新增支付方式: ${name}`);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('新增支付方式失敗:', error);
    return next(error);
  }
});

// 更新支付方式
router.put('/:id', validate(createPaymentMethodSchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, note, displayOrder } = req.body;

    const result = await pool.query(
      `UPDATE payment_methods
       SET name = $1, note = $2, display_order = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, name, note, own_reward_percentage, display_order`,
      [name, note || null, displayOrder, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '支付方式不存在' });
    }

    logger.info(`更新支付方式 ID ${id}`);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error(`更新支付方式失敗 ID ${req.params.id}:`, error);
    return next(error);
  }
});

// 刪除支付方式
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM payment_methods WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '支付方式不存在' });
    }

    logger.info(`刪除支付方式 ID ${id}`);
    return res.json({ success: true, message: '支付方式已刪除' });
  } catch (error) {
    logger.error(`刪除支付方式失敗 ID ${req.params.id}:`, error);
    return next(error);
  }
});

// 連結支付方式與卡片方案
router.post('/:id/link-scheme', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { schemeId, displayOrder } = req.body;

    if (!schemeId) {
      return res.status(400).json({ success: false, error: '方案 ID 必填' });
    }

    const result = await pool.query(
      `INSERT INTO payment_scheme_links (payment_method_id, scheme_id, display_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (payment_method_id, scheme_id) DO NOTHING
       RETURNING id`,
      [id, schemeId, displayOrder || 0]
    );

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error(`連結方案失敗 PaymentID ${req.params.id}:`, error);
    return next(error);
  }
});

// 取消連結支付方式與卡片方案
router.delete('/:id/unlink-scheme/:schemeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, schemeId } = req.params;

    const result = await pool.query(
      `DELETE FROM payment_scheme_links 
       WHERE payment_method_id = $1 AND scheme_id = $2
       RETURNING id`,
      [id, schemeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '連結不存在' });
    }

    return res.json({ success: true, message: '連結已取消' });
  } catch (error) {
    logger.error(`取消連結失敗 PaymentID ${req.params.id}:`, error);
    return next(error);
  }
});

// 取得支付方式的詳細資訊（包含通路）
router.get('/:id/channels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT c.id, c.name, pca.note
       FROM payment_channel_applications pca
       JOIN channels c ON pca.channel_id = c.id
       WHERE pca.payment_method_id = $1
       ORDER BY pca.created_at`,
      [id]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error(`取得通路失敗 PaymentID ${req.params.id}:`, error);
    return next(error);
  }
});

// 取得與方案綁定的支付方式
router.get('/scheme/:schemeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { schemeId } = req.params;

    const result = await pool.query(
      `SELECT pm.id, pm.name, pm.note, pm.own_reward_percentage, pm.display_order
       FROM payment_scheme_links psl
       JOIN payment_methods pm ON psl.payment_method_id = pm.id
       WHERE psl.scheme_id = $1
       ORDER BY pm.display_order, pm.created_at`,
      [schemeId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error(`取得方案綁定支付方式失敗 SchemeID ${req.params.schemeId}:`, error);
    return next(error);
  }
});

// 更新支付方式的通路
router.put('/:id/channels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { applications } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM payment_channel_applications WHERE payment_method_id = $1', [id]);

      if (Array.isArray(applications) && applications.length > 0) {
        const validApps = applications.filter((app: any) => app.channelId);
        for (const app of validApps) {
          const params = [id, app.channelId, app.note || null];
          await client.query(
            `INSERT INTO payment_channel_applications (payment_method_id, channel_id, note)
             VALUES ($1::uuid, $2::uuid, $3::text)
             ON CONFLICT (payment_method_id, channel_id) DO UPDATE SET note = EXCLUDED.note`,
            params
          );
        }
      }

      await client.query('COMMIT');
      logger.info(`更新通路成功 PaymentID ${id}`);
      return res.json({ success: true, message: '通路設定已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error(`更新通路失敗 PaymentID ${req.params.id}:`, error);
    return next(error);
  }
});

// 取得支付方式的回饋組成
router.get('/:id/rewards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, reward_percentage, calculation_method, quota_limit, 
              quota_refresh_type, quota_refresh_value, quota_refresh_date, 
              quota_calculation_basis, display_order
       FROM payment_rewards
       WHERE payment_method_id = $1
       ORDER BY display_order`,
      [id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error(`取得回饋組成失敗 PaymentID ${req.params.id}:`, error);
    return next(error);
  }
});

// 新增支付方式的回饋組成
router.post('/:id/rewards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { rewardPercentage, calculationMethod, quotaLimit, quotaRefreshType, quotaRefreshValue, quotaRefreshDate, quotaCalculationBasis, displayOrder } = req.body;

    const result = await pool.query(
      `INSERT INTO payment_rewards 
       (payment_method_id, reward_percentage, calculation_method, quota_limit, 
        quota_refresh_type, quota_refresh_value, quota_refresh_date, quota_calculation_basis, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        id,
        rewardPercentage,
        calculationMethod || 'round',
        quotaLimit || null,
        quotaRefreshType || null,
        quotaRefreshValue || null,
        quotaRefreshDate || null,
        quotaCalculationBasis || 'transaction',
        displayOrder || 0,
      ]
    );

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('新增回饋失敗:', error);
    return next(error);
  }
});

// 更新支付方式的回饋組成
router.put('/:id/rewards/:rewardId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, rewardId } = req.params;
    const { rewardPercentage, calculationMethod, quotaLimit, quotaRefreshType, quotaRefreshValue, quotaRefreshDate, quotaCalculationBasis, displayOrder } = req.body;

    const result = await pool.query(
      `UPDATE payment_rewards
       SET reward_percentage = $1, calculation_method = $2, quota_limit = $3,
           quota_refresh_type = $4, quota_refresh_value = $5, quota_refresh_date = $6, 
           quota_calculation_basis = $7, display_order = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND payment_method_id = $10
       RETURNING id`,
      [
        rewardPercentage,
        calculationMethod || 'round',
        quotaLimit || null,
        quotaRefreshType || null,
        quotaRefreshValue || null,
        quotaRefreshDate || null,
        quotaCalculationBasis || 'transaction',
        displayOrder || 0,
        rewardId,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '回饋組成不存在' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('更新回饋失敗:', error);
    return next(error);
  }
});

// 刪除支付方式的回饋組成
router.delete('/:id/rewards/:rewardId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, rewardId } = req.params;

    const result = await pool.query(
      'DELETE FROM payment_rewards WHERE id = $1 AND payment_method_id = $2 RETURNING id',
      [rewardId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '回饋組成不存在' });
    }

    return res.json({ success: true, message: '回饋組成已刪除' });
  } catch (error) {
    logger.error('刪除回饋失敗:', error);
    return next(error);
  }
});

// 批量更新支付方式的回饋組成
router.put('/:id/rewards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { rewards } = req.body;

    if (!Array.isArray(rewards)) {
      return res.status(400).json({ success: false, error: '回饋組成必須是陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM payment_rewards WHERE payment_method_id = $1', [id]);

      await bulkInsertRewards(
        client,
        'payment_rewards',
        'payment_method_id',
        id,
        rewards
      );

      await client.query('COMMIT');
      logger.info(`批量更新回饋成功 PaymentID ${id}`);
      return res.json({ success: true, message: '回饋組成已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error(`批量更新回饋失敗 PaymentID ${req.params.id}:`, error);
    return next(error);
  }
});

// 更新支付方式回饋組成的順序
router.put('/:id/rewards/order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
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
          'UPDATE payment_rewards SET display_order = $1 WHERE id = $2 AND payment_method_id = $3',
          [order.displayOrder, order.id, id]
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
    logger.error('更新回饋順序失敗:', error);
    return next(error);
  }
});

export default router;