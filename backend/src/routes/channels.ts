import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { matchesChannelName } from '../utils/channelUtils';
import { logger } from '../utils/logger';
import { validate } from '../middleware/validate';
import { createChannelSchema } from '../utils/validators';

const router = Router();

type ChannelRow = {
  id: string;
  name: string;
  is_common: boolean;
  display_order: number;
};

const buildChannelMatches = (keyword: string, channels: ChannelRow[]) => {
  const matches: Array<{ channel: ChannelRow; matchScore: number }> = [];
  for (const channel of channels) {
    const match = matchesChannelName(keyword, channel.name);
    if (match.matched) {
      let score = 3;
      if (match.isExact) {
        score = match.isAlias ? 1 : 0;
      } else if (match.isAlias) {
        score = 2;
      }
      matches.push({
        channel,
        matchScore: score,
      });
    }
  }

  matches.sort((a, b) => {
    if (a.matchScore !== b.matchScore) {
      return a.matchScore - b.matchScore;
    }
    return a.channel.display_order - b.channel.display_order;
  });

  return matches.map(({ channel }) => channel);
};

// 取得所有通路
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { commonOnly } = req.query;

    let query = 'SELECT id, name, is_common, display_order FROM channels';
    const params: any[] = [];

    if (commonOnly === 'true') {
      query += ' WHERE is_common = true';
    }

    query += ' ORDER BY display_order, created_at';

    const result = await pool.query(query, params);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('❌ 取得通路錯誤:', error);
    return next(error);
  }
});

// 根據名稱查詢通路（用於手動輸入，支持別稱）
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ success: false, error: '請提供通路名稱' });
    }

    // 獲取所有通路並使用改進的匹配邏輯
    const allChannelsResult = await pool.query(
      'SELECT id, name, is_common, display_order FROM channels ORDER BY name'
    );

    const matches = buildChannelMatches(name as string, allChannelsResult.rows as ChannelRow[]);
    const result = matches.map(({ id, name, is_common, display_order }) => ({
      id,
      name,
      is_common,
      display_order,
    }));

    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error('搜尋通路錯誤:', error);
    return next(error);
  }
});

// 批次解析或建立通路
router.post('/batch-resolve', async (req: Request, res: Response, next: NextFunction) => {
  const { items, createIfMissing = true } = req.body as {
    items?: Array<{ name?: string }>;
    createIfMissing?: boolean;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items 必須為非空陣列' });
  }

  const normalizedItems = items
    .map((item) => ({
      name: (typeof item?.name === 'string' ? item.name : '').trim(),
    }))
    .filter((item) => item.name.length > 0);

  if (normalizedItems.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const allChannelsResult = await client.query(
      'SELECT id, name, is_common, display_order FROM channels ORDER BY name'
    );
    const channels = allChannelsResult.rows as ChannelRow[];
    const cache = new Map<string, ChannelRow>();
    const responses: Array<{ inputName: string; channelId: string | null; channelName: string | null }> = [];

    for (const item of normalizedItems) {
      const inputName = item.name;
      const cacheKey = inputName.toLowerCase();

      if (cache.has(cacheKey)) {
        const cachedChannel = cache.get(cacheKey)!;
        responses.push({
          inputName,
          channelId: cachedChannel.id,
          channelName: cachedChannel.name,
        });
        continue;
      }

      const matches = buildChannelMatches(inputName, channels);
      let resolvedChannel: ChannelRow | null = matches.length > 0 ? matches[0] : null;

      if (!resolvedChannel && createIfMissing) {
        const insertResult = await client.query(
          `INSERT INTO channels (name, is_common, display_order)
           VALUES ($1, false, 0)
           RETURNING id, name, is_common, display_order`,
          [inputName]
        );
        resolvedChannel = insertResult.rows[0] as ChannelRow;
        channels.push(resolvedChannel);
      }

      if (resolvedChannel) {
        cache.set(cacheKey, resolvedChannel);
        responses.push({
          inputName,
          channelId: resolvedChannel.id,
          channelName: resolvedChannel.name,
        });
      } else {
        responses.push({
          inputName,
          channelId: null,
          channelName: null,
        });
      }
    }

    await client.query('COMMIT');
    return res.json({ success: true, data: responses });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('批次解析通路錯誤:', error);
    return next(error);
  } finally {
    client.release();
  }
});

// 新增通路
router.post('/', validate(createChannelSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, isCommon, displayOrder } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: '通路名稱必填' });
    }

    const result = await pool.query(
      `INSERT INTO channels (name, is_common, display_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, is_common, display_order`,
      [name, isCommon || false, displayOrder || 0]
    );

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('新增通路失敗:', error);
    return next(error);
  }
});

// 更新通路
router.put('/:id', validate(createChannelSchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, isCommon, displayOrder } = req.body;

    const result = await pool.query(
      `UPDATE channels
       SET name = $1, is_common = $2, display_order = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, name, is_common, display_order`,
      [name, isCommon || false, displayOrder, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '通路不存在' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error(`更新通路失敗 ID ${req.params.id}:`, error);
    return next(error);
  }
});

// 刪除通路
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM channels WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '通路不存在' });
    }

    return res.json({ success: true, message: '通路已刪除' });
  } catch (error) {
    logger.error(`刪除通路失敗 ID ${req.params.id}:`, error);
    return next(error);
  }
});

export default router;

