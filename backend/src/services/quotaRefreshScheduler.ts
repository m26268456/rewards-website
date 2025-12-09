import cron from 'node-cron';
import { pool } from '../config/database';
import { shouldRefreshQuota, calculateNextRefreshTime } from '../utils/quotaRefresh';
import { logger } from '../utils/logger';

/**
 * 執行額度刷新檢查
 */
async function checkAndRefreshQuotas() {
  const startedAt = Date.now();
  const startedIso = new Date().toISOString();
  let refreshedCount = 0;
  logger.info(`[quota-refresh] start at ${startedIso}`);

  try {
    // 先測試資料庫連接
    try {
      await pool.query('SELECT 1');
    } catch (dbError: any) {
      if (dbError.code === 'ECONNREFUSED' || dbError.code === 'ENOTFOUND') {
        const errorKey = `db_connection_error_${dbError.code}`;
        if (!(global as any)[errorKey]) {
          logger.warn(`[${new Date().toISOString()}] ⚠️  資料庫連接失敗，跳過本次額度刷新檢查`);
          (global as any)[errorKey] = true;
          setTimeout(() => {
            (global as any)[errorKey] = false;
          }, 5 * 60 * 1000);
        }
        return;
      }
      throw dbError;
    }
    
    // 檢查資料表是否存在
    const tableCheckResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'card_schemes'
      ) as table_exists
    `);
    
    if (!tableCheckResult.rows[0]?.table_exists) {
      return;
    }

    // 取得所有有設定 next_refresh_at 的額度追蹤記錄
    // 我們需要關聯回去取得刷新規則設定 (quota_refresh_type, quota_refresh_value 等)
    // 這裡分為三種情況：
    // 1. 卡片方案回饋 (scheme_id NOT NULL, payment_method_id NULL)
    // 2. 支付方式綁定方案 (scheme_id NOT NULL, payment_method_id NOT NULL) -> 您的需求中此項可能已簡化，但 SQL 需涵蓋
    // 3. 純支付方式回饋 (scheme_id NULL, payment_method_id NOT NULL)

    const quotasResult = await pool.query(`
      -- 1. 卡片方案回饋
      SELECT 
        qt.id as tracking_id,
        qt.scheme_id,
        NULL::uuid as payment_method_id,
        qt.reward_id,
        NULL::uuid as payment_reward_id,
        qt.next_refresh_at,
        sr.quota_limit,
        sr.quota_refresh_type,
        sr.quota_refresh_value,
        sr.quota_refresh_date,
        cs.activity_end_date
      FROM quota_trackings qt
      JOIN card_schemes cs ON qt.scheme_id = cs.id
      JOIN scheme_rewards sr ON qt.reward_id = sr.id
      WHERE qt.next_refresh_at IS NOT NULL 
        AND qt.scheme_id IS NOT NULL 
        AND qt.payment_method_id IS NULL

      UNION ALL

      -- 2. 純支付方式回饋
      SELECT 
        qt.id as tracking_id,
        NULL::uuid as scheme_id,
        qt.payment_method_id,
        NULL::uuid as reward_id,
        qt.payment_reward_id,
        qt.next_refresh_at,
        pr.quota_limit,
        pr.quota_refresh_type,
        pr.quota_refresh_value,
        pr.quota_refresh_date,
        NULL::date as activity_end_date
      FROM quota_trackings qt
      JOIN payment_rewards pr ON qt.payment_reward_id = pr.id
      WHERE qt.next_refresh_at IS NOT NULL 
        AND qt.scheme_id IS NULL
        AND qt.payment_method_id IS NOT NULL
    `);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const quota of quotasResult.rows) {
        // 檢查是否到達刷新時間（轉成 Date 避免字串時區問題）
        const nextRefreshAt = quota.next_refresh_at ? new Date(quota.next_refresh_at) : null;
        if (nextRefreshAt && shouldRefreshQuota(nextRefreshAt)) {
          // 計算下一次刷新時間
          const nextRefresh = calculateNextRefreshTime(
            quota.quota_refresh_type,
            quota.quota_refresh_value,
            quota.quota_refresh_date
              ? (quota.quota_refresh_date instanceof Date ? quota.quota_refresh_date.toISOString().split('T')[0] : quota.quota_refresh_date)
              : null,
            quota.activity_end_date
              ? (quota.activity_end_date instanceof Date ? quota.activity_end_date.toISOString().split('T')[0] : quota.activity_end_date)
              : null
          );

          const quotaLimit = quota.quota_limit ? parseFloat(quota.quota_limit) : null;

          // 執行刷新：重置已用額度、更新剩餘額度、設定下次刷新時間
          await client.query(
            `UPDATE quota_trackings
             SET used_quota = 0,
                 remaining_quota = $1,
                 current_amount = 0,
                 next_refresh_at = $2,
                 last_refresh_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [quotaLimit, nextRefresh, quota.tracking_id]
          );
          
          refreshedCount++;
        }
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('額度刷新交易失敗:', error);
    } finally {
      client.release();
    }
    
    const elapsed = Date.now() - startedAt;
    logger.info(`[quota-refresh] done at ${new Date().toISOString()}, refreshed=${refreshedCount}, elapsed=${elapsed}ms`);
  } catch (error: any) {
    const elapsed = Date.now() - startedAt;
    if (error.code === 'ENOTFOUND' && error.hostname === 'postgres') {
      // 忽略
    } else {
      logger.error(`[quota-refresh] failed after ${elapsed}ms:`, error.message || error);
    }
  }
}

/**
 * 啟動額度刷新定時任務
 */
export function startQuotaRefreshScheduler() {
  // 每分鐘執行一次
  cron.schedule('*/5 * * * *', async () => {
    await checkAndRefreshQuotas();
  }, {
    timezone: 'Asia/Taipei'
  });

  console.log('💡 額度刷新定時任務已啟動（每 5 分鐘檢查一次，時區：UTC+8）');
  
  // 啟動時延遲執行一次檢查
  setTimeout(() => {
    checkAndRefreshQuotas();
  }, 5000);
}