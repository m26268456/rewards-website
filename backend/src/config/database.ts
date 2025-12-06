import { Pool } from 'pg';
import { env } from './env'; // 確保 env.ts 正確匯出環境變數
import { logger } from '../utils/logger';

// 設定 PostgreSQL 連線池
// SSL 配置：根據環境變數決定是否驗證證書
// 某些雲端資料庫（如 Railway、Neon）使用自簽名證書，需要設定 rejectUnauthorized: false
const getSslConfig = () => {
  if (env.NODE_ENV === 'production') {
    // 生產環境：允許自簽名證書（某些雲端服務需要）
    // 可以通過環境變數 DATABASE_SSL_REJECT_UNAUTHORIZED 來控制是否驗證證書
    const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true';
    return { rejectUnauthorized };
  }
  // 開發環境：不使用 SSL
  return false;
};

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: getSslConfig(),
  max: env.NODE_ENV === 'production' ? 20 : 10, // 連線池上限
  idleTimeoutMillis: 30000, // 連線閒置多久關閉
  connectionTimeoutMillis: 5000, // 連線超時設定
});

// 監聽連線錯誤 (避免連線閒置斷開時導致 App 崩潰)
pool.on('error', (err, _client) => {
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

// 同時提供預設與命名匯出，避免匯入方式不一致
export { pool };
export default pool;