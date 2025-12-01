import { Router, Request, Response } from 'express';
import { pool } from '../config/database';

const router = Router();

// 取得所有卡片（用於管理設定）
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, name, note, display_order FROM cards ORDER BY display_order, created_at'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 新增卡片
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, note, displayOrder } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: '卡片名稱必填' });
    }

    const result = await pool.query(
      `INSERT INTO cards (name, note, display_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, note, display_order`,
      [name, note || null, displayOrder || 0]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新卡片
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, note, displayOrder } = req.body;

    const result = await pool.query(
      `UPDATE cards
       SET name = $1, note = $2, display_order = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, name, note, display_order`,
      [name, note || null, displayOrder, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '卡片不存在' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 刪除卡片
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM cards WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '卡片不存在' });
    }

    res.json({ success: true, message: '卡片已刪除' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;


