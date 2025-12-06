-- 修復額度刷新日期：將所有超過 28 號的設定強制改為 28 號
-- 這是為了避免大小月天數不同導致的刷新邏輯錯誤

BEGIN;

-- 1. 更新 scheme_rewards 表
UPDATE scheme_rewards
SET quota_refresh_value = 28
WHERE quota_refresh_type = 'monthly' 
  AND quota_refresh_value > 28;

-- 2. 更新 payment_rewards 表
UPDATE payment_rewards
SET quota_refresh_value = 28
WHERE quota_refresh_type = 'monthly' 
  AND quota_refresh_value > 28;

COMMIT;