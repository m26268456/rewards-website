import { pool } from '../config/database';
import { SchemeInfo, RewardComposition } from '../utils/types';

/**
 * 取得所有卡片及其方案（用於方案總覽）
 */
export async function getAllCardsWithSchemes(): Promise<
  Array<{
    id: string;
    name: string;
    note?: string;
    displayOrder: number;
    schemes: Array<{
      id: string;
      name: string;
      note?: string;
      requiresSwitch: boolean;
      activityStartDate?: string;
      activityEndDate?: string;
      rewards: RewardComposition[];
      exclusions: string[];
      applications: Array<{
        channelId: string;
        channelName: string;
        note?: string;
      }>;
    }>;
  }>
> {
  try {
    // 取得所有卡片
    const cardsResult = await pool.query(
      'SELECT id, name, note, display_order FROM cards ORDER BY display_order, created_at'
    );

    const cards = cardsResult.rows;

    // 為每個卡片取得方案
    const cardsWithSchemes = await Promise.all(
      cards.map(async (card) => {
        const schemesResult = await pool.query(
          `SELECT id, name, note, requires_switch, activity_start_date, activity_end_date, display_order
           FROM card_schemes
           WHERE card_id = $1
           ORDER BY display_order, created_at`,
          [card.id]
        );

        const schemes = await Promise.all(
          schemesResult.rows.map(async (scheme) => {
            // 取得回饋組成
            const rewardsResult = await pool.query(
              `SELECT reward_percentage, calculation_method, quota_limit, 
                      quota_refresh_type, quota_refresh_value, quota_refresh_date, display_order
               FROM scheme_rewards
               WHERE scheme_id = $1
               ORDER BY display_order`,
              [scheme.id]
            );

            const rewards: RewardComposition[] = rewardsResult.rows.map((r) => ({
              percentage: r.reward_percentage ? parseFloat(r.reward_percentage) : 0,
              calculationMethod: r.calculation_method || 'round',
              quotaLimit: r.quota_limit ? parseFloat(r.quota_limit) : null,
              quotaRefreshType: r.quota_refresh_type || null,
              quotaRefreshValue: r.quota_refresh_value || null,
              quotaRefreshDate: r.quota_refresh_date
                ? r.quota_refresh_date.toISOString().split('T')[0]
                : null,
            }));

            // 取得排除通路
            const exclusionsResult = await pool.query(
              `SELECT c.id, c.name
               FROM scheme_channel_exclusions sce
               JOIN channels c ON sce.channel_id = c.id
               WHERE sce.scheme_id = $1`,
              [scheme.id]
            );

            const exclusions = exclusionsResult.rows.map((r) => r.name);

            // 取得適用通路
            const applicationsResult = await pool.query(
              `SELECT c.id, c.name, sca.note
               FROM scheme_channel_applications sca
               JOIN channels c ON sca.channel_id = c.id
               WHERE sca.scheme_id = $1`,
              [scheme.id]
            );

            const applications = applicationsResult.rows.map((r) => ({
              channelId: r.id,
              channelName: r.name,
              note: r.note || undefined,
            }));

            return {
              id: scheme.id,
              name: scheme.name,
              note: scheme.note || undefined,
              requiresSwitch: scheme.requires_switch || false,
              activityStartDate: scheme.activity_start_date
                ? (scheme.activity_start_date instanceof Date
                    ? scheme.activity_start_date.toISOString().split('T')[0]
                    : String(scheme.activity_start_date).split('T')[0])
                : undefined,
              activityEndDate: scheme.activity_end_date
                ? (scheme.activity_end_date instanceof Date
                    ? scheme.activity_end_date.toISOString().split('T')[0]
                    : String(scheme.activity_end_date).split('T')[0])
                : undefined,
              rewards,
              exclusions,
              applications,
            };
          })
        );

        return {
          id: card.id,
          name: card.name,
          note: card.note || undefined,
          displayOrder: card.display_order || 0,
          schemes,
        };
      })
    );

    return cardsWithSchemes;
  } catch (error) {
    console.error('getAllCardsWithSchemes 錯誤:', error);
    throw error;
  }
}

/**
 * 解析通路名稱，提取原名稱和別稱
 * 支持格式：原名稱[別稱1,別稱2] 或 原名稱(別稱)
 */
function parseChannelName(channelName: string): {
  baseName: string;
  aliases: string[];
  fullName: string;
} {
  const fullName = channelName.trim();
  
  // 嘗試匹配 [別稱1,別稱2] 格式
  const bracketMatch = fullName.match(/^(.+?)\[(.+?)\]$/);
  if (bracketMatch) {
    const baseName = bracketMatch[1].trim();
    const aliasesStr = bracketMatch[2].trim();
    const aliases = aliasesStr.split(',').map(a => a.trim()).filter(a => a.length > 0);
    return { baseName, aliases, fullName };
  }
  
  // 嘗試匹配 (別稱) 格式（但這可能與備註混淆，優先使用括號格式）
  const parenMatch = fullName.match(/^(.+?)\s*\((.+?)\)$/);
  if (parenMatch) {
    const baseName = parenMatch[1].trim();
    const aliasesStr = parenMatch[2].trim();
    const aliases = aliasesStr.split(',').map(a => a.trim()).filter(a => a.length > 0);
    return { baseName, aliases, fullName };
  }
  
  // 沒有別稱
  return { baseName: fullName, aliases: [], fullName };
}

/**
 * 檢查關鍵字是否匹配通路名稱（支持別稱）
 */
function matchesChannelName(keyword: string, channelName: string): { matched: boolean; isExact: boolean; isAlias: boolean } {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const { baseName, aliases, fullName } = parseChannelName(channelName);
  
  // 精確匹配（不區分大小寫）
  if (baseName.toLowerCase() === normalizedKeyword) {
    return { matched: true, isExact: true, isAlias: false };
  }
  
  // 別稱精確匹配
  for (const alias of aliases) {
    if (alias.toLowerCase() === normalizedKeyword) {
      return { matched: true, isExact: true, isAlias: true };
    }
  }
  
  // 檢查是否為完整單詞匹配（避免部分匹配）
  // 例如："net" 不應該匹配 "Netflix"，但 "net" 應該匹配 "NET"
  const baseNameLower = baseName.toLowerCase();
  const fullNameLower = fullName.toLowerCase();
  
  // 轉義特殊字符
  const escapedKeyword = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 檢查關鍵字是否為完整單詞（使用單詞邊界）
  const wordBoundaryRegex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
  
  // 檢查是否匹配完整單詞（在原名稱中）
  if (wordBoundaryRegex.test(baseNameLower)) {
    return { matched: true, isExact: false, isAlias: false };
  }
  
  // 檢查別稱中的完整單詞匹配
  for (const alias of aliases) {
    const aliasLower = alias.toLowerCase();
    if (aliasLower === normalizedKeyword) {
      // 別稱精確匹配已在上面處理
      continue;
    }
    if (wordBoundaryRegex.test(aliasLower)) {
      return { matched: true, isExact: false, isAlias: true };
    }
  }
  
  // 如果關鍵字長度足夠（至少3個字符），允許部分匹配作為最後手段
  // 但需要確保不是部分匹配導致的混亂
  if (normalizedKeyword.length >= 3) {
    // 檢查關鍵字是否在名稱開頭（作為單詞開頭）
    const keywordAtStart = new RegExp(`^${escapedKeyword}\\b`, 'i');
    // 檢查關鍵字是否在名稱結尾（作為單詞結尾）
    const keywordAtEnd = new RegExp(`\\b${escapedKeyword}$`, 'i');
    
    // 如果關鍵字在原名稱中作為單詞開頭或結尾，允許匹配
    if (keywordAtStart.test(baseNameLower) || keywordAtEnd.test(baseNameLower)) {
      return { matched: true, isExact: false, isAlias: false };
    }
    
    // 檢查別稱中的部分匹配（作為單詞開頭或結尾）
    for (const alias of aliases) {
      const aliasLower = alias.toLowerCase();
      if (keywordAtStart.test(aliasLower) || keywordAtEnd.test(aliasLower)) {
        return { matched: true, isExact: false, isAlias: true };
      }
    }
  }
  
  return { matched: false, isExact: false, isAlias: false };
}

/**
 * 根據關鍵字查詢通路回饋（支持關鍵字匹配和別稱）
 */
export async function queryChannelRewardsByKeywords(
  keywords: string[]
): Promise<
  Array<{
    channelId: string;
    channelName: string;
    results: Array<{
      isExcluded: boolean;
      excludedSchemeName?: string;
      totalRewardPercentage: number;
      rewardBreakdown: string;
      schemeInfo: string;
      requiresSwitch: boolean;
      note?: string;
    }>;
  }>
> {
  if (keywords.length === 0) return [];

  const results = await Promise.all(
    keywords.map(async (keyword) => {
      // 獲取所有通路
      const allChannelsResult = await pool.query(
        `SELECT id, name FROM channels ORDER BY name`
      );
      
      // 使用改進的匹配邏輯
      const matches: Array<{
        id: string;
        name: string;
        matchScore: number; // 0=精確匹配, 1=別稱精確匹配, 2=完整單詞匹配, 3=部分匹配
      }> = [];
      
      for (const channel of allChannelsResult.rows) {
        const match = matchesChannelName(keyword, channel.name);
        if (match.matched) {
          let score = 3; // 默認部分匹配
          if (match.isExact) {
            score = match.isAlias ? 1 : 0; // 精確匹配優先，原名稱優先於別稱
          } else if (match.isAlias) {
            score = 2; // 別稱完整單詞匹配
          }
          matches.push({ id: channel.id, name: channel.name, matchScore: score });
        }
      }
      
      // 按匹配分數排序（分數越小越優先）
      matches.sort((a, b) => a.matchScore - b.matchScore);
      
      // 如果沒有找到匹配的通路，返回空結果但顯示關鍵字
      if (matches.length === 0) {
        return {
          channelId: '',
          channelName: keyword,
          results: [],
        };
      }

      // 為每個匹配的通路分別查詢回饋
      // 優先返回精確匹配的通路，如果有多個精確匹配，只返回第一個
      // 這樣可以避免部分匹配導致的混亂（例如 "net" 不會同時匹配 "NET" 和 "Netflix"）
      
      // 找出最佳匹配（分數最小的，即最精確的）
      const bestMatches = matches.filter(m => m.matchScore === matches[0].matchScore);
      
      // 只使用最佳匹配的通路（如果有多個精確匹配，只取第一個）
      const bestMatch = bestMatches[0];
      
      if (bestMatch) {
        const channelRewards = await queryChannelRewards([bestMatch.id]);
        if (channelRewards.length > 0) {
          const { baseName } = parseChannelName(bestMatch.name);
          return {
            channelId: bestMatch.id,
            channelName: baseName, // 只顯示原名稱，不顯示別稱
            results: channelRewards[0].results, // 結果已經在 queryChannelRewards 中排序（排除的在前）
          };
        }
      }

      // 沒有找到結果
      return {
        channelId: '',
        channelName: keyword,
        results: [],
      };
    })
  );

  return results.filter((r) => r !== null);
}

/**
 * 查詢通路回饋（核心查詢邏輯）
 */
export async function queryChannelRewards(
  channelIds: string[]
): Promise<
  Array<{
    channelId: string;
    channelName: string;
    results: Array<{
      isExcluded: boolean;
      excludedSchemeName?: string;
      totalRewardPercentage: number;
      rewardBreakdown: string;
      schemeInfo: string;
      requiresSwitch: boolean;
      note?: string;
    }>;
  }>
> {
  if (channelIds.length === 0) return [];

  const results = await Promise.all(
    channelIds.map(async (channelId) => {
      // 取得通路名稱
      const channelResult = await pool.query(
        'SELECT name FROM channels WHERE id = $1',
        [channelId]
      );
      if (channelResult.rows.length === 0) return null;
      const channelName = channelResult.rows[0].name;

      // 1. 找出排除此通路的方案
      const exclusionsResult = await pool.query(
        `SELECT cs.id, cs.name, c.name as card_name
         FROM scheme_channel_exclusions sce
         JOIN card_schemes cs ON sce.scheme_id = cs.id
         JOIN cards c ON cs.card_id = c.id
         WHERE sce.channel_id = $1`,
        [channelId]
      );

      const exclusions = exclusionsResult.rows.map((r) => ({
        schemeId: r.id,
        schemeName: r.name,
        cardName: r.card_name,
      }));

      // 2. 找出適用此通路的卡片方案
      const schemeApplicationsResult = await pool.query(
        `SELECT cs.id, cs.name, cs.requires_switch, cs.activity_end_date, c.name as card_name, sca.note,
                (SELECT json_agg(
                  json_build_object(
                    'percentage', reward_percentage,
                    'method', calculation_method
                  ) ORDER BY display_order
                )
                FROM scheme_rewards sr
                WHERE sr.scheme_id = cs.id) as rewards
         FROM scheme_channel_applications sca
         JOIN card_schemes cs ON sca.scheme_id = cs.id
         JOIN cards c ON cs.card_id = c.id
         WHERE sca.channel_id = $1
         AND cs.id NOT IN (SELECT scheme_id FROM scheme_channel_exclusions WHERE channel_id = $1)`,
        [channelId]
      );

      // 3. 找出適用此通路的支付方式
      const paymentApplicationsResult = await pool.query(
        `SELECT pm.id, pm.name, pca.note,
                (SELECT json_agg(
                  json_build_object(
                    'percentage', reward_percentage,
                    'method', calculation_method
                  ) ORDER BY display_order
                )
                FROM payment_rewards pr
                WHERE pr.payment_method_id = pm.id) as rewards
         FROM payment_channel_applications pca
         JOIN payment_methods pm ON pca.payment_method_id = pm.id
         WHERE pca.channel_id = $1`,
        [channelId]
      );

      // 4. 找出支付方式綁定的卡片方案（適用此通路）
      const paymentSchemeLinksResult = await pool.query(
        `SELECT cs.id, cs.name, cs.requires_switch, cs.activity_end_date, c.name as card_name, 
                pm.name as payment_name, pm.id as payment_id, pca.note,
                (SELECT json_agg(
                  json_build_object(
                    'percentage', reward_percentage,
                    'method', calculation_method
                  ) ORDER BY display_order
                )
                FROM scheme_rewards sr
                WHERE sr.scheme_id = cs.id) as scheme_rewards,
                (SELECT json_agg(
                  json_build_object(
                    'percentage', reward_percentage,
                    'method', calculation_method
                  ) ORDER BY display_order
                )
                FROM payment_rewards pr
                WHERE pr.payment_method_id = pm.id) as payment_rewards
         FROM payment_scheme_links psl
         JOIN card_schemes cs ON psl.scheme_id = cs.id
         JOIN cards c ON cs.card_id = c.id
         JOIN payment_methods pm ON psl.payment_method_id = pm.id
         JOIN payment_channel_applications pca ON pm.id = pca.payment_method_id
         WHERE pca.channel_id = $1
         AND cs.id NOT IN (SELECT scheme_id FROM scheme_channel_exclusions WHERE channel_id = $1)`,
        [channelId]
      );

      // 組合結果
      const schemeResults = schemeApplicationsResult.rows.map((row) => {
        const rewards = row.rewards || [];
        const totalPercentage = rewards.reduce(
          (sum: number, r: any) => sum + parseFloat(r.percentage),
          0
        );
        const breakdown = rewards
          .map((r: any) => `${r.percentage}%`)
          .join('+');

        return {
          isExcluded: false,
          totalRewardPercentage: totalPercentage,
          rewardBreakdown: breakdown,
          schemeInfo: `${row.card_name}-${row.name}`,
          requiresSwitch: row.requires_switch,
          note: row.note || undefined,
          activityEndDate: row.activity_end_date || undefined,
        };
      });

      const paymentResults = paymentApplicationsResult.rows.map((row) => {
        const rewards = row.rewards || [];
        const totalPercentage = rewards.reduce(
          (sum: number, r: any) => sum + parseFloat(r.percentage),
          0
        );
        const breakdown = rewards
          .map((r: any) => `${r.percentage}%`)
          .join('+');

        return {
          isExcluded: false,
          totalRewardPercentage: totalPercentage,
          rewardBreakdown: breakdown || '0%',
          schemeInfo: row.name,
          requiresSwitch: false,
          note: row.note || undefined,
        };
      });

      const paymentSchemeResults = paymentSchemeLinksResult.rows.map((row) => {
        const schemeRewards = row.scheme_rewards || [];
        const paymentRewards = row.payment_rewards || [];
        
        const schemeTotal = schemeRewards.reduce(
          (sum: number, r: any) => sum + parseFloat(r.percentage),
          0
        );
        const paymentTotal = paymentRewards.reduce(
          (sum: number, r: any) => sum + parseFloat(r.percentage),
          0
        );
        
        const totalPercentage = schemeTotal + paymentTotal;
        
        const schemeBreakdown = schemeRewards.map((r: any) => `${r.percentage}%`).join('+');
        const paymentBreakdown = paymentRewards.map((r: any) => `${r.percentage}%`).join('+');
        const breakdown = [schemeBreakdown, paymentBreakdown]
          .filter(b => b.length > 0)
          .join('+') || '0%';

        return {
          isExcluded: false,
          totalRewardPercentage: totalPercentage,
          rewardBreakdown: breakdown,
          schemeInfo: `${row.card_name}-${row.name}-${row.payment_name}`,
          requiresSwitch: row.requires_switch,
          note: row.note || undefined,
          activityEndDate: row.activity_end_date || undefined,
        };
      });

      const exclusionResults = exclusions.map((ex) => ({
        isExcluded: true,
        excludedSchemeName: `${ex.cardName}-${ex.schemeName}`,
        totalRewardPercentage: 0,
        rewardBreakdown: '',
        schemeInfo: `${ex.cardName}-${ex.schemeName}`,
        requiresSwitch: false,
      }));

      // 合併所有結果並排序（排除的置頂，然後按回饋%數降序）
      const allResults = [
        ...exclusionResults,
        ...schemeResults,
        ...paymentResults,
        ...paymentSchemeResults,
      ].sort((a, b) => {
        if (a.isExcluded && !b.isExcluded) return -1;
        if (!a.isExcluded && b.isExcluded) return 1;
        return b.totalRewardPercentage - a.totalRewardPercentage;
      });

      return {
        channelId,
        channelName,
        results: allResults,
      };
    })
  );

  return results.filter((r) => r !== null) as any[];
}

