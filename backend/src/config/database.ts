import { Pool } from 'pg';
import { env } from './env'; // 確保 env.ts 正確匯出環境變數
import { logger } from '../utils/logger';

// 設定 PostgreSQL 連線池
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // 線上資料庫 (如 Railway/Neon) 通常強制要求 SSL 連線
  // 開發環境若無 SSL 可設為 false
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  max: env.NODE_ENV === 'production' ? 20 : 10, // 連線池上限
  idleTimeoutMillis: 30000, // 連線閒置多久關閉
  connectionTimeoutMillis: 5000, // 連線超時設定
});

// 監聽連線錯誤 (避免連線閒置斷開時導致 App 崩潰)
pool.on('error', (err, client) => {
  logger.error('❌ Unexpected error on idle client', err);
});

// 啟動時測試連線
pool.connect()
  .then((client) => {
    logger.info('✅ PostgreSQL connected successfully');
    client.release();
  })
  .catch((err) => {
    logger.error('❌ PostgreSQL connection failed:', err);
  });

export default pool;