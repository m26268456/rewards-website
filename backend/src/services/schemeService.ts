import { pool } from '../config/database';
import { SchemeInfo, RewardComposition } from '../utils/types';
import { parseChannelName, matchesChannelName } from '../utils/channelUtils';

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
    // 優化：使用 JOIN 一次性獲取所有資料，避免 N+1 查詢
    const result = await pool.query(`
      SELECT 
        c.id as card_id,
        c.name as card_name,
        c.note as card_note,
        c.display_order as card_display_order,
        cs.id as scheme_id,
        cs.name as scheme_name,
        cs.note as scheme_note,
        cs.requires_switch,
        cs.activity_start_date,
        cs.activity_end_date,
        cs.display_order as scheme_display_order,
        sr.reward_percentage,
        sr.calculation_method,
        sr.quota_limit,
        sr.quota_refresh_type,
        sr.quota_refresh_value,
        sr.quota_refresh_date,
        sr.quota_calculation_basis,
        sr.display_order as reward_display_order,
        excl_ch.id as exclusion_channel_id,
        excl_ch.name as exclusion_channel_name,
        app_ch.id as application_channel_id,
        app_ch.name as application_channel_name,
        sca.note as application_note
      FROM cards c
      LEFT JOIN card_schemes cs ON c.id = cs.card_id
      LEFT JOIN scheme_rewards sr ON cs.id = sr.scheme_id
      LEFT JOIN scheme_channel_exclusions sce ON cs.id = sce.scheme_id
      LEFT JOIN channels excl_ch ON sce.channel_id = excl_ch.id
      LEFT JOIN scheme_channel_applications sca ON cs.id = sca.scheme_id
      LEFT JOIN channels app_ch ON sca.channel_id = app_ch.id
      ORDER BY c.display_order, c.created_at, cs.display_order, cs.created_at, sr.display_order
    `);

    // 組織資料結構
    const cardsMap = new Map<string, {
      id: string;
      name: string;
      note?: string;
      displayOrder: number;
      schemes: Map<string, {
        id: string;
        name: string;
        note?: string;
        requiresSwitch: boolean;
        activityStartDate?: string;
        activityEndDate?: string;
        rewards: RewardComposition[];
        exclusions: Set<string>;
        applications: Map<string, {
          channelId: string;
          channelName: string;
          note?: string;
        }>;
      }>;
    }>();

    for (const row of result.rows) {
      // 處理卡片
      if (!cardsMap.has(row.card_id)) {
        cardsMap.set(row.card_id, {
          id: row.card_id,
          name: row.card_name,
          note: row.card_note || undefined,
          displayOrder: row.card_display_order || 0,
          schemes: new Map(),
        });
      }
      const card = cardsMap.get(row.card_id)!;

      // 處理方案
      if (row.scheme_id && !card.schemes.has(row.scheme_id)) {
        card.schemes.set(row.scheme_id, {
          id: row.scheme_id,
          name: row.scheme_name,
          note: row.scheme_note || undefined,
          requiresSwitch: row.requires_switch || false,
          activityStartDate: row.activity_start_date
            ? (row.activity_start_date instanceof Date
                ? row.activity_start_date.toISOString().split('T')[0]
                : String(row.activity_start_date).split('T')[0])
            : undefined,
          activityEndDate: row.activity_end_date
            ? (row.activity_end_date instanceof Date
                ? row.activity_end_date.toISOString().split('T')[0]
                : String(row.activity_end_date).split('T')[0])
            : undefined,
          rewards: [],
          exclusions: new Set(),
          applications: new Map(),
        });
      }
      const scheme = row.scheme_id ? card.schemes.get(row.scheme_id) : null;

      if (scheme) {
        // 處理回饋組成
        if (row.reward_percentage !== null && row.reward_percentage !== undefined) {
          const rewardExists = scheme.rewards.some(r => 
            r.percentage === parseFloat(row.reward_percentage) &&
            r.calculationMethod === (row.calculation_method || 'round')
          );
          if (!rewardExists) {
            scheme.rewards.push({
              percentage: parseFloat(row.reward_percentage) || 0,
              calculationMethod: row.calculation_method || 'round',
              quotaLimit: row.quota_limit ? parseFloat(row.quota_limit) : null,
              quotaRefreshType: row.quota_refresh_type || null,
              quotaRefreshValue: row.quota_refresh_value || null,
              quotaRefreshDate: row.quota_refresh_date
                ? (row.quota_refresh_date instanceof Date
                    ? row.quota_refresh_date.toISOString().split('T')[0]
                    : String(row.quota_refresh_date).split('T')[0])
                : null,
              quotaCalculationBasis: row.quota_calculation_basis || 'transaction',
            });
          }
        }

        // 處理排除通路
        if (row.exclusion_channel_id) {
          scheme.exclusions.add(row.exclusion_channel_name);
        }

        // 處理適用通路
        if (row.application_channel_id) {
          if (!scheme.applications.has(row.application_channel_id)) {
            scheme.applications.set(row.application_channel_id, {
              channelId: row.application_channel_id,
              channelName: row.application_channel_name,
              note: row.application_note || undefined,
            });
          }
        }
      }
    }

    // 轉換為最終格式
    return Array.from(cardsMap.values()).map(card => ({
      id: card.id,
      name: card.name,
      note: card.note,
      displayOrder: card.displayOrder,
      schemes: Array.from(card.schemes.values()).map(scheme => ({
        id: scheme.id,
        name: scheme.name,
        note: scheme.note,
        requiresSwitch: scheme.requiresSwitch,
        activityStartDate: scheme.activityStartDate,
        activityEndDate: scheme.activityEndDate,
        rewards: scheme.rewards.sort((a, b) => {
          // 按原始順序排序（如果有 display_order）
          return 0;
        }),
        exclusions: Array.from(scheme.exclusions),
        applications: Array.from(scheme.applications.values()),
      })),
    }));
  } catch (error) {
    console.error('getAllCardsWithSchemes 錯誤:', error);
    throw error;
  }
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

      // 返回所有匹配的通路（支持部分匹配時返回多個結果）
      // 例如："NET" 可以匹配 "NET" 和 "NETFLIX"，分別返回兩個結果
      const channelRewardsList = [];
      for (const match of matches) {
        const channelRewards = await queryChannelRewards([match.id]);
        if (channelRewards.length > 0) {
          const { baseName } = parseChannelName(match.name);
          channelRewardsList.push({
            channelId: match.id,
            channelName: baseName,
            results: channelRewards[0].results,
          });
        }
      }
      
      // 如果找到匹配的通路，返回所有結果
      if (channelRewardsList.length > 0) {
        return channelRewardsList;
      }

      // 沒有找到結果
      return [{
        channelId: '',
        channelName: keyword,
        results: [],
      }];
    })
  );

  // 將結果展平（因為每個關鍵字可能返回多個匹配）
  const flattened = results.flat().filter((r) => r !== null);
  return flattened;
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
      // 修正：移除 payment_rewards 的計算，只保留信用卡方案的回饋
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
                WHERE sr.scheme_id = cs.id) as scheme_rewards
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
        // 修正：不再加總 Payment Rewards
        
        const schemeTotal = schemeRewards.reduce(
          (sum: number, r: any) => sum + parseFloat(r.percentage),
          0
        );
        
        const totalPercentage = schemeTotal;
        
        const schemeBreakdown = schemeRewards.map((r: any) => `${r.percentage}%`).join('+');
        const breakdown = schemeBreakdown || '0%';

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