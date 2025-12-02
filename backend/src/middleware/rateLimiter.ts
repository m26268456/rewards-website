import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 限制每個 IP 在 15 分鐘內最多 100 次請求
  message: '請求過於頻繁，請稍後再試',
  standardHeaders: true,
  legacyHeaders: false,
});

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 嚴格限制的操作（如寫入操作）
  message: '操作過於頻繁，請稍後再試',
  standardHeaders: true,
  legacyHeaders: false,
});

