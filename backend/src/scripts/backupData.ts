import fs from 'fs';
import path from 'path';
import { pool } from '../config/database';

async function backupData() {
  let client;
  try {
    console.log('📦 開始備份資料庫...');
    client = await pool.connect();

    // 定義需要備份的表格 (注意順序：先備份無外鍵依賴的表)
    const tables = [
      'reason_strings',
      'transaction_types',
      'channels',
      'cards',
      'payment_methods',
      'card_schemes',       // 依賴 cards
      'scheme_rewards',     // 依賴 card_schemes
      'payment_rewards',    // 依賴 payment_methods
      'scheme_channel_exclusions',   // 依賴 schemes, channels
      'scheme_channel_applications', // 依賴 schemes, channels
      'payment_channel_applications',// 依賴 payments, channels
      'payment_scheme_links',        // 依賴 payments, schemes
      'calculation_schemes',         // 依賴 schemes, payments
      'transactions',                // 依賴 schemes, payments, types
      'quota_trackings'              // 依賴 schemes, payments, rewards
    ];

    const backup: Record<string, any[]> = {};

    for (const table of tables) {
      console.log(`正在備份表格: ${table}...`);
      const result = await client.query(`SELECT * FROM ${table}`);
      backup[table] = result.rows;
    }

    // 確保備份目錄存在
    const backupDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // 寫入檔案
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(backupDir, `backup-${timestamp}.json`);
    
    fs.writeFileSync(filename, JSON.stringify(backup, null, 2));
    console.log(`✅ 資料庫備份成功！檔案位置: ${filename}`);
    console.log(`包含表格: ${Object.keys(backup).join(', ')}`);

  } catch (error) {
    console.error('❌ 備份失敗:', error);
  } finally {
    if (client) client.release();
    // 結束 process 讓腳本執行完後退出
    process.exit();
  }
}

// 執行備份
backupData();