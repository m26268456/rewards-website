import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { getAllCardsWithSchemes, queryChannelRewards, queryChannelRewardsByKeywords } from '../services/schemeService';
import {
  resolveSharedRewardTargetSchemeId,
  setSharedRewardGroupMapping,
} from '../services/sharedRewardMapping';

const router = Router();

// 取得所有卡片及其方案（方案總覽）
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const data = await getAllCardsWithSchemes();
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

router.get('/card/:cardId', async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const result = await pool.query(
      `SELECT 
         cs.id,
         cs.name,
         cs.note,
         cs.requires_switch,
         cs.activity_start_date,
         cs.activity_end_date,
         cs.display_order,
         srgm.root_scheme_id as shared_reward_group_id
       FROM card_schemes cs
       LEFT JOIN shared_reward_group_members srgm ON srgm.scheme_id = cs.id
       WHERE cs.card_id = $1
       ORDER BY cs.display_order, cs.name`,
      [cardId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    const err = error as Error;
    console.error('[取得卡片方案] 錯誤:', {
      error: err,
      message: err.message,
      stack: err.stack,
      cardId: req.params.cardId,
    });
    res.status(500).json({ success: false, error: err.message });
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
      // displayOrder, // 移除手動傳入，改為自動計算
      sharedRewardGroupId,
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

      // [修正項目 10] 自動計算順序：查詢目前最大的 display_order
      const maxOrderResult = await client.query(
        'SELECT MAX(display_order) as max_order FROM card_schemes WHERE card_id = $1',
        [cardId]
      );
      const nextDisplayOrder = (maxOrderResult.rows[0].max_order || 0) + 1;

      // 驗證 sharedRewardGroupId（若提供需為同卡片方案）
      if (sharedRewardGroupId) {
        const groupCheck = await client.query(
          `SELECT card_id FROM card_schemes WHERE id = $1`,
          [sharedRewardGroupId]
        );
        if (groupCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: '指定的共同回饋方案不存在',
          });
        }
        if (groupCheck.rows[0].card_id !== cardId) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: '共同回饋方案必須屬於同一張卡片',
          });
        }
      }
      const schemeResult = await client.query(
        `INSERT INTO card_schemes (
           card_id,
           name,
           note,
           requires_switch,
           activity_start_date,
           activity_end_date,
           display_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          cardId,
          name,
          note || null,
          requiresSwitch || false,
          activityStartDate || null,
          activityEndDate || null,
          nextDisplayOrder, // 使用自動計算的順序
        ]
      );

      const schemeId = schemeResult.rows[0].id;

      await setSharedRewardGroupMapping(schemeId, sharedRewardGroupId || null, client);

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
      sharedRewardGroupId,
    } = req.body;

    const schemeCheck = await pool.query(
      `SELECT card_id FROM card_schemes WHERE id = $1`,
      [id]
    );
    if (schemeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: '方案不存在' });
    }
    const cardId = schemeCheck.rows[0].card_id;

    if (sharedRewardGroupId) {
      const groupCheck = await pool.query(
        `SELECT card_id FROM card_schemes WHERE id = $1`,
        [sharedRewardGroupId]
      );
      if (groupCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: '指定的共同回饋方案不存在',
        });
      }
      if (groupCheck.rows[0].card_id !== cardId) {
        return res.status(400).json({
          success: false,
          error: '共同回饋方案必須屬於同一張卡片',
        });
      }
    }

    const values: Array<string | number | boolean | null> = [
      name,
      note || null,
      requiresSwitch,
      activityStartDate || null,
      activityEndDate || null,
      displayOrder,
    ];
    const setClauses = [
      'name = $1',
      'note = $2',
      'requires_switch = $3',
      'activity_start_date = $4',
      'activity_end_date = $5',
      'display_order = $6',
    ];
    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    values.push(id);
    const result = await pool.query(
      `UPDATE card_schemes
       SET ${setClauses.join(', ')}
       WHERE id = $${values.length}
       RETURNING id`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '方案不存在' });
    }

    await setSharedRewardGroupMapping(id, sharedRewardGroupId || null);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 單獨更新共同回饋綁定
router.put('/:id/shared-reward', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { sharedRewardGroupId } = req.body as { sharedRewardGroupId?: string | null };

  try {
    const schemeResult = await pool.query(
      `SELECT id, card_id FROM card_schemes WHERE id = $1`,
      [id]
    );
    if (schemeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '方案不存在' });
    }

    const cardId = schemeResult.rows[0].card_id;
    let targetGroupId: string | null = sharedRewardGroupId || null;

    if (targetGroupId) {
      if (targetGroupId === id) {
        targetGroupId = null;
      } else {
        const targetSchemeResult = await pool.query(
          `SELECT id FROM card_schemes WHERE id = $1 AND card_id = $2`,
          [targetGroupId, cardId]
        );
        if (targetSchemeResult.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: '共同回饋僅能綁定同一卡片的其他方案',
          });
        }
      }
    }

    await setSharedRewardGroupMapping(id, targetGroupId);

    res.json({
      success: true,
      data: { id, sharedRewardGroupId: targetGroupId },
    });
  } catch (error) {
    console.error('[更新共同回饋綁定] 錯誤:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 批量更新方案（包含基本資訊、通路、回饋組成）
router.put('/:id/batch', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      note,
      requiresSwitch,
      activityStartDate,
      activityEndDate,
      displayOrder,
      sharedRewardGroupId,
      applications,
      exclusions,
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const schemeCheck = await client.query(
        `SELECT card_id FROM card_schemes WHERE id = $1`,
        [id]
      );
      if (schemeCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: '方案不存在' });
      }
      const cardId = schemeCheck.rows[0].card_id;

      if (sharedRewardGroupId) {
        const groupCheck = await client.query(
          `SELECT card_id FROM card_schemes WHERE id = $1`,
          [sharedRewardGroupId]
        );
        if (groupCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: '指定的共同回饋方案不存在',
          });
        }
        if (groupCheck.rows[0].card_id !== cardId) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: '共同回饋方案必須屬於同一張卡片',
          });
        }
      }

      // 1. 更新方案基本資訊
      const updateValues: Array<string | number | boolean | null> = [
        name,
        note || null,
        requiresSwitch,
        activityStartDate || null,
        activityEndDate || null,
        displayOrder,
      ];
      const updateClauses = [
        'name = $1',
        'note = $2',
        'requires_switch = $3',
        'activity_start_date = $4::date',
        'activity_end_date = $5::date',
        'display_order = $6',
      ];
      updateClauses.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(id);

      const schemeResult = await client.query(
        `UPDATE card_schemes
         SET ${updateClauses.join(', ')}
         WHERE id = $${updateValues.length}
         RETURNING id`,
        updateValues
      );

      if (schemeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: '方案不存在' });
      }

      await setSharedRewardGroupMapping(id, sharedRewardGroupId || null, client);

      // 2. 批量更新通路設定
      await client.query('DELETE FROM scheme_channel_applications WHERE scheme_id = $1', [id]);

      if (applications && Array.isArray(applications) && applications.length > 0) {
        const validApps = applications.filter((app: any) => app && app.channelId);
        if (validApps.length > 0) {
          for (let i = 0; i < validApps.length; i++) {
            const app = validApps[i];
            const params = [id, app.channelId, app.note || null];
            await client.query(
              `INSERT INTO scheme_channel_applications (scheme_id, channel_id, note)
               VALUES ($1::uuid, $2::uuid, $3::text)
               ON CONFLICT (scheme_id, channel_id) DO UPDATE SET note = EXCLUDED.note`,
              params
            );
          }
        }
      }

      await client.query('DELETE FROM scheme_channel_exclusions WHERE scheme_id = $1', [id]);

      if (exclusions && Array.isArray(exclusions) && exclusions.length > 0) {
        const validExclusions = exclusions.filter((channelId: any) => channelId && typeof channelId === 'string');
        for (let i = 0; i < validExclusions.length; i++) {
          const channelId = validExclusions[i];
          await client.query(
            `INSERT INTO scheme_channel_exclusions (scheme_id, channel_id)
             VALUES ($1::uuid, $2::uuid)
             ON CONFLICT (scheme_id, channel_id) DO NOTHING`,
            [id, channelId]
          );
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, message: '方案已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: err.message,
    });
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

    const schemeResult = await pool.query(
      `SELECT 
         cs.id,
         cs.name,
         cs.note,
         cs.requires_switch,
         cs.activity_start_date,
         cs.activity_end_date,
         cs.display_order,
         srgm.root_scheme_id as shared_reward_group_id
       FROM card_schemes cs
       LEFT JOIN shared_reward_group_members srgm ON srgm.scheme_id = cs.id
       WHERE cs.id = $1`,
      [id]
    );

    if (schemeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '方案不存在' });
    }

    const scheme = schemeResult.rows[0];

    const targetSchemeId = scheme.shared_reward_group_id || id;
    const rewardsResult = await pool.query(
      `SELECT id, reward_percentage, calculation_method, quota_limit, 
              quota_refresh_type, quota_refresh_value, quota_refresh_date, 
              quota_calculation_basis, display_order
       FROM scheme_rewards
       WHERE scheme_id = $1
       ORDER BY display_order`,
      [targetSchemeId]
    );

    // [修正項目 9] 取得適用通路 - 加入 ORDER BY sca.created_at
    const applicationsResult = await pool.query(
      `SELECT c.id, c.name, sca.note
       FROM scheme_channel_applications sca
       JOIN channels c ON sca.channel_id = c.id
       WHERE sca.scheme_id = $1
       ORDER BY sca.created_at`, // 依建立時間排序，確保前端顯示順序與輸入一致
      [id]
    );

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

// (以下路由保持不變，為節省篇幅僅列出更新部分，若需要完整檔案請告知)
// 更新方案通路
router.put('/:id/channels', async (req: Request, res: Response) => {
  // ... (批量插入邏輯同上，已在上方 batch 路由中展示)
  // 此處省略以避免重複，實際檔案中應包含完整代碼
  // 核心邏輯是一樣的：使用 INSERT INTO ... VALUES ... 依序插入
  try {
    const { id } = req.params;
    const { applications, exclusions } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM scheme_channel_applications WHERE scheme_id = $1', [id]);

      if (Array.isArray(applications) && applications.length > 0) {
        const validApps = applications.filter((app: any) => app && app.channelId);
        for (let i = 0; i < validApps.length; i++) {
          const app = validApps[i];
          const params = [id, app.channelId, app.note || null];
          await client.query(
            `INSERT INTO scheme_channel_applications (scheme_id, channel_id, note)
             VALUES ($1::uuid, $2::uuid, $3::text)
             ON CONFLICT (scheme_id, channel_id) DO UPDATE SET note = EXCLUDED.note`,
            params
          );
        }
      }

      await client.query('DELETE FROM scheme_channel_exclusions WHERE scheme_id = $1', [id]);

      if (Array.isArray(exclusions) && exclusions.length > 0) {
        const validExclusions = exclusions.filter((channelId: any) => channelId && typeof channelId === 'string');
        for (let i = 0; i < validExclusions.length; i++) {
          const channelId = validExclusions[i];
          await client.query(
            `INSERT INTO scheme_channel_exclusions (scheme_id, channel_id)
             VALUES ($1::uuid, $2::uuid)
             ON CONFLICT (scheme_id, channel_id) DO NOTHING`,
            [id, channelId]
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
    const err = error as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

// 新增回饋 (需包含 quotaCalculationBasis)
router.post('/:id/rewards', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rewardPercentage, calculationMethod, quotaLimit, quotaRefreshType, quotaRefreshValue, quotaRefreshDate, quotaCalculationBasis, displayOrder } = req.body;

    if (!rewardPercentage || parseFloat(rewardPercentage) <= 0) {
      return res.status(400).json({ success: false, error: '回饋百分比必填且必須大於 0' });
    }

    const result = await pool.query(
      `INSERT INTO scheme_rewards 
       (scheme_id, reward_percentage, calculation_method, quota_limit, 
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

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 批量更新回饋
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

      const schemeExists = await client.query('SELECT id FROM card_schemes WHERE id = $1', [id]);
      if (schemeExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: '方案不存在' });
      }

      const targetSchemeId = await resolveSharedRewardTargetSchemeId(id, client);

      await client.query('DELETE FROM scheme_rewards WHERE scheme_id = $1', [targetSchemeId]);

      if (rewards.length > 0) {
        const validRewards = rewards.filter((r: any) => r.percentage !== undefined);
        if (validRewards.length > 0) {
          const percentages = validRewards.map((r: any) => parseFloat(r.percentage) || 0);
          const calculationMethods = validRewards.map((r: any) => String(r.calculationMethod || 'round'));
          const quotaLimits = validRewards.map((r: any) => (r.quotaLimit !== null && r.quotaLimit !== undefined) ? parseFloat(r.quotaLimit) : null);
          const quotaRefreshTypes = validRewards.map((r: any) => (r.quotaRefreshType ? String(r.quotaRefreshType) : null));
          const quotaRefreshValues = validRewards.map((r: any) => (r.quotaRefreshValue !== null && r.quotaRefreshValue !== undefined) ? parseInt(String(r.quotaRefreshValue)) : null);
          const quotaRefreshDates = validRewards.map((r: any) => (r.quotaRefreshDate ? String(r.quotaRefreshDate) : null));
          const quotaCalculationBases = validRewards.map((r: any) => String(r.quotaCalculationBasis || 'transaction'));
          const displayOrders = validRewards.map((r: any, idx: number) => (r.displayOrder !== undefined && r.displayOrder !== null) ? parseInt(String(r.displayOrder)) : idx);

          await client.query(
            `INSERT INTO scheme_rewards 
             (scheme_id, reward_percentage, calculation_method, quota_limit, 
              quota_refresh_type, quota_refresh_value, quota_refresh_date, quota_calculation_basis, display_order)
             SELECT $1::uuid, unnest($2::numeric[]), unnest($3::text[]), unnest($4::numeric[]),
                    unnest($5::text[]), unnest($6::integer[]), unnest($7::date[]), unnest($8::text[]), unnest($9::integer[])`,
            [
              targetSchemeId,
              percentages,
              calculationMethods,
              quotaLimits,
              quotaRefreshTypes,
              quotaRefreshValues,
              quotaRefreshDates,
              quotaCalculationBases,
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

// 單一回饋更新
router.put('/:id/rewards/:rewardId', async (req: Request, res: Response) => {
  try {
    const { id, rewardId } = req.params;
    const { rewardPercentage, calculationMethod, quotaLimit, quotaRefreshType, quotaRefreshValue, quotaRefreshDate, quotaCalculationBasis } = req.body;

    const schemeResult = await pool.query('SELECT id FROM card_schemes WHERE id = $1', [id]);
    if (schemeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '方案不存在' });
    }

    const targetSchemeId = await resolveSharedRewardTargetSchemeId(id);

    const result = await pool.query(
      `UPDATE scheme_rewards
       SET reward_percentage = $1, calculation_method = $2, quota_limit = $3,
           quota_refresh_type = $4, quota_refresh_value = $5, quota_refresh_date = $6, quota_calculation_basis = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND scheme_id = $9
       RETURNING id`,
      [
        rewardPercentage,
        calculationMethod || 'round',
        quotaLimit || null,
        quotaRefreshType || null,
        quotaRefreshValue || null,
        quotaRefreshDate || null,
        quotaCalculationBasis || 'transaction',
        rewardId,
        targetSchemeId,
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

// 更新順序
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