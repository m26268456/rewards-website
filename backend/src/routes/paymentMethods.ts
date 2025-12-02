import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { getAllPaymentMethods } from '../services/paymentService';

const router = Router();

// 取得所有支付方式（用於管理）
router.get('/', async (req: Request, res: Response) => {
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

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 取得所有支付方式（用於方案總覽）
router.get('/overview', async (req: Request, res: Response) => {
  try {
    console.log('📥 收到支付方式總覽請求');
    const data = await getAllPaymentMethods();
    console.log('✅ 支付方式總覽數據獲取成功，數量:', data.length);
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ 取得支付方式總覽錯誤:', error);
    console.error('錯誤堆棧:', (error as Error).stack);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 新增支付方式
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, note, displayOrder } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: '支付方式名稱必填' });
    }

    const result = await pool.query(
      `INSERT INTO payment_methods (name, note, own_reward_percentage, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, note, own_reward_percentage, display_order`,
      [name, note || null, 0, displayOrder || 0] // 不再使用本身回饋，統一使用回饋組成
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新支付方式
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, note, displayOrder } = req.body;

    const result = await pool.query(
      `UPDATE payment_methods
       SET name = $1, note = $2, display_order = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, name, note, own_reward_percentage, display_order`,
      [name, note || null, displayOrder, id] // 不再使用本身回饋，統一使用回饋組成
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '支付方式不存在' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 刪除支付方式
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM payment_methods WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '支付方式不存在' });
    }

    res.json({ success: true, message: '支付方式已刪除' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 連結支付方式與卡片方案
router.post('/:id/link-scheme', async (req: Request, res: Response) => {
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

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 取消連結支付方式與卡片方案
router.delete('/:id/unlink-scheme/:schemeId', async (req: Request, res: Response) => {
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

    res.json({ success: true, message: '連結已取消' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 取得支付方式的詳細資訊（包含通路）
router.get('/:id/channels', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT c.id, c.name, pca.note
       FROM payment_channel_applications pca
       JOIN channels c ON pca.channel_id = c.id
       WHERE pca.payment_method_id = $1`,
      [id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 取得與方案綁定的支付方式
router.get('/scheme/:schemeId', async (req: Request, res: Response) => {
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

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新支付方式的通路
router.put('/:id/channels', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { applications, exclusions } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 刪除現有的適用通路
      await client.query('DELETE FROM payment_channel_applications WHERE payment_method_id = $1', [id]);

      // 批量插入適用通路（優化：使用 UNNEST 批量插入）
      if (Array.isArray(applications) && applications.length > 0) {
        const validApps = applications.filter((app: any) => app.channelId);
        if (validApps.length > 0) {
          // 使用 UNNEST 進行批量插入
          const channelIds = validApps.map((app: any) => app.channelId);
          const notes = validApps.map((app: any) => app.note || null);
          
          await client.query(
            `INSERT INTO payment_channel_applications (payment_method_id, channel_id, note)
             SELECT $1, unnest($2::uuid[]), unnest($3::text[])
             ON CONFLICT (payment_method_id, channel_id) DO UPDATE SET note = EXCLUDED.note`,
            [id, channelIds, notes]
          );
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, message: '通路設定已更新' });
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

// 取得支付方式的回饋組成
router.get('/:id/rewards', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, reward_percentage, calculation_method, quota_limit, 
              quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order
       FROM payment_rewards
       WHERE payment_method_id = $1
       ORDER BY display_order`,
      [id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 新增支付方式的回饋組成
router.post('/:id/rewards', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rewardPercentage, calculationMethod, quotaLimit, quotaRefreshType, quotaRefreshValue, quotaRefreshDate, displayOrder } = req.body;

    const result = await pool.query(
      `INSERT INTO payment_rewards 
       (payment_method_id, reward_percentage, calculation_method, quota_limit, 
        quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        id,
        rewardPercentage,
        calculationMethod || 'round',
        quotaLimit || null,
        quotaRefreshType || null,
        quotaRefreshValue || null,
        quotaRefreshDate || null,
        displayOrder || 0,
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新支付方式的回饋組成
router.put('/:id/rewards/:rewardId', async (req: Request, res: Response) => {
  try {
    const { id, rewardId } = req.params;
    const { rewardPercentage, calculationMethod, quotaLimit, quotaRefreshType, quotaRefreshValue, quotaRefreshDate, displayOrder } = req.body;

    const result = await pool.query(
      `UPDATE payment_rewards
       SET reward_percentage = $1, calculation_method = $2, quota_limit = $3,
           quota_refresh_type = $4, quota_refresh_value = $5, quota_refresh_date = $6, display_order = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND payment_method_id = $9
       RETURNING id`,
      [
        rewardPercentage,
        calculationMethod || 'round',
        quotaLimit || null,
        quotaRefreshType || null,
        quotaRefreshValue || null,
        quotaRefreshDate || null,
        displayOrder || 0,
        rewardId,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '回饋組成不存在' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 刪除支付方式的回饋組成
router.delete('/:id/rewards/:rewardId', async (req: Request, res: Response) => {
  try {
    const { id, rewardId } = req.params;

    const result = await pool.query(
      'DELETE FROM payment_rewards WHERE id = $1 AND payment_method_id = $2 RETURNING id',
      [rewardId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '回饋組成不存在' });
    }

    res.json({ success: true, message: '回饋組成已刪除' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 批量更新支付方式的回饋組成
router.put('/:id/rewards', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rewards } = req.body;

    if (!Array.isArray(rewards)) {
      return res.status(400).json({ success: false, error: '回饋組成必須是陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 刪除現有的回饋組成
      await client.query('DELETE FROM payment_rewards WHERE payment_method_id = $1', [id]);

      // 批量插入回饋組成（優化：使用 UNNEST 批量插入）
      if (rewards.length > 0) {
        const validRewards = rewards.filter((r: any) => r.percentage !== undefined && r.percentage !== null);
        if (validRewards.length > 0) {
          // 使用 UNNEST 進行批量插入
          const percentages = validRewards.map((r: any) => parseFloat(r.percentage) || 0);
          const calculationMethods = validRewards.map((r: any) => r.calculationMethod || 'round');
          const quotaLimits = validRewards.map((r: any) => {
            const val = r.quotaLimit;
            return val !== undefined && val !== null ? parseFloat(val) : null;
          });
          const quotaRefreshTypes = validRewards.map((r: any) => r.quotaRefreshType || null);
          const quotaRefreshValues = validRewards.map((r: any) => {
            const val = r.quotaRefreshValue;
            return val !== undefined && val !== null ? parseFloat(val) : null;
          });
          const quotaRefreshDates = validRewards.map((r: any) => r.quotaRefreshDate || null);
          const displayOrders = validRewards.map((r: any, idx: number) => {
            const val = r.displayOrder;
            return val !== undefined && val !== null ? parseInt(val) : idx;
          });

          await client.query(
            `INSERT INTO payment_rewards 
             (payment_method_id, reward_percentage, calculation_method, quota_limit, 
              quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order)
             SELECT $1::uuid, unnest($2::numeric[]), unnest($3::text[]), unnest($4::numeric[]),
                    unnest($5::text[]), unnest($6::numeric[]), unnest($7::date[]), unnest($8::integer[])`,
            [
              id,
              percentages,
              calculationMethods,
              quotaLimits,
              quotaRefreshTypes,
              quotaRefreshValues,
              quotaRefreshDates,
              displayOrders,
            ]
          );
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, message: '回饋組成已更新' });
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

// 更新支付方式回饋組成的順序
router.put('/:id/rewards/order', async (req: Request, res: Response) => {
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
      res.json({ success: true, message: '順序已更新' });
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

export default router;

