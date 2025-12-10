import { Pool } from 'pg';

async function addPaymentActivityColumns() {
  // 從命令列參數或環境變數取得資料庫 URL
  const dbUrl = process.argv[2] || process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ 錯誤：請提供資料庫 URL');
    console.error('   方式 1: npm run migrate:payment-activity -- "postgresql://..."');
    console.error('   方式 2: 在 .env 檔案中設定 DATABASE_URL');
    process.exit(1);
  }

  // 建立連線池
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  let client;
  try {
    console.log('🔧 開始執行 migration: 新增 payment_methods 活動期間欄位...');
    client = await pool.connect();

    await client.query(`
      ALTER TABLE payment_methods
        ADD COLUMN IF NOT EXISTS activity_start_date DATE,
        ADD COLUMN IF NOT EXISTS activity_end_date DATE;
    `);

    console.log('✅ Migration 執行成功！');
    console.log('   - payment_methods.activity_start_date 已新增');
    console.log('   - payment_methods.activity_end_date 已新增');

  } catch (error) {
    console.error('❌ Migration 執行失敗:', error);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
    process.exit(0);
  }
}

// 執行 migration
addPaymentActivityColumns();

