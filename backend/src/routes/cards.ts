import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { validate } from '../middleware/validate';
import { createCardSchema } from '../utils/validators';

const router = Router();

// 取得所有卡片（用於管理設定）
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'SELECT id, name, note, display_order FROM cards ORDER BY display_order, created_at'
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('取得卡片列表失敗:', error);
    return next(error);
  }
});

// 新增卡片
router.post('/', validate(createCardSchema), async (req: Request, res: Response, next: NextFunction) => {
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

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('新增卡片失敗:', error);
    return next(error);
  }
});

// 更新卡片
router.put('/:id', validate(createCardSchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
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

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error(`更新卡片失敗 ID ${req.params.id}:`, error);
    return next(error);
  }
});

// 刪除卡片
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM cards WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '卡片不存在' });
    }

    return res.json({ success: true, message: '卡片已刪除' });
  } catch (error) {
    logger.error(`刪除卡片失敗 ID ${req.params.id}:`, error);
    return next(error);
  }
});

export default router;


