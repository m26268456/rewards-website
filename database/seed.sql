-- 測試資料種子腳本
-- 回饋查詢/計算與記帳系統

-- 1. 建立卡片
INSERT INTO cards (id, name, note, display_order) VALUES
('11111111-1111-1111-1111-111111111111', '台新狗狗卡', '台新銀行推出的可愛狗狗卡', 1),
('22222222-2222-2222-2222-222222222222', '玉山吼吼卡', '玉山銀行推出的猛獸卡', 2),
('33333333-3333-3333-3333-333333333333', '國泰大樹卡', '國泰銀行推出的環保卡', 3)
ON CONFLICT (name) DO NOTHING;

-- 2. 建立卡片方案
INSERT INTO card_schemes (id, card_id, name, note, requires_switch, activity_start_date, activity_end_date, display_order) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '好匯刷', '台新好匯刷方案', true, '2025-01-01', '2025-06-30', 1),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', '刷刷樂', '台新刷刷樂方案', false, '2025-01-01', '2025-12-31', 2),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', '惡龍咆哮', '玉山惡龍咆哮方案', true, '2025-01-01', '2025-12-31', 1),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', '嗷嗷叫', '玉山嗷嗷叫方案', false, '2025-01-01', '2025-12-31', 2),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '33333333-3333-3333-3333-333333333333', '真匯刷', '國泰真匯刷方案', true, '2025-01-01', '2025-12-31', 1)
ON CONFLICT DO NOTHING;

-- 3. 建立方案回饋組成
INSERT INTO scheme_rewards (scheme_id, reward_percentage, calculation_method, quota_limit, quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order) VALUES
-- 台新好匯刷
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0.3, 'round', NULL, NULL, NULL, NULL, 1),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2.7, 'round', 100, 'monthly', 10, NULL, 2),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3.0, 'floor', 200, 'date', NULL, '2025-06-30', 3),
-- 台新刷刷樂
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0.5, 'round', NULL, NULL, NULL, NULL, 1),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2.5, 'floor', 200, 'date', NULL, '2025-12-31', 2),
-- 玉山惡龍咆哮
('cccccccc-cccc-cccc-cccc-cccccccccccc', 0.5, 'round', NULL, NULL, NULL, NULL, 1),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 1.5, 'round', 100, 'monthly', 15, NULL, 2),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 5.0, 'floor', 500, 'activity', NULL, NULL, 3),
-- 玉山嗷嗷叫
('dddddddd-dddd-dddd-dddd-dddddddddddd', 3.0, 'round', NULL, NULL, NULL, NULL, 1),
-- 國泰真匯刷
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 10.0, 'round', NULL, NULL, NULL, NULL, 1);

-- 4. 建立支付方式
INSERT INTO payment_methods (id, name, note, own_reward_percentage, display_order) VALUES
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'LINE Pay', 'LINE Pay 支付', 1.0, 1),
('gggggggg-gggg-gggg-gggg-gggggggggggg', '全支付', '全聯全支付', 0.3, 2),
('hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh', '街口支付', '街口支付', 0.5, 3),
('iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii', '橘子支付', '橘子支付', 0.2, 4)
ON CONFLICT (name) DO NOTHING;

-- 5. 連結支付方式與卡片方案
INSERT INTO payment_scheme_links (payment_method_id, scheme_id, display_order) VALUES
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1),
('gggggggg-gggg-gggg-gggg-gggggggggggg', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1),
('iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 2)
ON CONFLICT DO NOTHING;

-- 6. 建立通路
INSERT INTO channels (id, name, is_common, display_order) VALUES
('jjjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj', '7-11', true, 1),
('kkkkkkkk-kkkk-kkkk-kkkk-kkkkkkkkkkkk', '全家', true, 2),
('llllllll-llll-llll-llll-llllllllllll', '全聯', true, 3),
('mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm', '家樂福', true, 4),
('nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnn', '愛買', false, 5),
('oooooooo-oooo-oooo-oooo-oooooooooooo', '好事多', false, 6)
ON CONFLICT (name) DO NOTHING;

-- 7. 建立方案排除通路
INSERT INTO scheme_channel_exclusions (scheme_id, channel_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'llllllll-llll-llll-llll-llllllllllll'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnn'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'llllllll-llll-llll-llll-llllllllllll')
ON CONFLICT DO NOTHING;

-- 8. 建立方案適用通路
INSERT INTO scheme_channel_applications (scheme_id, channel_id, note) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'jjjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj', '需使用實體卡過刷'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kkkkkkkk-kkkk-kkkk-kkkk-kkkkkkkkkkkk', '排除FamiPay'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm', NULL),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'jjjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj', NULL),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kkkkkkkk-kkkk-kkkk-kkkk-kkkkkkkkkkkk', NULL),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'llllllll-llll-llll-llll-llllllllllll', NULL),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'llllllll-llll-llll-llll-llllllllllll', '不含儲值')
ON CONFLICT DO NOTHING;

-- 9. 建立支付方式適用通路
INSERT INTO payment_channel_applications (payment_method_id, channel_id, note) VALUES
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'jjjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj', '需使用實體卡過刷'),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'kkkkkkkk-kkkk-kkkk-kkkk-kkkkkkkkkkkk', NULL),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'llllllll-llll-llll-llll-llllllllllll', NULL),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm', NULL),
('gggggggg-gggg-gggg-gggg-gggggggggggg', 'llllllll-llll-llll-llll-llllllllllll', '適用PX PAY')
ON CONFLICT DO NOTHING;

-- 10. 建立交易類型
INSERT INTO transaction_types (id, name, display_order) VALUES
('pppppppp-pppp-pppp-pppp-pppppppppppp', '日常消費', 1),
('qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq', '餐飲', 2),
('rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr', '購物', 3),
('ssssssss-ssss-ssss-ssss-ssssssssssss', '交通', 4),
('tttttttt-tttt-tttt-tttt-tttttttttttt', '其他', 5)
ON CONFLICT (name) DO NOTHING;

-- 11. 建立事由字串
INSERT INTO reason_strings (content) VALUES
('請輸入交易事由，例如：購買日用品、用餐、交通費等')
ON CONFLICT DO NOTHING;

-- 12. 建立計算方案設定
INSERT INTO calculation_schemes (scheme_id, payment_method_id, display_order) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, 1),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL, 2),
('cccccccc-cccc-cccc-cccc-cccccccccccc', NULL, 3),
('dddddddd-dddd-dddd-dddd-dddddddddddd', NULL, 4),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', NULL, 5),
(NULL, 'ffffffff-ffff-ffff-ffff-ffffffffffff', 6),
(NULL, 'gggggggg-gggg-gggg-gggg-gggggggggggg', 7),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 8),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'gggggggg-gggg-gggg-gggg-gggggggggggg', 9),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 10),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii', 11);

-- 13. 建立一些測試交易記錄
INSERT INTO transactions (transaction_date, reason, amount, type_id, note, scheme_id, payment_method_id) VALUES
('2025-11-25', '購買日用品', 1111, 'pppppppp-pppp-pppp-pppp-pppppppppppp', '測試交易1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL),
('2025-11-26', '午餐', 350, 'qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq', '測試交易2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
('2025-11-27', '購物', 100, 'rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr', '測試交易3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
('2025-11-28', '交通費', 50, 'ssssssss-ssss-ssss-ssss-ssssssssssss', '測試交易4', NULL, NULL);


