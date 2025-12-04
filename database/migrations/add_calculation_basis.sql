-- 新增回饋計算基準欄位 ('transaction' = 單筆, 'statement' = 帳單總額)
-- 預設為 'transaction' 以保持現有行為不變

ALTER TABLE scheme_rewards 
ADD COLUMN IF NOT EXISTS quota_calculation_basis VARCHAR(20) DEFAULT 'transaction' 
CHECK (quota_calculation_basis IN ('transaction', 'statement'));

ALTER TABLE payment_rewards 
ADD COLUMN IF NOT EXISTS quota_calculation_basis VARCHAR(20) DEFAULT 'transaction' 
CHECK (quota_calculation_basis IN ('transaction', 'statement'));