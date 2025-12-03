import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { getAllCardsWithSchemes, queryChannelRewards, queryChannelRewardsByKeywords } from '../services/schemeService';

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

// 取得卡片的所有方案
const cardSchemeColumnCache: Record<string, boolean> = {};

const addSharedRewardGroupColumn = async (): Promise<boolean> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `ALTER TABLE card_schemes 
       ADD COLUMN IF NOT EXISTS shared_reward_group_id UUID REFERENCES card_schemes(id) ON DELETE SET NULL`
    );
    await client.query(
      `ALTER TABLE card_schemes 
       ADD CONSTRAINT IF NOT EXISTS check_shared_reward_same_card 
       CHECK (
         shared_reward_group_id IS NULL OR 
         EXISTS (
           SELECT 1 
           FROM card_schemes cs_self 
           JOIN card_schemes cs_ref ON cs_self.shared_reward_group_id = cs_ref.id
           WHERE cs_self.id = card_schemes.id
             AND cs_self.card_id = cs_ref.card_id
         )
       )`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_card_schemes_shared_reward_group_id 
       ON card_schemes(shared_reward_group_id)`
    );
    await client.query('COMMIT');
    console.log('[card_schemes] 已自動建立 shared_reward_group_id 欄位與約束');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[card_schemes] 無法自動建立 shared_reward_group_id 欄位:', error);
    return false;
  } finally {
    client.release();
  }
};

const ensureCardSchemeColumn = async (columnName: string): Promise<boolean> => {
  if (cardSchemeColumnCache[columnName] !== undefined) {
    return cardSchemeColumnCache[columnName];
  }

  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'card_schemes'
         AND column_name = $1
     ) as "exists"`,
    [columnName]
  );

  let exists = rows[0]?.exists === true;

  if (!exists && columnName === 'shared_reward_group_id') {
    console.warn('[card_schemes] 偵測缺少 shared_reward_group_id 欄位，嘗試自動建立...');
    exists = await addSharedRewardGroupColumn();
  }

  cardSchemeColumnCache[columnName] = exists;

  if (!exists) {
    console.warn(`[card_schemes] 欄位不存在：${columnName}，將使用預設值`);
  }

  return exists;
};

router.get('/card/:cardId', async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;

    const [hasSharedRewardGroupColumn, hasCreatedAtColumn] = await Promise.all([
      ensureCardSchemeColumn('shared_reward_group_id'),
      ensureCardSchemeColumn('created_at'),
    ]);

    const selectColumns = [
      'id',
      'name',
      'note',
      'requires_switch',
      'activity_start_date',
      'activity_end_date',
      'display_order',
      hasSharedRewardGroupColumn ? 'shared_reward_group_id' : 'NULL::uuid as shared_reward_group_id',
    ].join(', ');

    const orderClause = `ORDER BY display_order${hasCreatedAtColumn ? ', created_at' : ''}`;

    const result = await pool.query(
      `SELECT ${selectColumns}
       FROM card_schemes
       WHERE card_id = $1
       ${orderClause}`,
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
      displayOrder,
      sharedRewardGroupId,
    } = req.body;

    if (!cardId || !name) {
      return res.status(400).json({
        success: false,
        error: '卡片 ID 和方案名稱必填',
      });
    }

    const hasSharedRewardGroupColumn = await ensureCardSchemeColumn('shared_reward_group_id');

    // 開始事務
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 驗證 sharedRewardGroupId（如果提供且資料表支援，必須是同一個卡片中的方案）
      if (hasSharedRewardGroupColumn && sharedRewardGroupId) {
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
      } else if (!hasSharedRewardGroupColumn && sharedRewardGroupId) {
        console.warn(
          `[新增方案] 資料庫尚未包含 shared_reward_group_id，忽略傳入的 sharedRewardGroupId`
        );
      }

      const insertColumns = [
        'card_id',
        'name',
        'note',
        'requires_switch',
        'activity_start_date',
        'activity_end_date',
        'display_order',
      ];
      const insertValues: Array<string | boolean | number | null> = [
        cardId,
        name,
        note || null,
        requiresSwitch || false,
        activityStartDate || null,
        activityEndDate || null,
        displayOrder || 0,
      ];
      if (hasSharedRewardGroupColumn) {
        insertColumns.push('shared_reward_group_id');
        insertValues.push(sharedRewardGroupId || null);
      }
      const placeholders = insertColumns.map((_, idx) => `$${idx + 1}`).join(', ');

      // 新增方案
      const schemeResult = await client.query(
        `INSERT INTO card_schemes (${insertColumns.join(', ')})
         VALUES (${placeholders})
         RETURNING id`,
        insertValues
      );

      const schemeId = schemeResult.rows[0].id;

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

    const hasSharedRewardGroupColumn = await ensureCardSchemeColumn('shared_reward_group_id');

    // 驗證 sharedRewardGroupId（如果提供且資料表支援，必須是同一個卡片中的方案）
    if (hasSharedRewardGroupColumn && sharedRewardGroupId) {
      const schemeCheck = await pool.query(
        `SELECT card_id FROM card_schemes WHERE id = $1`,
        [id]
      );
      if (schemeCheck.rows.length > 0) {
        const cardId = schemeCheck.rows[0].card_id;
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
    } else if (!hasSharedRewardGroupColumn && sharedRewardGroupId) {
      console.warn(
        `[更新方案] 資料庫尚未包含 shared_reward_group_id，忽略傳入的 sharedRewardGroupId`
      );
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
    if (hasSharedRewardGroupColumn) {
      setClauses.push(`shared_reward_group_id = $${values.length + 1}`);
      values.push(sharedRewardGroupId || null);
    }
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

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 批量更新方案（包含基本資訊、通路、回饋組成）- 優化版本
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

    const hasSharedRewardGroupColumn = await ensureCardSchemeColumn('shared_reward_group_id');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 驗證 sharedRewardGroupId（如果提供且資料表支援，必須是同一個卡片中的方案）
      if (hasSharedRewardGroupColumn && sharedRewardGroupId) {
        const schemeCheck = await client.query(
          `SELECT card_id FROM card_schemes WHERE id = $1`,
          [id]
        );
        if (schemeCheck.rows.length > 0) {
          const cardId = schemeCheck.rows[0].card_id;
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
      } else if (!hasSharedRewardGroupColumn && sharedRewardGroupId) {
        console.warn(
          `[批量更新方案] 資料庫尚未包含 shared_reward_group_id，忽略傳入的 sharedRewardGroupId`
        );
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
      if (hasSharedRewardGroupColumn) {
        updateClauses.push(`shared_reward_group_id = $${updateValues.length + 1}`);
        updateValues.push(sharedRewardGroupId || null);
      }
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

      // 2. 批量更新通路設定（使用批量插入）
      // 刪除現有的適用通路
      await client.query('DELETE FROM scheme_channel_applications WHERE scheme_id = $1', [id]);

      // 批量插入適用通路
      if (applications && Array.isArray(applications) && applications.length > 0) {
        const validApps = applications.filter((app: any) => app && app.channelId);
        console.log(`[批量更新方案] 準備插入 ${validApps.length} 個適用通路`);
        for (let i = 0; i < validApps.length; i++) {
          const app = validApps[i];
          try {
            const params = [id, app.channelId, app.note || null];
            console.log(`[批量更新方案] 插入適用通路 ${i + 1}/${validApps.length}:`, {
              schemeId: id,
              channelId: app.channelId,
              note: app.note || null,
              noteType: typeof (app.note || null),
            });
            await client.query(
              `INSERT INTO scheme_channel_applications (scheme_id, channel_id, note)
               VALUES ($1::uuid, $2::uuid, $3::text)
               ON CONFLICT (scheme_id, channel_id) DO UPDATE SET note = EXCLUDED.note`,
              params
            );
          } catch (insertError) {
            console.error(`[批量更新方案] 插入適用通路失敗 (第 ${i + 1} 個):`, {
              error: insertError,
              errorMessage: (insertError as Error).message,
              errorStack: (insertError as Error).stack,
              app: app,
              schemeId: id,
              channelId: app.channelId,
              note: app.note || null,
            });
            throw insertError;
          }
        }
      }

      // 刪除現有的排除通路
      await client.query('DELETE FROM scheme_channel_exclusions WHERE scheme_id = $1', [id]);

      // 批量插入排除通路
      if (exclusions && Array.isArray(exclusions) && exclusions.length > 0) {
        const validExclusions = exclusions.filter((channelId: any) => channelId && typeof channelId === 'string');
        console.log(`[批量更新方案] 準備插入 ${validExclusions.length} 個排除通路`);
        for (let i = 0; i < validExclusions.length; i++) {
          const channelId = validExclusions[i];
          try {
            console.log(`[批量更新方案] 插入排除通路 ${i + 1}/${validExclusions.length}:`, {
              schemeId: id,
              channelId: channelId,
              channelIdType: typeof channelId,
            });
            await client.query(
              `INSERT INTO scheme_channel_exclusions (scheme_id, channel_id)
               VALUES ($1::uuid, $2::uuid)
               ON CONFLICT (scheme_id, channel_id) DO NOTHING`,
              [id, channelId]
            );
          } catch (insertError) {
            console.error(`[批量更新方案] 插入排除通路失敗 (第 ${i + 1} 個):`, {
              error: insertError,
              errorMessage: (insertError as Error).message,
              errorStack: (insertError as Error).stack,
              schemeId: id,
              channelId: channelId,
            });
            throw insertError;
          }
        }
      }

      // 3. 如果設定了 shared_reward_group_id，則不需要處理回饋組成（使用共用方案的回饋組成）
      // 如果沒有設定 shared_reward_group_id，則保持現有的回饋組成不變

      await client.query('COMMIT');
      res.json({ success: true, message: '方案已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      const err = error as Error;
      console.error('[批量更新方案] 事務錯誤:', {
        error: err,
        message: err.message,
        stack: err.stack,
        schemeId: req.params.id,
        body: JSON.stringify(req.body, null, 2),
      });
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const err = error as Error;
    console.error('[批量更新方案] 外部錯誤:', {
      error: err,
      message: err.message,
      stack: err.stack,
      schemeId: req.params.id,
      body: JSON.stringify(req.body, null, 2),
    });
    res.status(500).json({
      success: false,
      error: err.message,
      details: {
        schemeId: req.params.id,
        errorType: err.constructor.name,
        errorMessage: err.message,
        // 只在開發環境顯示 stack
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
      },
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

    const hasSharedRewardGroupColumn = await ensureCardSchemeColumn('shared_reward_group_id');
    const selectColumns = [
      'id',
      'name',
      'note',
      'requires_switch',
      'activity_start_date',
      'activity_end_date',
      'display_order',
      hasSharedRewardGroupColumn ? 'shared_reward_group_id' : 'NULL::uuid as shared_reward_group_id',
    ].join(', ');

    // 取得方案基本資訊
    const schemeResult = await pool.query(
      `SELECT ${selectColumns}
       FROM card_schemes
       WHERE id = $1`,
      [id]
    );

    if (schemeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '方案不存在' });
    }

    const scheme = schemeResult.rows[0];

    // 取得回饋組成（如果設定了 shared_reward_group_id，則從該方案取得；否則從自己取得）
    const targetSchemeId =
      hasSharedRewardGroupColumn && scheme.shared_reward_group_id ? scheme.shared_reward_group_id : id;
    const rewardsResult = await pool.query(
      `SELECT id, reward_percentage, calculation_method, quota_limit, 
              quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order
       FROM scheme_rewards
       WHERE scheme_id = $1
       ORDER BY display_order`,
      [targetSchemeId]
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

      // 批量插入適用通路
      if (Array.isArray(applications) && applications.length > 0) {
        const validApps = applications.filter((app: any) => app && app.channelId);
        console.log(`[更新方案通路] 準備插入 ${validApps.length} 個適用通路`);
        for (let i = 0; i < validApps.length; i++) {
          const app = validApps[i];
          try {
            const params = [id, app.channelId, app.note || null];
            console.log(`[更新方案通路] 插入適用通路 ${i + 1}/${validApps.length}:`, {
              schemeId: id,
              channelId: app.channelId,
              note: app.note || null,
            });
            await client.query(
              `INSERT INTO scheme_channel_applications (scheme_id, channel_id, note)
               VALUES ($1::uuid, $2::uuid, $3::text)
               ON CONFLICT (scheme_id, channel_id) DO UPDATE SET note = EXCLUDED.note`,
              params
            );
          } catch (insertError) {
            console.error(`[更新方案通路] 插入適用通路失敗 (第 ${i + 1} 個):`, {
              error: insertError,
              errorMessage: (insertError as Error).message,
              app: app,
            });
            throw insertError;
          }
        }
      }

      // 刪除現有的排除通路
      await client.query('DELETE FROM scheme_channel_exclusions WHERE scheme_id = $1', [id]);

      // 批量插入排除通路
      if (Array.isArray(exclusions) && exclusions.length > 0) {
        const validExclusions = exclusions.filter((channelId: any) => channelId && typeof channelId === 'string');
        console.log(`[更新方案通路] 準備插入 ${validExclusions.length} 個排除通路`);
        for (let i = 0; i < validExclusions.length; i++) {
          const channelId = validExclusions[i];
          try {
            console.log(`[更新方案通路] 插入排除通路 ${i + 1}/${validExclusions.length}:`, {
              schemeId: id,
              channelId: channelId,
            });
            await client.query(
              `INSERT INTO scheme_channel_exclusions (scheme_id, channel_id)
               VALUES ($1::uuid, $2::uuid)
               ON CONFLICT (scheme_id, channel_id) DO NOTHING`,
              [id, channelId]
            );
          } catch (insertError) {
            console.error(`[更新方案通路] 插入排除通路失敗 (第 ${i + 1} 個):`, {
              error: insertError,
              errorMessage: (insertError as Error).message,
              channelId: channelId,
            });
            throw insertError;
          }
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, message: '通路設定已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      const err = error as Error;
      console.error('[更新方案通路] 事務錯誤:', {
        error: err,
        message: err.message,
        stack: err.stack,
        schemeId: req.params.id,
      });
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const err = error as Error;
    console.error('[更新方案通路] 外部錯誤:', {
      error: err,
      message: err.message,
      stack: err.stack,
      schemeId: req.params.id,
      body: JSON.stringify(req.body, null, 2),
    });
    res.status(500).json({
      success: false,
      error: err.message,
      details: {
        schemeId: req.params.id,
        errorType: err.constructor.name,
        errorMessage: err.message,
        // 只在開發環境顯示 stack
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
      },
    });
  }
});

// 新增方案的回饋組成
router.post('/:id/rewards', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rewardPercentage, calculationMethod, quotaLimit, quotaRefreshType, quotaRefreshValue, quotaRefreshDate, displayOrder } = req.body;

    if (!rewardPercentage || parseFloat(rewardPercentage) <= 0) {
      return res.status(400).json({ success: false, error: '回饋百分比必填且必須大於 0' });
    }

    const result = await pool.query(
      `INSERT INTO scheme_rewards 
       (scheme_id, reward_percentage, calculation_method, quota_limit, 
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

      // 批量插入回饋組成（優化：使用 UNNEST 批量插入）
      if (rewards.length > 0) {
        const validRewards = rewards.filter((r: any) => r.percentage !== undefined);
        if (validRewards.length > 0) {
          // 使用 UNNEST 進行批量插入
          const percentages = validRewards.map((r: any) => parseFloat(r.percentage) || 0);
          const calculationMethods = validRewards.map((r: any) => String(r.calculationMethod || 'round'));
          const quotaLimits = validRewards.map((r: any) => (r.quotaLimit !== null && r.quotaLimit !== undefined) ? parseFloat(r.quotaLimit) : null);
          const quotaRefreshTypes = validRewards.map((r: any) => (r.quotaRefreshType ? String(r.quotaRefreshType) : null));
          const quotaRefreshValues = validRewards.map((r: any) => (r.quotaRefreshValue !== null && r.quotaRefreshValue !== undefined) ? parseInt(String(r.quotaRefreshValue)) : null);
          const quotaRefreshDates = validRewards.map((r: any) => (r.quotaRefreshDate ? String(r.quotaRefreshDate) : null));
          const displayOrders = validRewards.map((r: any, idx: number) => (r.displayOrder !== undefined && r.displayOrder !== null) ? parseInt(String(r.displayOrder)) : idx);

          await client.query(
            `INSERT INTO scheme_rewards 
             (scheme_id, reward_percentage, calculation_method, quota_limit, 
              quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order)
             SELECT $1::uuid, unnest($2::numeric[]), unnest($3::text[]), unnest($4::numeric[]),
                    unnest($5::text[]), unnest($6::integer[]), unnest($7::date[]), unnest($8::integer[])`,
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

// 更新單個回饋組成
router.put('/:id/rewards/:rewardId', async (req: Request, res: Response) => {
  try {
    const { id, rewardId } = req.params;
    const { rewardPercentage, calculationMethod, quotaLimit, quotaRefreshType, quotaRefreshValue, quotaRefreshDate } = req.body;

    // 檢查方案是否存在，並取得實際的方案ID（如果設定了 shared_reward_group_id，則更新該方案的回饋組成）
    const hasSharedRewardGroupColumn = await ensureCardSchemeColumn('shared_reward_group_id');
    const selectColumns = [
      'id',
      hasSharedRewardGroupColumn ? 'shared_reward_group_id' : 'NULL::uuid as shared_reward_group_id',
    ].join(', ');
    const schemeResult = await pool.query(
      `SELECT ${selectColumns} FROM card_schemes WHERE id = $1`,
      [id]
    );

    if (schemeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '方案不存在' });
    }

    const scheme = schemeResult.rows[0];
    const targetSchemeId =
      hasSharedRewardGroupColumn && scheme.shared_reward_group_id ? scheme.shared_reward_group_id : id;

    // 更新回饋組成
    const result = await pool.query(
      `UPDATE scheme_rewards
       SET reward_percentage = $1, calculation_method = $2, quota_limit = $3,
           quota_refresh_type = $4, quota_refresh_value = $5, quota_refresh_date = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND scheme_id = $8
       RETURNING id`,
      [
        rewardPercentage,
        calculationMethod || 'round',
        quotaLimit || null,
        quotaRefreshType || null,
        quotaRefreshValue || null,
        quotaRefreshDate || null,
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

