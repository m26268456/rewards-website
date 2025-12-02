import { Pool } from 'pg';
import dotenv from 'dotenv';
import { env } from './env';

dotenv.config();

// 確保 DATABASE_URL 正確
// Railway 會自動提供 DATABASE_URL 環境變數，優先使用它
// 如果沒有設定環境變數，根據運行環境自動選擇主機名
let databaseUrl = process.env.DATABASE_URL;
const isDocker = process.env.DOCKER_ENV === 'true' || process.env.DATABASE_URL?.includes('@postgres:');
const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;

if (!databaseUrl) {
  // 檢測是否在 Docker 環境中
  // 在本地開發環境使用 localhost:5433，在 Docker 環境使用 postgres:5432
  const dbHost = isDocker ? 'postgres' : 'localhost';
  const dbPort = isDocker ? '5432' : '5433'; // Docker 內部用 5432，本地映射到 5433
  databaseUrl = `postgresql://rewards_user:rewards_password@${dbHost}:${dbPort}/rewards_db`;
} else {
  // Railway 環境：直接使用提供的 DATABASE_URL，不需要修改
  if (isRailway) {
    console.log('✅ 使用 Railway 提供的 DATABASE_URL');
  }
  // 如果設定了 DATABASE_URL，但主機名是 postgres 且不在 Docker 環境，嘗試替換為 localhost
  else if (databaseUrl.includes('@postgres:') && !isDocker) {
    // 替換 postgres:5432 為 localhost:5433
    databaseUrl = databaseUrl.replace('@postgres:5432', '@localhost:5433');
    console.warn('⚠️  已將資料庫主機從 postgres:5432 改為 localhost:5433（本地開發環境）');
  }
}

// 確保數據庫名稱正確（不應該是 rewards_user，但用戶名應該是 rewards_user）
// 只替換最後的數據庫名稱部分，不替換用戶名
if (databaseUrl.match(/\/rewards_user$/)) {
  databaseUrl = databaseUrl.replace(/\/rewards_user$/, '/rewards_db');
  console.warn('⚠️  修正了數據庫名稱從 rewards_user 到 rewards_db');
}

console.log('📊 資料庫連接字串:', databaseUrl.replace(/:[^:@]+@/, ':****@')); // 隱藏密碼

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
});

// 測試資料庫連線
pool.on('connect', () => {
  console.log('✅ 資料庫連線成功');
});

pool.on('error', (err) => {
  console.error('❌ 資料庫連線錯誤:', err);
});

