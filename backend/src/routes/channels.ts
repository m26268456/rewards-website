import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { parseChannelName, matchesChannelName } from '../utils/channelUtils';

const router = Router();

// 取得所有通路
router.get('/', async (req: Request, res: Response) => {
  try {
    const { commonOnly } = req.query;

    let query = 'SELECT id, name, is_common, display_order FROM channels';
    const params: any[] = [];

    if (commonOnly === 'true') {
      query += ' WHERE is_common = true';
    }

    query += ' ORDER BY display_order, created_at';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ 取得通路錯誤:', error);
    console.error('錯誤堆棧:', (error as Error).stack);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 根據名稱查詢通路（用於手動輸入，支持別稱）
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ success: false, error: '請提供通路名稱' });
    }

    // 獲取所有通路並使用改進的匹配邏輯
    const allChannelsResult = await pool.query(
      "SELECT id, name, is_common, display_order FROM channels ORDER BY name"
    );
    
    const matches: Array<{
      id: string;
      name: string;
      is_common: boolean;
      display_order: number;
      matchScore: number;
    }> = [];
    
    for (const channel of allChannelsResult.rows) {
      const match = matchesChannelName(name as string, channel.name);
      if (match.matched) {
        let score = 3;
        if (match.isExact) {
          score = match.isAlias ? 1 : 0;
        } else if (match.isAlias) {
          score = 2;
        }
        matches.push({
          id: channel.id,
          name: channel.name,
          is_common: channel.is_common,
          display_order: channel.display_order,
          matchScore: score,
        });
      }
    }
    
    // 按匹配分數排序
    matches.sort((a, b) => a.matchScore - b.matchScore);
    
    // 只返回匹配的通路，不包含 matchScore
    const result = matches.map(({ matchScore, ...rest }) => rest);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 新增通路
router.post('/', async (req: Request, res: Response) => {
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

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新通路
router.put('/:id', async (req: Request, res: Response) => {
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

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 刪除通路
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM channels WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '通路不存在' });
    }

    res.json({ success: true, message: '通路已刪除' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;

