-- 為支付方式添加回饋組成表（類似 scheme_rewards）
CREATE TABLE IF NOT EXISTS payment_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
    reward_percentage DECIMAL(5,2) NOT NULL, -- 回饋%數，例如 0.3, 2.7, 3.0
    calculation_method VARCHAR(20) NOT NULL CHECK (calculation_method IN ('round', 'floor', 'ceil')), 
    -- round: 四捨五入, floor: 無條件捨去, ceil: 無條件進位
    quota_limit DECIMAL(12,2), -- 額度上限，NULL 表示無上限
    quota_refresh_type VARCHAR(20) CHECK (quota_refresh_type IN ('monthly', 'date', 'activity')), 
    -- monthly: 每月固定日期, date: 指定日期, activity: 活動結束日
    quota_refresh_value INTEGER, -- 每月幾號或日期（根據 refresh_type 解釋）
    quota_refresh_date DATE, -- 指定日期刷新（當 refresh_type = 'date' 時使用）
    display_order INTEGER NOT NULL DEFAULT 0, -- 顯示順序
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 更新 quota_trackings 表以支援支付方式的回饋組成
-- 添加 payment_reward_id 欄位（用於純支付方式的回饋組成）
ALTER TABLE quota_trackings 
ADD COLUMN IF NOT EXISTS payment_reward_id UUID REFERENCES payment_rewards(id) ON DELETE CASCADE;

-- 修改 UNIQUE 約束以支援兩種 reward_id
-- 先刪除舊的約束（如果存在）
ALTER TABLE quota_trackings DROP CONSTRAINT IF EXISTS quota_trackings_scheme_id_payment_method_id_reward_id_key;

-- 添加新的約束：scheme_id + payment_method_id + reward_id 或 payment_method_id + payment_reward_id
-- 注意：PostgreSQL 不支援條件 UNIQUE 約束，所以我們使用檢查約束
ALTER TABLE quota_trackings 
ADD CONSTRAINT quota_trackings_unique_check 
CHECK (
  (scheme_id IS NOT NULL AND reward_id IS NOT NULL) OR
  (payment_method_id IS NOT NULL AND payment_reward_id IS NOT NULL AND scheme_id IS NULL)
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_payment_rewards_payment_method_id ON payment_rewards(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_rewards_display_order ON payment_rewards(display_order);
CREATE INDEX IF NOT EXISTS idx_quota_trackings_payment_reward_id ON quota_trackings(payment_reward_id);

-- 添加觸發器
DROP TRIGGER IF EXISTS update_payment_rewards_updated_at ON payment_rewards;
CREATE TRIGGER update_payment_rewards_updated_at BEFORE UPDATE ON payment_rewards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

