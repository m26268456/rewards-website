import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

// 清除所有資料並導入新資料
router.post('/import', async (req: Request, res: Response, next: NextFunction) => {
  let client;
  try {
    console.log('📥 收到資料導入請求');
    const { cards, payments, merchants } = req.body;

    if (!cards || !Array.isArray(cards)) {
      return res.status(400).json({
        success: false,
        error: '請提供 cards 陣列',
      });
    }

    if (!payments || !Array.isArray(payments)) {
      return res.status(400).json({
        success: false,
        error: '請提供 payments 陣列',
      });
    }

    if (!merchants || !Array.isArray(merchants)) {
      return res.status(400).json({
        success: false,
        error: '請提供 merchants 陣列',
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    console.log('✅ 事務開始');

    // 1. 清除所有資料（按照外鍵約束順序）
    console.log('🗑️  開始清除所有資料...');
    
    // 先清除有外鍵約束的表
    await client.query('DELETE FROM quota_trackings');
    await client.query('DELETE FROM transactions');
    await client.query('DELETE FROM calculation_schemes');
    await client.query('DELETE FROM payment_channel_applications');
    await client.query('DELETE FROM scheme_channel_applications');
    await client.query('DELETE FROM scheme_channel_exclusions');
    await client.query('DELETE FROM payment_scheme_links');
    await client.query('DELETE FROM scheme_rewards');
    await client.query('DELETE FROM payment_rewards');
    await client.query('DELETE FROM card_schemes');
    await client.query('DELETE FROM payment_methods');
    await client.query('DELETE FROM channels');
    await client.query('DELETE FROM cards');
    await client.query('DELETE FROM reason_strings');
    await client.query('DELETE FROM transaction_types');
    
    console.log('✅ 資料清除完成');

    // 2. 收集所有通路名稱
    const allChannels = new Set<string>();
    
    // 從常用通路
    merchants.forEach((merchant: string) => {
      allChannels.add(merchant);
    });

    // 從信用卡方案的通路
    cards.forEach((card: any) => {
      if (card.groups && Array.isArray(card.groups)) {
        card.groups.forEach((group: any) => {
          if (group.rewards && Array.isArray(group.rewards)) {
            group.rewards.forEach((reward: any) => {
              if (reward.merchant) {
                allChannels.add(reward.merchant);
              }
            });
          }
        });
      }
    });

    // 從支付方式的通路
    payments.forEach((payment: any) => {
      if (payment.rewards && Array.isArray(payment.rewards)) {
        payment.rewards.forEach((reward: any) => {
          if (reward.merchant) {
            allChannels.add(reward.merchant);
          }
        });
      }
    });

    // 3. 插入通路
    console.log('📝 開始插入通路...');
    const channelMap = new Map<string, string>(); // merchant name -> channel id
    
    for (const channelName of Array.from(allChannels)) {
      const isCommon = merchants.includes(channelName);
      const result = await client.query(
        `INSERT INTO channels (name, is_common, display_order)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [channelName, isCommon, channelMap.size]
      );
      channelMap.set(channelName, result.rows[0].id);
    }
    console.log(`✅ 通路插入完成，共 ${channelMap.size} 個通路`);

    // 4. 插入交易類型（使用預設值）
    console.log('📝 開始插入交易類型...');
    const transactionTypes = [
      { name: '日常消費', displayOrder: 1 },
      { name: '餐飲', displayOrder: 2 },
      { name: '購物', displayOrder: 3 },
      { name: '交通', displayOrder: 4 },
      { name: '其他', displayOrder: 5 },
    ];
    
    for (const type of transactionTypes) {
      await client.query(
        `INSERT INTO transaction_types (name, display_order)
         VALUES ($1, $2)`,
        [type.name, type.displayOrder]
      );
    }
    console.log('✅ 交易類型插入完成');

    // 5. 插入事由字串
    await client.query(
      `INSERT INTO reason_strings (content) VALUES ($1)`,
      ['請輸入交易事由，例如：購買日用品、用餐、交通費等']
    );

    // 6. 插入卡片和方案
    console.log('📝 開始插入卡片和方案...');
    const cardMap = new Map<string, string>(); // card name -> card id
    const schemeMap = new Map<string, string>(); // "cardName.schemeName" -> scheme id
    
    for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
      const card = cards[cardIndex];
      
      // 插入卡片
      const cardResult = await client.query(
        `INSERT INTO cards (name, note, display_order)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [card.name, card.cardNote || null, cardIndex + 1]
      );
      const cardId = cardResult.rows[0].id;
      cardMap.set(card.name, cardId);

      // 插入方案
      if (card.groups && Array.isArray(card.groups)) {
        for (let groupIndex = 0; groupIndex < card.groups.length; groupIndex++) {
          const group = card.groups[groupIndex];
          
          // 計算方案的活動日期（如果有 cardNote 中包含日期）
          let activityStartDate = null;
          let activityEndDate = null;
          
          if (card.cardNote) {
            // 嘗試從 cardNote 中提取日期，例如 "~12/31" 或 "~2/28"
            const dateMatch = card.cardNote.match(/~(\d{1,2})\/(\d{1,2})/);
            if (dateMatch) {
              const month = parseInt(dateMatch[1]);
              const day = parseInt(dateMatch[2]);
              const currentYear = new Date().getFullYear();
              activityEndDate = `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
          }

          const schemeResult = await client.query(
            `INSERT INTO card_schemes (card_id, name, note, requires_switch, activity_start_date, activity_end_date, display_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [cardId, group.name, group.groupNote || null, group.needsToggle || false, activityStartDate, activityEndDate, groupIndex + 1]
          );
          const schemeId = schemeResult.rows[0].id;
          schemeMap.set(`${card.name}.${group.name}`, schemeId);

          // 計算該方案的眾數回饋百分比
          if (group.rewards && Array.isArray(group.rewards) && group.rewards.length > 0) {
            const percentages = group.rewards
              .map((r: any) => r.percent)
              .filter((p: any) => typeof p === 'number' && p < 999); // 排除 999 (排除項目)
            
            if (percentages.length > 0) {
              // 計算眾數
              const frequency: { [key: number]: number } = {};
              percentages.forEach((p: number) => {
                frequency[p] = (frequency[p] || 0) + 1;
              });
              
              let maxFreq = 0;
              let mode = percentages[0];
              Object.keys(frequency).forEach((key) => {
                const freq = frequency[parseFloat(key)];
                if (freq > maxFreq) {
                  maxFreq = freq;
                  mode = parseFloat(key);
                }
              });

              // 插入方案回饋組成（使用眾數作為主要回饋）
              await client.query(
                `INSERT INTO scheme_rewards (scheme_id, reward_percentage, calculation_method, quota_limit, quota_refresh_type, quota_refresh_value, quota_refresh_date, quota_calculation_basis, display_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [schemeId, mode, 'round', null, null, null, null, 'transaction', 1]
              );

              // 插入方案適用通路
              for (const reward of group.rewards) {
                if (reward.merchant && reward.percent < 999) {
                  const channelId = channelMap.get(reward.merchant);
                  if (channelId) {
                    try {
                      await client.query(
                        `INSERT INTO scheme_channel_applications (scheme_id, channel_id, note)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (scheme_id, channel_id) DO NOTHING`,
                        [schemeId, channelId, reward.note || null]
                      );
                    } catch (err) {
                      // 忽略重複插入錯誤
                    }
                  }
                } else if (reward.merchant && reward.percent === 999) {
                  // 排除通路
                  const channelId = channelMap.get(reward.merchant);
                  if (channelId) {
                    try {
                      await client.query(
                        `INSERT INTO scheme_channel_exclusions (scheme_id, channel_id)
                         VALUES ($1, $2)
                         ON CONFLICT (scheme_id, channel_id) DO NOTHING`,
                        [schemeId, channelId]
                      );
                    } catch (err) {
                      // 忽略重複插入錯誤
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    console.log(`✅ 卡片和方案插入完成，共 ${cardMap.size} 張卡片`);

    // 7. 插入支付方式
    console.log('📝 開始插入支付方式...');
    const paymentMap = new Map<string, string>(); // payment name -> payment id
    
    for (let paymentIndex = 0; paymentIndex < payments.length; paymentIndex++) {
      const payment = payments[paymentIndex];
      
      // 計算支付方式的 own_reward_percentage（使用眾數）
      let ownRewardPercentage = 0;
      if (payment.rewards && Array.isArray(payment.rewards) && payment.rewards.length > 0) {
        const percentages = payment.rewards
          .map((r: any) => r.percent)
          .filter((p: any) => typeof p === 'number' && p < 999);
        
        if (percentages.length > 0) {
          const frequency: { [key: number]: number } = {};
          percentages.forEach((p: number) => {
            frequency[p] = (frequency[p] || 0) + 1;
          });
          
          let maxFreq = 0;
          let mode = percentages[0];
          Object.keys(frequency).forEach((key) => {
            const freq = frequency[parseFloat(key)];
            if (freq > maxFreq) {
              maxFreq = freq;
              mode = parseFloat(key);
            }
          });
          ownRewardPercentage = mode;
        }
      }

      const paymentResult = await client.query(
        `INSERT INTO payment_methods (name, note, own_reward_percentage, display_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [payment.name, payment.paymentNote || null, ownRewardPercentage, paymentIndex + 1]
      );
      const paymentId = paymentResult.rows[0].id;
      paymentMap.set(payment.name, paymentId);

      // 插入支付方式回饋組成
      if (payment.rewards && Array.isArray(payment.rewards) && payment.rewards.length > 0) {
        // 計算眾數
        const percentages = payment.rewards
          .map((r: any) => r.percent)
          .filter((p: any) => typeof p === 'number' && p < 999);
        
        if (percentages.length > 0) {
          const frequency: { [key: number]: number } = {};
          percentages.forEach((p: number) => {
            frequency[p] = (frequency[p] || 0) + 1;
          });
          
          let maxFreq = 0;
          let mode = percentages[0];
          Object.keys(frequency).forEach((key) => {
            const freq = frequency[parseFloat(key)];
            if (freq > maxFreq) {
              maxFreq = freq;
              mode = parseFloat(key);
            }
          });

          // 插入支付方式回饋組成
          await client.query(
            `INSERT INTO payment_rewards (payment_method_id, reward_percentage, calculation_method, quota_limit, quota_refresh_type, quota_refresh_value, quota_refresh_date, quota_calculation_basis, display_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [paymentId, mode, 'round', null, null, null, null, 'transaction', 1]
          );

          // 插入支付方式適用通路
          for (const reward of payment.rewards) {
            if (reward.merchant && reward.percent < 999) {
              const channelId = channelMap.get(reward.merchant);
              if (channelId) {
                try {
                  await client.query(
                    `INSERT INTO payment_channel_applications (payment_method_id, channel_id, note)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (payment_method_id, channel_id) DO NOTHING`,
                    [paymentId, channelId, reward.note || null]
                  );
                } catch (err) {
                  // 忽略重複插入錯誤
                }
              }
            }
          }
        }
      }
    }
    console.log(`✅ 支付方式插入完成，共 ${paymentMap.size} 個支付方式`);

    await client.query('COMMIT');
    console.log('✅ 事務提交成功');

    res.json({
      success: true,
      message: '資料導入成功！',
      stats: {
        cards: cardMap.size,
        schemes: schemeMap.size,
        payments: paymentMap.size,
        channels: channelMap.size,
      },
    });
    console.log('✅ 資料導入完成');
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.log('⚠️  事務已回滾');
      } catch (rollbackError) {
        logger.error('❌ 回滾錯誤:', rollbackError);
      }
    }
    logger.error('❌ 導入資料錯誤:', error);
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

export default router;

