import { pool } from '../config/database';
import { logger } from '../utils/logger';

/**
 * 取得所有支付方式及其資訊（用於方案總覽）
 */
export async function getAllPaymentMethods(): Promise<
  Array<{
    id: string;
    name: string;
    note?: string;
    ownRewardPercentage: number;
    displayOrder: number;
    linkedSchemes: Array<{
      schemeId: string;
      cardName: string;
      schemeName: string;
    }>;
    applications: Array<{
      channelId: string;
      channelName: string;
      note?: string;
    }>;
  }>
> {
  try {
    const result = await pool.query(
      `
      SELECT 
        pm.id,
        pm.name,
        pm.note,
        pm.own_reward_percentage,
        pm.display_order,
        json_agg(DISTINCT
          CASE 
            WHEN cs.id IS NOT NULL THEN jsonb_build_object(
              'schemeId', cs.id,
              'cardName', c.name,
              'schemeName', cs.name
            )
            ELSE NULL
          END
        ) FILTER (WHERE cs.id IS NOT NULL) AS linked_schemes,
        json_agg(DISTINCT
          CASE
            WHEN ch.id IS NOT NULL THEN jsonb_build_object(
              'channelId', ch.id,
              'channelName', ch.name,
              'note', pca.note
            )
            ELSE NULL
          END
        ) FILTER (WHERE ch.id IS NOT NULL) AS applications
      FROM payment_methods pm
      LEFT JOIN payment_scheme_links psl ON psl.payment_method_id = pm.id
      LEFT JOIN card_schemes cs ON psl.scheme_id = cs.id
      LEFT JOIN cards c ON cs.card_id = c.id
      LEFT JOIN payment_channel_applications pca ON pca.payment_method_id = pm.id
      LEFT JOIN channels ch ON pca.channel_id = ch.id
      GROUP BY pm.id
      ORDER BY pm.display_order, pm.created_at
      `
    );

    return result.rows.map((row) => {
      const linkedSchemes = (row.linked_schemes as any[] | null) ?? [];
      const applications = (row.applications as any[] | null) ?? [];

      return {
        id: row.id,
        name: row.name,
        note: row.note || undefined,
        ownRewardPercentage: row.own_reward_percentage ? parseFloat(row.own_reward_percentage) : 0,
        displayOrder: row.display_order || 0,
        linkedSchemes,
        applications,
      };
    });
  } catch (error) {
    logger.error('getAllPaymentMethods 錯誤:', error);
    throw error;
  }
}

