-- 在 card_schemes 表中添加 shared_reward_group_id 欄位
-- 這個欄位指向同一個卡片中的另一個方案ID，表示該方案要共用那個方案的回饋組成
-- 如果為 NULL，表示該方案使用自己的回饋組成
ALTER TABLE card_schemes 
ADD COLUMN IF NOT EXISTS shared_reward_group_id UUID REFERENCES card_schemes(id) ON DELETE SET NULL;

-- 添加檢查約束：確保 shared_reward_group_id 只能指向同一個卡片中的方案
ALTER TABLE card_schemes 
ADD CONSTRAINT IF NOT EXISTS check_shared_reward_same_card 
CHECK (
  shared_reward_group_id IS NULL OR 
  EXISTS (
    SELECT 1 FROM card_schemes cs1, card_schemes cs2
    WHERE cs1.id = card_schemes.id 
    AND cs2.id = card_schemes.shared_reward_group_id
    AND cs1.card_id = cs2.card_id
  )
);

-- 創建索引以提高查詢效率
CREATE INDEX IF NOT EXISTS idx_card_schemes_shared_reward_group_id ON card_schemes(shared_reward_group_id);

-- 注意：現有資料的 shared_reward_group_id 預設為 NULL，表示每個方案都使用自己的回饋組成
-- 用戶可以後續在 UI 中手動設定哪些方案要共用回饋組成

