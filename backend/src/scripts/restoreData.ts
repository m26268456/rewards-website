import fs from 'fs';
import path from 'path';
import { pool } from '../config/database';

// 讀取命令列提供之備份檔路徑
const backupFile = process.argv[2];

async function restoreData() {
  if (!backupFile) {
    console.error('❌ 請提供備份檔案路徑，例如: npm run restore backups/backup-xxx.json');
    process.exit(1);
  }

  let client;
  try {
    const fullPath = path.resolve(process.cwd(), backupFile);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`找不到檔案: ${fullPath}`);
    }

    console.log(`📦 讀取備份檔案: ${fullPath}...`);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    
    client = await pool.connect();
    await client.query('BEGIN');
    console.log('✅ 開始還原資料 (Transaction Started)');

    // 按資料表的依賴順序，逐一清空資料內容
    const tablesToDelete = [
      'quota_trackings',
      'transactions',
      'calculation_schemes',
      'payment_scheme_links',
      'payment_channel_applications',
      'scheme_channel_applications',
      'scheme_channel_exclusions',
      'scheme_rewards',
      'payment_rewards',
      'card_schemes',
      'payment_methods',
      'cards',
      'channels',
      'transaction_types',
      'reason_strings'
    ];

    console.log('🗑️  清空現有資料...');
    for (const table of tablesToDelete) {
      await client.query(`DELETE FROM ${table}`);
    }

// 依照資料依賴順序寫入資料表，順序需配合資料備份檔內容
    const tablesToInsert = [
      'reason_strings',
      'transaction_types',
      'channels',
      'cards',
      'payment_methods',
      'card_schemes',
      'scheme_rewards',
      'payment_rewards',
      'scheme_channel_exclusions',
      'scheme_channel_applications',
      'payment_channel_applications',
      'payment_scheme_links',
      'calculation_schemes',
      'transactions',
      'quota_trackings'
    ];

    for (const table of tablesToInsert) {
      const rows = data[table];
      if (rows && rows.length > 0) {
        console.log(`📝 還原表格 ${table} (${rows.length} 筆)...`);
        
        // 動態生成 INSERT 語句
        const columns = Object.keys(rows[0]);
        const colsStr = columns.map(c => `"${c}"`).join(', '); // 使用引號處理保留字
        
        for (const row of rows) {
          const values = columns.map(c => row[c]);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          
          await client.query(
            `INSERT INTO ${table} (${colsStr}) VALUES (${placeholders})`,
            values
          );
        }
      }
    }

    await client.query('COMMIT');
    console.log('✅ 資料庫還原成功！');

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('❌ 還原失敗 (已回滾):', error);
  } finally {
    if (client) client.release();
    process.exit();
  }
}

restoreData();