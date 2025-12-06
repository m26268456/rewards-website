import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required in .env file'),
  CORS_ORIGINS: z.string().optional(),
});

// 驗證並解析環境變數
const envParsed = envSchema.safeParse(process.env);

if (!envParsed.success) {
  console.error('❌ Invalid environment variables:', envParsed.error.format());
  process.exit(1); // 若環境變數設定錯誤，直接停止伺服器
}

export const env = envParsed.data;