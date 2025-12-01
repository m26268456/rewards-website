import { pool } from '../config/database';

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
    const paymentMethodsResult = await pool.query(
      `SELECT id, name, note, own_reward_percentage, display_order
       FROM payment_methods
       ORDER BY display_order, created_at`
    );

  const paymentMethods = await Promise.all(
    paymentMethodsResult.rows.map(async (pm) => {
      // 取得連結的卡片方案
      const linkedSchemesResult = await pool.query(
        `SELECT cs.id, c.name as card_name, cs.name as scheme_name
         FROM payment_scheme_links psl
         JOIN card_schemes cs ON psl.scheme_id = cs.id
         JOIN cards c ON cs.card_id = c.id
         WHERE psl.payment_method_id = $1
         ORDER BY psl.display_order`,
        [pm.id]
      );

      const linkedSchemes = linkedSchemesResult.rows.map((r) => ({
        schemeId: r.id,
        cardName: r.card_name,
        schemeName: r.scheme_name,
      }));

      // 取得適用通路
      const applicationsResult = await pool.query(
        `SELECT c.id, c.name, pca.note
         FROM payment_channel_applications pca
         JOIN channels c ON pca.channel_id = c.id
         WHERE pca.payment_method_id = $1`,
        [pm.id]
      );

      const applications = applicationsResult.rows.map((r) => ({
        channelId: r.id,
        channelName: r.name,
        note: r.note || undefined,
      }));

      return {
        id: pm.id,
        name: pm.name,
        note: pm.note || undefined,
        ownRewardPercentage: pm.own_reward_percentage ? parseFloat(pm.own_reward_percentage) : 0,
        displayOrder: pm.display_order || 0,
        linkedSchemes,
        applications,
      };
    })
  );

    return paymentMethods;
  } catch (error) {
    console.error('getAllPaymentMethods 錯誤:', error);
    throw error;
  }
}

