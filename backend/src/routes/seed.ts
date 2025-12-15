import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

// 初始化資料庫結構（支援 GET 和 POST）
router.get('/schema', async (_req: Request, res: Response, next: NextFunction) => {
  let client;
  try {
    console.log('📥 收到資料庫結構初始化請求');
    client = await pool.connect();
    console.log('✅ 數據庫連接成功');
    
    console.log('📝 開始執行資料庫結構初始化...');
    
    // 直接執行 SQL 語句（忽略已存在的錯誤）
    const statements = [
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
      `CREATE TABLE IF NOT EXISTS cards (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL UNIQUE,
        note TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS card_schemes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        note TEXT,
        requires_switch BOOLEAN DEFAULT false,
        activity_start_date DATE,
        activity_end_date DATE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(card_id, name)
      );`,
      `CREATE TABLE IF NOT EXISTS scheme_rewards (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        scheme_id UUID NOT NULL REFERENCES card_schemes(id) ON DELETE CASCADE,
        reward_percentage DECIMAL(5,2) NOT NULL,
        calculation_method VARCHAR(20) NOT NULL CHECK (calculation_method IN ('round', 'floor', 'ceil')),
        quota_limit DECIMAL(12,2),
        quota_refresh_type VARCHAR(20) CHECK (quota_refresh_type IN ('monthly', 'date', 'activity')),
        quota_refresh_value INTEGER,
        quota_refresh_date DATE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS payment_methods (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL UNIQUE,
        note TEXT,
        own_reward_percentage DECIMAL(5,2) DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS payment_scheme_links (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
        scheme_id UUID NOT NULL REFERENCES card_schemes(id) ON DELETE CASCADE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(payment_method_id, scheme_id)
      );`,
      `CREATE TABLE IF NOT EXISTS payment_rewards (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
        reward_percentage DECIMAL(5,2) NOT NULL,
        calculation_method VARCHAR(20) NOT NULL CHECK (calculation_method IN ('round', 'floor', 'ceil')),
        quota_limit DECIMAL(12,2),
        quota_refresh_type VARCHAR(20) CHECK (quota_refresh_type IN ('monthly', 'date', 'activity')),
        quota_refresh_value INTEGER,
        quota_refresh_date DATE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS channels (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL UNIQUE,
        is_common BOOLEAN DEFAULT false,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS scheme_channel_exclusions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        scheme_id UUID NOT NULL REFERENCES card_schemes(id) ON DELETE CASCADE,
        channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scheme_id, channel_id)
      );`,
      `CREATE TABLE IF NOT EXISTS scheme_channel_applications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        scheme_id UUID NOT NULL REFERENCES card_schemes(id) ON DELETE CASCADE,
        channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        note TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scheme_id, channel_id)
      );`,
      `CREATE TABLE IF NOT EXISTS payment_channel_applications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
        channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        note TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(payment_method_id, channel_id)
      );`,
      `CREATE TABLE IF NOT EXISTS transaction_types (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL UNIQUE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        transaction_date DATE NOT NULL,
        reason VARCHAR(200) NOT NULL,
        amount DECIMAL(12,2),
        type_id UUID REFERENCES transaction_types(id),
        note TEXT,
        scheme_id UUID REFERENCES card_schemes(id),
        payment_method_id UUID REFERENCES payment_methods(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS quota_trackings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        scheme_id UUID REFERENCES card_schemes(id) ON DELETE CASCADE,
        payment_method_id UUID REFERENCES payment_methods(id) ON DELETE CASCADE,
        reward_id UUID REFERENCES scheme_rewards(id) ON DELETE CASCADE,
        payment_reward_id UUID REFERENCES payment_rewards(id) ON DELETE CASCADE,
        current_amount DECIMAL(12,2) DEFAULT 0,
        used_quota DECIMAL(12,2) DEFAULT 0,
        remaining_quota DECIMAL(12,2),
        last_refresh_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        next_refresh_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT quota_trackings_unique_check CHECK (
          (scheme_id IS NOT NULL AND reward_id IS NOT NULL) OR
          (payment_method_id IS NOT NULL AND payment_reward_id IS NOT NULL AND scheme_id IS NULL)
        )
      );`,
      `CREATE TABLE IF NOT EXISTS reason_strings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS calculation_schemes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        scheme_id UUID REFERENCES card_schemes(id) ON DELETE CASCADE,
        payment_method_id UUID REFERENCES payment_methods(id) ON DELETE CASCADE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
    ];

    // 執行所有語句
    for (const statement of statements) {
      try {
        await client.query(statement);
      } catch (error: any) {
        // 忽略已存在的錯誤
        if (!error.message.includes('already exists')) {
          console.warn('⚠️  SQL 執行警告:', error.message);
        }
      }
    }

    // 創建觸發器函數和觸發器
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    const triggers = [
      'CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      'CREATE TRIGGER update_card_schemes_updated_at BEFORE UPDATE ON card_schemes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      'CREATE TRIGGER update_scheme_rewards_updated_at BEFORE UPDATE ON scheme_rewards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      'CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      'CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      'CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      'CREATE TRIGGER update_quota_trackings_updated_at BEFORE UPDATE ON quota_trackings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      'CREATE TRIGGER update_payment_rewards_updated_at BEFORE UPDATE ON payment_rewards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
    ];

    for (const trigger of triggers) {
      try {
        await client.query(trigger);
      } catch (error: any) {
        // 忽略已存在的錯誤
        if (!error.message.includes('already exists')) {
          console.warn('⚠️  觸發器創建警告:', error.message);
        }
      }
    }

    console.log('✅ 資料庫結構初始化完成');

    return res.json({
      success: true,
      message: '資料庫結構初始化成功！',
    });
  } catch (error: any) {
    logger.error('❌ 資料庫結構初始化錯誤:', error);
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

// 匯入測試資料（支援 GET 和 POST）
router.post('/import', async (_req: Request, res: Response, next: NextFunction) => {
  let client;
  try {
    console.log('📥 收到測試資料匯入請求');
    client = await pool.connect();
    console.log('✅ 數據庫連接成功');
    await client.query('BEGIN');
    console.log('✅ 事務開始');

    console.log('🗑️  開始刪除現有測試資料...');
    // 刪除現有測試資料（僅限於特定測試ID，避免影響正式資料）
    await client.query(`
      DELETE FROM calculation_schemes WHERE scheme_id IN (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
      ) OR payment_method_id IN (
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        '11111111-1111-1111-1111-111111111112',
        '11111111-1111-1111-1111-111111111113',
        '11111111-1111-1111-1111-111111111114'
      )
    `);
    console.log('✅ 計算方案刪除完成');
    await client.query(`
      DELETE FROM reason_strings
    `);
    await client.query(`
      DELETE FROM transaction_types WHERE id IN (
        '33333333-3333-3333-3333-333333333331',
        '33333333-3333-3333-3333-333333333332',
        '33333333-3333-3333-3333-333333333333',
        '33333333-3333-3333-3333-333333333334',
        '33333333-3333-3333-3333-333333333335'
      )
    `);
    await client.query(`
      DELETE FROM payment_channel_applications WHERE payment_method_id IN (
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        '11111111-1111-1111-1111-111111111112',
        '11111111-1111-1111-1111-111111111113',
        '11111111-1111-1111-1111-111111111114'
      )
    `);
    await client.query(`
      DELETE FROM scheme_channel_applications WHERE scheme_id IN (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
      )
    `);
    await client.query(`
      DELETE FROM scheme_channel_exclusions WHERE scheme_id IN (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'cccccccc-cccc-cccc-cccc-cccccccccccc'
      )
    `);
    await client.query(`
      DELETE FROM channels WHERE id IN (
        '22222222-2222-2222-2222-222222222221',
        '22222222-2222-2222-2222-222222222222',
        '22222222-2222-2222-2222-222222222223',
        '22222222-2222-2222-2222-222222222224',
        '22222222-2222-2222-2222-222222222225',
        '22222222-2222-2222-2222-222222222226'
      )
    `);
    await client.query(`
      DELETE FROM payment_scheme_links WHERE payment_method_id IN (
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        '11111111-1111-1111-1111-111111111112',
        '11111111-1111-1111-1111-111111111114'
      )
    `);
    await client.query(`
      DELETE FROM scheme_rewards WHERE scheme_id IN (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
      )
    `);
    await client.query(`
      DELETE FROM card_schemes WHERE id IN (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
      )
    `);
    await client.query(`
      DELETE FROM payment_methods WHERE id IN (
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        '11111111-1111-1111-1111-111111111112',
        '11111111-1111-1111-1111-111111111113',
        '11111111-1111-1111-1111-111111111114'
      )
    `);
    await client.query(`
      DELETE FROM cards WHERE id IN (
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333'
      )
    `);

    console.log('📝 開始插入測試資料...');
    // 1. 建立卡片
    await client.query(`
      INSERT INTO cards (id, name, note, display_order) VALUES
      ('11111111-1111-1111-1111-111111111111', '台新狗狗卡', '台新銀行推出的可愛狗狗卡', 1),
      ('22222222-2222-2222-2222-222222222222', '玉山吼吼卡', '玉山銀行推出的猛獸卡', 2),
      ('33333333-3333-3333-3333-333333333333', '國泰大樹卡', '國泰銀行推出的環保卡', 3)
    `);
    console.log('✅ 卡片插入完成');

    // 2. 建立卡片方案
    await client.query(`
      INSERT INTO card_schemes (id, card_id, name, note, requires_switch, activity_start_date, activity_end_date, display_order) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '好匯刷', '台新好匯刷方案', true, '2025-01-01', '2025-06-30', 1),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', '刷刷樂', '台新刷刷樂方案', false, '2025-01-01', '2025-12-31', 2),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', '惡龍咆哮', '玉山惡龍咆哮方案', true, '2025-01-01', '2025-12-31', 1),
      ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', '嗷嗷叫', '玉山嗷嗷叫方案', false, '2025-01-01', '2025-12-31', 2),
      ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '33333333-3333-3333-3333-333333333333', '真匯刷', '國泰真匯刷方案', true, '2025-01-01', '2025-12-31', 1)
    `);

    // 3. 建立方案回饋組成
    await client.query(`
      INSERT INTO scheme_rewards (scheme_id, reward_percentage, calculation_method, quota_limit, quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0.3, 'round', NULL, NULL, NULL, NULL, 1),
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2.7, 'round', 100, 'monthly', 10, NULL, 2),
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3.0, 'floor', 200, 'date', NULL, '2025-06-30', 3),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0.5, 'round', NULL, NULL, NULL, NULL, 1),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2.5, 'floor', 200, 'date', NULL, '2025-12-31', 2),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', 0.5, 'round', NULL, NULL, NULL, NULL, 1),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', 1.5, 'round', 100, 'monthly', 15, NULL, 2),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', 5.0, 'floor', 500, 'activity', NULL, NULL, 3),
      ('dddddddd-dddd-dddd-dddd-dddddddddddd', 3.0, 'round', NULL, NULL, NULL, NULL, 1),
      ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 10.0, 'round', NULL, NULL, NULL, NULL, 1)
    `);

    // 4. 建立支付方式
    await client.query(`
      INSERT INTO payment_methods (id, name, note, own_reward_percentage, display_order) VALUES
      ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'LINE Pay', 'LINE Pay 支付', 1.0, 1),
      ('11111111-1111-1111-1111-111111111112', '全支付', '全聯全支付', 0.3, 2),
      ('11111111-1111-1111-1111-111111111113', '街口支付', '街口支付', 0.5, 3),
      ('11111111-1111-1111-1111-111111111114', '橘子支付', '橘子支付', 0.2, 4)
    `);

    // 5. 連結支付方式與卡片方案
    await client.query(`
      INSERT INTO payment_scheme_links (payment_method_id, scheme_id, display_order) VALUES
      ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1),
      ('11111111-1111-1111-1111-111111111112', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2),
      ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1),
      ('11111111-1111-1111-1111-111111111114', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 2)
    `);

    // 6. 建立通路
    await client.query(`
      INSERT INTO channels (id, name, is_common, display_order) VALUES
      ('22222222-2222-2222-2222-222222222221', '7-11', true, 1),
      ('22222222-2222-2222-2222-222222222222', '全家', true, 2),
      ('22222222-2222-2222-2222-222222222223', '全聯', true, 3),
      ('22222222-2222-2222-2222-222222222224', '家樂福', true, 4),
      ('22222222-2222-2222-2222-222222222225', '愛買', false, 5),
      ('22222222-2222-2222-2222-222222222226', '好事多', false, 6)
    `);

    // 7. 建立方案排除通路
    await client.query(`
      INSERT INTO scheme_channel_exclusions (scheme_id, channel_id) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222223'),
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222225'),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222223')
    `);

    // 8. 建立方案適用通路
    await client.query(`
      INSERT INTO scheme_channel_applications (scheme_id, channel_id, note) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222221', '需使用實體卡過刷'),
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '排除FamiPay'),
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222224', NULL),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222221', NULL),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', NULL),
      ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222223', NULL),
      ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222223', '不含儲值')
    `);

    // 9. 建立支付方式適用通路
    await client.query(`
      INSERT INTO payment_channel_applications (payment_method_id, channel_id, note) VALUES
      ('ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222221', '需使用實體卡過刷'),
      ('ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222222', NULL),
      ('ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222223', NULL),
      ('ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222224', NULL),
      ('11111111-1111-1111-1111-111111111112', '22222222-2222-2222-2222-222222222223', '適用PX PAY')
    `);

    // 10. 建立交易類型
    await client.query(`
      INSERT INTO transaction_types (id, name, display_order) VALUES
      ('33333333-3333-3333-3333-333333333331', '日常消費', 1),
      ('33333333-3333-3333-3333-333333333332', '餐飲', 2),
      ('33333333-3333-3333-3333-333333333333', '購物', 3),
      ('33333333-3333-3333-3333-333333333334', '交通', 4),
      ('33333333-3333-3333-3333-333333333335', '其他', 5)
    `);

    // 11. 建立事由字串（先刪除再插入）
    await client.query(`
      DELETE FROM reason_strings
    `);
    await client.query(`
      INSERT INTO reason_strings (content) VALUES
      ('請輸入交易事由，例如：購買日用品、用餐、交通費等')
    `);

    // 12. 建立計算方案設定
    await client.query(`
      INSERT INTO calculation_schemes (scheme_id, payment_method_id, display_order) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, 1),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL, 2),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', NULL, 3),
      ('dddddddd-dddd-dddd-dddd-dddddddddddd', NULL, 4),
      ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', NULL, 5),
      (NULL, 'ffffffff-ffff-ffff-ffff-ffffffffffff', 6),
      (NULL, '11111111-1111-1111-1111-111111111112', 7),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 8),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111112', 9),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 10),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111114', 11)
    `);

    await client.query('COMMIT');
    console.log('✅ 事務提交成功');

    return res.json({
      success: true,
      message: '測試資料匯入成功！',
    });
    console.log('✅ 測試資料匯入完成');
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.log('⚠️  事務已回滾');
      } catch (rollbackError) {
        logger.error('❌ 回滾錯誤:', rollbackError);
      }
    }
    logger.error('❌ 匯入測試資料錯誤:', error);
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

export default router;
