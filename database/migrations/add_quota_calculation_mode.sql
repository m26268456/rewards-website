-- 在 scheme_rewards 和 payment_rewards 表中添加 quota_calculation_mode 欄位
-- 這個欄位決定額度計算方式：'per_transaction' (單筆回饋) 或 'total_bill' (帳單總額)
-- 預設為 'per_transaction' (單筆回饋)，保持向後兼容

-- 添加 scheme_rewards 表的 quota_calculation_mode 欄位
ALTER TABLE scheme_rewards 
ADD COLUMN IF NOT EXISTS quota_calculation_mode VARCHAR(20) DEFAULT 'per_transaction' 
CHECK (quota_calculation_mode IN ('per_transaction', 'total_bill'));

-- 添加 payment_rewards 表的 quota_calculation_mode 欄位
ALTER TABLE payment_rewards 
ADD COLUMN IF NOT EXISTS quota_calculation_mode VARCHAR(20) DEFAULT 'per_transaction' 
CHECK (quota_calculation_mode IN ('per_transaction', 'total_bill'));

-- 創建索引以提高查詢效率
CREATE INDEX IF NOT EXISTS idx_scheme_rewards_quota_calculation_mode ON scheme_rewards(quota_calculation_mode);
CREATE INDEX IF NOT EXISTS idx_payment_rewards_quota_calculation_mode ON payment_rewards(quota_calculation_mode);

-- 注意：現有資料的 quota_calculation_mode 預設為 'per_transaction' (單筆回饋)
-- 用戶可以後續在 UI 中手動設定為 'total_bill' (帳單總額)
