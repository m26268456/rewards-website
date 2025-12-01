import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { getAllCardsWithSchemes, queryChannelRewards, queryChannelRewardsByKeywords } from '../services/schemeService';

const router = Router();

// 取得所有卡片及其方案（方案總覽）
router.get('/overview', async (req: Request, res: Response) => {
  try {
    console.log('📥 收到方案總覽請求');
    const data = await getAllCardsWithSchemes();
    console.log('✅ 方案總覽數據獲取成功，卡片數量:', data.length);
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ 取得方案總覽錯誤:', error);
    console.error('錯誤堆棧:', (error as Error).stack);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 查詢通路回饋
router.post('/query-channels', async (req: Request, res: Response) => {
  try {
    const { channelIds, keywords } = req.body;

    // 如果提供關鍵字，使用關鍵字查詢
    if (keywords && Array.isArray(keywords) && keywords.length > 0) {
      const results = await queryChannelRewardsByKeywords(keywords);
      res.json({ success: true, data: results });
      return;
    }

    // 否則使用通路ID查詢
    if (!Array.isArray(channelIds) || channelIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: '請提供通路 ID 陣列或關鍵字陣列',
      });
    }

    const results = await queryChannelRewards(channelIds);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 取得卡片的所有方案
router.get('/card/:cardId', async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;

    const result = await pool.query(
      `SELECT id, name, note, requires_switch, activity_start_date, activity_end_date, display_order
       FROM card_schemes
       WHERE card_id = $1
       ORDER BY display_order, created_at`,
      [cardId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 新增方案
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      cardId,
      name,
      note,
      requiresSwitch,
      activityStartDate,
      activityEndDate,
      displayOrder,
      rewards,
    } = req.body;

    if (!cardId || !name) {
      return res.status(400).json({
        success: false,
        error: '卡片 ID 和方案名稱必填',
      });
    }

    // 開始事務
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 新增方案
      const schemeResult = await client.query(
        `INSERT INTO card_schemes (card_id, name, note, requires_switch, activity_start_date, activity_end_date, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          cardId,
          name,
          note || null,
          requiresSwitch || false,
          activityStartDate || null,
          activityEndDate || null,
          displayOrder || 0,
        ]
      );

      const schemeId = schemeResult.rows[0].id;

      // 新增回饋組成
      if (Array.isArray(rewards) && rewards.length > 0) {
        for (const reward of rewards) {
          await client.query(
            `INSERT INTO scheme_rewards 
             (scheme_id, reward_percentage, calculation_method, quota_limit, 
              quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              schemeId,
              reward.percentage,
              reward.calculationMethod,
              reward.quotaLimit || null,
              reward.quotaRefreshType || null,
              reward.quotaRefreshValue || null,
              reward.quotaRefreshDate || null,
              reward.displayOrder || 0,
            ]
          );
        }
      }

      await client.query('COMMIT');

      res.json({ success: true, data: { id: schemeId } });
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

// 更新方案
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      note,
      requiresSwitch,
      activityStartDate,
      activityEndDate,
      displayOrder,
    } = req.body;

    const result = await pool.query(
      `UPDATE card_schemes
       SET name = $1, note = $2, requires_switch = $3, 
           activity_start_date = $4, activity_end_date = $5, display_order = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id`,
      [
        name,
        note || null,
        requiresSwitch,
        activityStartDate || null,
        activityEndDate || null,
        displayOrder,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '方案不存在' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 刪除方案
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM card_schemes WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '方案不存在' });
    }

    res.json({ success: true, message: '方案已刪除' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 取得方案的詳細資訊（包含通路、排除通路、回饋組成）
router.get('/:id/details', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 取得方案基本資訊
    const schemeResult = await pool.query(
      `SELECT id, name, note, requires_switch, activity_start_date, activity_end_date, display_order
       FROM card_schemes
       WHERE id = $1`,
      [id]
    );

    if (schemeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '方案不存在' });
    }

    const scheme = schemeResult.rows[0];

    // 取得回饋組成
    const rewardsResult = await pool.query(
      `SELECT id, reward_percentage, calculation_method, quota_limit, 
              quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order
       FROM scheme_rewards
       WHERE scheme_id = $1
       ORDER BY display_order`,
      [id]
    );

    // 取得適用通路
    const applicationsResult = await pool.query(
      `SELECT c.id, c.name, sca.note
       FROM scheme_channel_applications sca
       JOIN channels c ON sca.channel_id = c.id
       WHERE sca.scheme_id = $1`,
      [id]
    );

    // 取得排除通路
    const exclusionsResult = await pool.query(
      `SELECT c.id, c.name
       FROM scheme_channel_exclusions sce
       JOIN channels c ON sce.channel_id = c.id
       WHERE sce.scheme_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...scheme,
        rewards: rewardsResult.rows,
        applications: applicationsResult.rows,
        exclusions: exclusionsResult.rows,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新方案的通路、排除通路、回饋組成
router.put('/:id/channels', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { applications, exclusions } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 刪除現有的適用通路
      await client.query('DELETE FROM scheme_channel_applications WHERE scheme_id = $1', [id]);

      // 新增適用通路
      if (Array.isArray(applications)) {
        for (const app of applications) {
          if (app.channelId) {
            await client.query(
              `INSERT INTO scheme_channel_applications (scheme_id, channel_id, note)
               VALUES ($1, $2, $3)
               ON CONFLICT (scheme_id, channel_id) DO UPDATE SET note = $3`,
              [id, app.channelId, app.note || null]
            );
          }
        }
      }

      // 刪除現有的排除通路
      await client.query('DELETE FROM scheme_channel_exclusions WHERE scheme_id = $1', [id]);

      // 新增排除通路
      if (Array.isArray(exclusions)) {
        for (const channelId of exclusions) {
          if (channelId) {
            await client.query(
              `INSERT INTO scheme_channel_exclusions (scheme_id, channel_id)
               VALUES ($1, $2)
               ON CONFLICT (scheme_id, channel_id) DO NOTHING`,
              [id, channelId]
            );
          }
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

// 更新方案的回饋組成
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
      await client.query('DELETE FROM scheme_rewards WHERE scheme_id = $1', [id]);

      // 新增回饋組成
      for (const reward of rewards) {
        await client.query(
          `INSERT INTO scheme_rewards 
           (scheme_id, reward_percentage, calculation_method, quota_limit, 
            quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            reward.percentage,
            reward.calculationMethod || 'round',
            reward.quotaLimit || null,
            reward.quotaRefreshType || null,
            reward.quotaRefreshValue || null,
            reward.quotaRefreshDate || null,
            reward.displayOrder || 0,
          ]
        );
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

// 更新卡片方案的順序
router.put('/card/:cardId/order', async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: 'orders 必須是陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        await client.query(
          'UPDATE card_schemes SET display_order = $1 WHERE id = $2 AND card_id = $3',
          [order.displayOrder, order.id, cardId]
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

