import cron from 'node-cron';
import { pool } from '../config/database';
import { shouldRefreshQuota, calculateNextRefreshTime } from '../utils/quotaRefresh';

/**
 * 執行額度刷新檢查
 */
async function checkAndRefreshQuotas() {
  try {
    // 先測試資料庫連接
    try {
      await pool.query('SELECT 1');
    } catch (dbError: any) {
      // 資料庫連接失敗，跳過本次檢查
      if (dbError.code === 'ECONNREFUSED' || dbError.code === 'ENOTFOUND') {
        // 只在第一次失敗時顯示詳細提示，避免日誌過多
        const errorKey = `db_connection_error_${dbError.code}`;
        if (!(global as any)[errorKey]) {
          console.warn(`[${new Date().toISOString()}] ⚠️  資料庫連接失敗，跳過本次額度刷新檢查`);
          console.warn(`💡 提示：請確保資料庫服務正在運行`);
          console.warn(`   - 如果使用 Docker: 請確保 Docker Desktop 已完全啟動，然後執行 docker-compose up -d postgres`);
          console.warn(`   - 或啟動所有服務: docker-compose up -d`);
          console.warn(`   - 定時任務會在資料庫可用時自動恢復`);
          (global as any)[errorKey] = true;
          // 5分鐘後重置標記，以便再次顯示提示
          setTimeout(() => {
            (global as any)[errorKey] = false;
          }, 5 * 60 * 1000);
        }
        return; // 優雅退出，不拋出錯誤
      }
      throw dbError; // 其他錯誤繼續拋出
    }
    
    // 先檢查資料表是否存在
    const tableCheckResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'card_schemes'
      ) as table_exists
    `);
    
    if (!tableCheckResult.rows[0]?.table_exists) {
      console.log(`[${new Date().toISOString()}] ⚠️  資料表尚未初始化，跳過額度刷新檢查`);
      console.log(`💡 提示：請先訪問 /api/seed/schema 初始化資料庫結構`);
      return; // 優雅退出，不拋出錯誤
    }

    // 取得所有需要檢查的額度
    const schemeQuotasResult = await pool.query(
      `SELECT 
         cs.id as scheme_id,
         NULL::uuid as payment_method_id,
         sr.id as reward_id,
         sr.quota_limit,
         sr.quota_refresh_type,
         sr.quota_refresh_value,
         sr.quota_refresh_date,
         cs.activity_end_date,
         qt.used_quota,
         qt.next_refresh_at
       FROM card_schemes cs
       JOIN scheme_rewards sr ON cs.id = sr.scheme_id
       LEFT JOIN quota_trackings qt ON cs.id = qt.scheme_id 
         AND sr.id = qt.reward_id 
         AND qt.payment_method_id IS NULL
       WHERE qt.next_refresh_at IS NOT NULL
       UNION ALL
       SELECT 
         cs.id as scheme_id,
         pm.id as payment_method_id,
         sr.id as reward_id,
         sr.quota_limit,
         sr.quota_refresh_type,
         sr.quota_refresh_value,
         sr.quota_refresh_date,
         cs.activity_end_date,
         qt.used_quota,
         qt.next_refresh_at
       FROM payment_scheme_links psl
       JOIN card_schemes cs ON psl.scheme_id = cs.id
       JOIN payment_methods pm ON psl.payment_method_id = pm.id
       JOIN scheme_rewards sr ON cs.id = sr.scheme_id
       LEFT JOIN quota_trackings qt ON cs.id = qt.scheme_id 
         AND pm.id = qt.payment_method_id
         AND sr.id = qt.reward_id
       WHERE qt.next_refresh_at IS NOT NULL
       UNION ALL
       SELECT 
         NULL::uuid as scheme_id,
         pm.id as payment_method_id,
         COALESCE(pr.id, NULL::uuid) as reward_id,
         pr.quota_limit,
         pr.quota_refresh_type,
         pr.quota_refresh_value,
         pr.quota_refresh_date,
         NULL::date as activity_end_date,
         qt.used_quota,
         qt.next_refresh_at
       FROM payment_methods pm
       LEFT JOIN payment_rewards pr ON pm.id = pr.payment_method_id
       LEFT JOIN quota_trackings qt ON pm.id = qt.payment_method_id 
         AND (pr.id = qt.payment_reward_id OR (pr.id IS NULL AND qt.payment_reward_id IS NULL))
         AND qt.scheme_id IS NULL
       WHERE qt.next_refresh_at IS NOT NULL`
    );

    const client = await pool.connect();
    let refreshedCount = 0;

    try {
      for (const quota of schemeQuotasResult.rows) {
        if (quota.next_refresh_at && shouldRefreshQuota(quota.next_refresh_at)) {
          // 需要刷新：重置額度
          const nextRefresh = calculateNextRefreshTime(
            quota.quota_refresh_type,
            quota.quota_refresh_value,
            quota.quota_refresh_date
              ? quota.quota_refresh_date.toISOString().split('T')[0]
              : null,
            quota.activity_end_date
              ? quota.activity_end_date.toISOString().split('T')[0]
              : null
          );

          const quotaLimit = quota.quota_limit ? parseFloat(quota.quota_limit) : null;

          if (quota.scheme_id && !quota.payment_method_id) {
            // 卡片方案的回饋組成
            await client.query(
              `UPDATE quota_trackings
               SET used_quota = 0,
                   remaining_quota = $1,
                   current_amount = 0,
                   next_refresh_at = $2,
                   last_refresh_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE scheme_id = $3 
                 AND payment_method_id IS NULL
                 AND reward_id = $4
                 AND payment_reward_id IS NULL`,
              [quotaLimit, nextRefresh, quota.scheme_id, quota.reward_id]
            );
            refreshedCount++;
          } else if (quota.scheme_id && quota.payment_method_id) {
            // 支付方式綁定卡片方案
            await client.query(
              `UPDATE quota_trackings
               SET used_quota = 0,
                   remaining_quota = $1,
                   current_amount = 0,
                   next_refresh_at = $2,
                   last_refresh_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE scheme_id = $3 
                 AND payment_method_id = $4
                 AND reward_id = $5
                 AND payment_reward_id IS NULL`,
              [quotaLimit, nextRefresh, quota.scheme_id, quota.payment_method_id, quota.reward_id]
            );
            refreshedCount++;
          } else if (quota.payment_method_id && quota.reward_id) {
            // 支付方式的回饋組成
            await client.query(
              `UPDATE quota_trackings
               SET used_quota = 0,
                   remaining_quota = $1,
                   current_amount = 0,
                   next_refresh_at = $2,
                   last_refresh_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE payment_method_id = $3 
                 AND payment_reward_id = $4
                 AND scheme_id IS NULL`,
              [quotaLimit, nextRefresh, quota.payment_method_id, quota.reward_id]
            );
            refreshedCount++;
          }
        }
      }
    } finally {
      client.release();
    }

    if (refreshedCount > 0) {
      console.log(`[${new Date().toISOString()}] 已刷新 ${refreshedCount} 個額度`);
    }
  } catch (error: any) {
    // 如果是資料庫連接錯誤，給出更清楚的提示
    if (error.code === 'ENOTFOUND' && error.hostname === 'postgres') {
      console.error(`[${new Date().toISOString()}] 額度刷新檢查失敗: 無法連接到資料庫`);
      console.error(`💡 提示：在本地開發環境中，請確保：`);
      console.error(`   1. 資料庫服務正在運行（Docker Compose 或本地 PostgreSQL）`);
      console.error(`   2. 設定環境變數 DATABASE_URL 指向正確的資料庫主機（本地使用 localhost:5433）`);
      console.error(`   3. 或設定 DOCKER_ENV=true 如果運行在 Docker 環境中`);
    } else {
      console.error(`[${new Date().toISOString()}] 額度刷新檢查失敗:`, error.message || error);
    }
  }
}

/**
 * 啟動額度刷新定時任務
 * 每分鐘檢查一次（UTC+8 時區），確保在刷新時間到達時立即執行
 */
export function startQuotaRefreshScheduler() {
  // 每分鐘執行一次檢查，確保在刷新時間到達時立即刷新
  // 使用 '*/1 * * * *' 表示每分鐘執行一次
  cron.schedule('*/1 * * * *', async () => {
    await checkAndRefreshQuotas();
  }, {
    timezone: 'Asia/Taipei'
  });

  console.log('💡 額度刷新定時任務已啟動（每分鐘檢查一次，時區：UTC+8）');
  console.log('💡 如果資料庫服務未運行，定時任務會自動跳過檢查，不會影響服務運行');
  
  // 啟動時延遲執行一次檢查（給資料庫一些啟動時間）
  setTimeout(() => {
    checkAndRefreshQuotas();
  }, 5000); // 延遲 5 秒執行，給資料庫啟動時間
}

