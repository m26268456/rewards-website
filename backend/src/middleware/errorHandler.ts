// path: backend/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// 自定義錯誤類別 (選用，方便之後擴充)
export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // 記錄錯誤日誌 (包含請求路徑與方法)
  logger.error(`Error processing ${req.method} ${req.url}:`, err.message);

  // 判斷是否為我們已知定義的錯誤
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // 資料庫相關錯誤 (例如違反唯一性限制)
  if ((err as any).code === '23505') {
      return res.status(409).json({
          status: 'error',
          message: '資料已存在 (Duplicate entry)',
      });
  }

  // 預設為 500 伺服器內部錯誤
  const statusCode = 500;
  const message = 'Internal Server Error';

  // 在開發環境回傳詳細錯誤堆疊 (Stack Trace)
  return res.status(statusCode).json({
    status: 'error',
    message: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};