-- Railway PostgreSQL 資料庫初始化腳本
-- 回饋查詢/計算與記帳系統資料庫結構
-- PostgreSQL 15

-- 擴展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. 信用卡與方案相關表
-- ============================================

-- 信用卡表
CREATE TABLE IF NOT EXISTS cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE, -- 例如：台新狗狗卡
    note TEXT, -- 卡片備註
    display_order INTEGER NOT NULL DEFAULT 0, -- 顯示順序
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 卡片方案表
CREATE TABLE IF NOT EXISTS card_schemes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- 例如：好匯刷、刷刷樂
    note TEXT, -- 方案備註
    requires_switch BOOLEAN DEFAULT false, -- 是否需要切換
    activity_start_date DATE, -- 活動開始日期
    activity_end_date DATE, -- 活動結束日期
    display_order INTEGER NOT NULL DEFAULT 0, -- 顯示順序
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(card_id, name)
);

-- 方案回饋組成表（一個方案可以有多個回饋組成）
CREATE TABLE IF NOT EXISTS scheme_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheme_id UUID NOT NULL REFERENCES card_schemes(id) ON DELETE CASCADE,
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

-- ============================================
-- 2. 支付方式相關表
-- ============================================

-- 支付方式表
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE, -- 例如：LINE Pay、全支付
    note TEXT, -- 支付方式備註
    own_reward_percentage DECIMAL(5,2) DEFAULT 0, -- 支付方式本身的回饋%
    display_order INTEGER NOT NULL DEFAULT 0, -- 顯示順序
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 支付方式連結的卡片方案表（多對多關係）
CREATE TABLE IF NOT EXISTS payment_scheme_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
    scheme_id UUID NOT NULL REFERENCES card_schemes(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(payment_method_id, scheme_id)
);

-- 支付方式回饋組成表（類似 scheme_rewards，用於純支付方式的回饋組成）
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

-- ============================================
-- 3. 通路相關表
-- ============================================

-- 通路表
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE, -- 例如：7-11、全家、全聯
    is_common BOOLEAN DEFAULT false, -- 是否為常用通路
    display_order INTEGER NOT NULL DEFAULT 0, -- 常用通路的顯示順序
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 方案排除通路表
CREATE TABLE IF NOT EXISTS scheme_channel_exclusions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheme_id UUID NOT NULL REFERENCES card_schemes(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scheme_id, channel_id)
);

-- 方案適用通路表（含備註）
CREATE TABLE IF NOT EXISTS scheme_channel_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheme_id UUID NOT NULL REFERENCES card_schemes(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    note TEXT, -- 該通路在此方案下的備註
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scheme_id, channel_id)
);

-- 支付方式適用通路表（含備註）
CREATE TABLE IF NOT EXISTS payment_channel_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    note TEXT, -- 該通路在此支付方式下的備註
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(payment_method_id, channel_id)
);

-- ============================================
-- 4. 交易記錄相關表
-- ============================================

-- 交易類型表（需要在 transactions 之前創建）
CREATE TABLE IF NOT EXISTS transaction_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 交易記錄表
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_date DATE NOT NULL, -- 交易日期
    reason VARCHAR(200) NOT NULL, -- 事由
    amount DECIMAL(12,2), -- 金額
    type_id UUID REFERENCES transaction_types(id), -- 交易類型
    note TEXT, -- 備註
    scheme_id UUID REFERENCES card_schemes(id), -- 使用的卡片方案
    payment_method_id UUID REFERENCES payment_methods(id), -- 使用的支付方式（當有綁定時）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. 額度追蹤相關表
-- ============================================

-- 額度追蹤表（追蹤每個回饋組成的額度使用情況）
CREATE TABLE IF NOT EXISTS quota_trackings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheme_id UUID REFERENCES card_schemes(id) ON DELETE CASCADE,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE CASCADE,
    reward_id UUID REFERENCES scheme_rewards(id) ON DELETE CASCADE,
    payment_reward_id UUID REFERENCES payment_rewards(id) ON DELETE CASCADE,
    -- 當 payment_method_id 不為 NULL 且 scheme_id 不為 NULL 時，表示這是支付方式綁定卡片方案的額度
    -- 當 payment_method_id 不為 NULL 且 scheme_id 為 NULL 時，表示這是純支付方式的額度（使用 payment_reward_id）
    current_amount DECIMAL(12,2) DEFAULT 0, -- 當前消費金額
    used_quota DECIMAL(12,2) DEFAULT 0, -- 已使用額度（系統計算值，a）
    manual_adjustment DECIMAL(12,2) DEFAULT 0, -- 人工調整值（b），顯示的總額度 = used_quota + manual_adjustment（c = a + b）
    remaining_quota DECIMAL(12,2), -- 剩餘額度（NULL 表示無上限），計算方式：quota_limit - (used_quota + manual_adjustment)
    last_refresh_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- 上次刷新時間
    next_refresh_at TIMESTAMP WITH TIME ZONE, -- 下次刷新時間
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- 約束：必須是 (scheme_id + reward_id) 或 (payment_method_id + payment_reward_id + scheme_id IS NULL)
    CONSTRAINT quota_trackings_unique_check CHECK (
      (scheme_id IS NOT NULL AND reward_id IS NOT NULL) OR
      (payment_method_id IS NOT NULL AND payment_reward_id IS NOT NULL AND scheme_id IS NULL)
    )
);

-- ============================================
-- 6. 設定相關表
-- ============================================

-- 事由字串設定表
CREATE TABLE IF NOT EXISTS reason_strings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL, -- 事由字串內容
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 計算方案下拉選單設定表（用於回饋計算和記帳功能）
CREATE TABLE IF NOT EXISTS calculation_schemes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheme_id UUID REFERENCES card_schemes(id) ON DELETE CASCADE,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE CASCADE,
    -- 當兩者都不為 NULL 時，表示支付方式綁定卡片方案
    -- 當只有 scheme_id 時，表示純卡片方案
    -- 當只有 payment_method_id 時，表示純支付方式
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 7. 索引優化
-- ============================================

CREATE INDEX IF NOT EXISTS idx_cards_display_order ON cards(display_order);
CREATE INDEX IF NOT EXISTS idx_card_schemes_card_id ON card_schemes(card_id);
CREATE INDEX IF NOT EXISTS idx_card_schemes_display_order ON card_schemes(display_order);
CREATE INDEX IF NOT EXISTS idx_scheme_rewards_scheme_id ON scheme_rewards(scheme_id);
CREATE INDEX IF NOT EXISTS idx_payment_scheme_links_payment ON payment_scheme_links(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_scheme_links_scheme ON payment_scheme_links(scheme_id);
CREATE INDEX IF NOT EXISTS idx_channels_common ON channels(is_common, display_order);
CREATE INDEX IF NOT EXISTS idx_scheme_channel_exclusions_scheme ON scheme_channel_exclusions(scheme_id);
CREATE INDEX IF NOT EXISTS idx_scheme_channel_exclusions_channel ON scheme_channel_exclusions(channel_id);
CREATE INDEX IF NOT EXISTS idx_scheme_channel_applications_scheme ON scheme_channel_applications(scheme_id);
CREATE INDEX IF NOT EXISTS idx_scheme_channel_applications_channel ON scheme_channel_applications(channel_id);
CREATE INDEX IF NOT EXISTS idx_payment_channel_applications_payment ON payment_channel_applications(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_channel_applications_channel ON payment_channel_applications(channel_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_scheme ON transactions(scheme_id);
CREATE INDEX IF NOT EXISTS idx_quota_trackings_scheme ON quota_trackings(scheme_id);
CREATE INDEX IF NOT EXISTS idx_quota_trackings_payment ON quota_trackings(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_quota_trackings_reward ON quota_trackings(reward_id);
CREATE INDEX IF NOT EXISTS idx_quota_trackings_payment_reward_id ON quota_trackings(payment_reward_id);
CREATE INDEX IF NOT EXISTS idx_quota_trackings_refresh ON quota_trackings(next_refresh_at);
CREATE INDEX IF NOT EXISTS idx_payment_rewards_payment_method_id ON payment_rewards(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_rewards_display_order ON payment_rewards(display_order);

-- ============================================
-- 8. 觸發器：自動更新 updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 刪除現有觸發器（如果存在）然後重新創建
DROP TRIGGER IF EXISTS update_cards_updated_at ON cards;
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_card_schemes_updated_at ON card_schemes;
CREATE TRIGGER update_card_schemes_updated_at BEFORE UPDATE ON card_schemes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scheme_rewards_updated_at ON scheme_rewards;
CREATE TRIGGER update_scheme_rewards_updated_at BEFORE UPDATE ON scheme_rewards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quota_trackings_updated_at ON quota_trackings;
CREATE TRIGGER update_quota_trackings_updated_at BEFORE UPDATE ON quota_trackings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_rewards_updated_at ON payment_rewards;
CREATE TRIGGER update_payment_rewards_updated_at BEFORE UPDATE ON payment_rewards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 完成訊息
DO $$
BEGIN
    RAISE NOTICE '✅ 資料庫結構初始化完成！';
    RAISE NOTICE '📊 所有資料表、索引和觸發器已創建。';
END $$;

