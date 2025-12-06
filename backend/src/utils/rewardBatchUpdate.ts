import { PoolClient } from 'pg';

export type RewardOwnerTable = 'scheme_rewards' | 'payment_rewards';
export type RewardOwnerColumn = 'scheme_id' | 'payment_method_id';

export interface BulkRewardInput {
  percentage: number | string;
  calculationMethod?: string;
  quotaLimit?: number | string | null;
  quotaRefreshType?: string | null;
  quotaRefreshValue?: number | string | null;
  quotaRefreshDate?: string | null;
  quotaCalculationBasis?: string | null;
  displayOrder?: number | string;
}

// 共用的批量回饋寫入邏輯，避免 schemes 與 payment routes 重複
export async function bulkInsertRewards(
  client: PoolClient,
  table: RewardOwnerTable,
  ownerColumn: RewardOwnerColumn,
  ownerId: string,
  rewards: BulkRewardInput[]
) {
  if (rewards.length === 0) return;

  const validRewards = rewards.filter((r) => r.percentage !== undefined && r.percentage !== null);
  if (validRewards.length === 0) return;

  const percentages = validRewards.map((r) => parseFloat(String(r.percentage)) || 0);
  const calculationMethods = validRewards.map((r) => String(r.calculationMethod || 'round'));
  const quotaLimits = validRewards.map((r) =>
    r.quotaLimit !== undefined && r.quotaLimit !== null ? parseFloat(String(r.quotaLimit)) : null
  );
  const quotaRefreshTypes = validRewards.map((r) => (r.quotaRefreshType ? String(r.quotaRefreshType) : null));
  const quotaRefreshValues = validRewards.map((r) =>
    r.quotaRefreshValue !== undefined && r.quotaRefreshValue !== null ? parseInt(String(r.quotaRefreshValue)) : null
  );
  const quotaRefreshDates = validRewards.map((r) => (r.quotaRefreshDate ? String(r.quotaRefreshDate) : null));
  const quotaCalculationBases = validRewards.map((r) => String(r.quotaCalculationBasis || 'transaction'));
  const displayOrders = validRewards.map((r, idx) =>
    r.displayOrder !== undefined && r.displayOrder !== null ? parseInt(String(r.displayOrder)) : idx
  );

  // 限制表與欄位名稱，避免 SQL Injection
  const allowedTable = table === 'scheme_rewards' ? 'scheme_rewards' : 'payment_rewards';
  const allowedColumn = ownerColumn === 'scheme_id' ? 'scheme_id' : 'payment_method_id';

  await client.query(
    `
      INSERT INTO ${allowedTable} 
      (${allowedColumn}, reward_percentage, calculation_method, quota_limit, 
       quota_refresh_type, quota_refresh_value, quota_refresh_date, quota_calculation_basis, display_order)
      SELECT $1::uuid, unnest($2::numeric[]), unnest($3::text[]), unnest($4::numeric[]),
             unnest($5::text[]), unnest($6::integer[]), unnest($7::date[]), unnest($8::text[]), unnest($9::integer[])
    `,
    [
      ownerId,
      percentages,
      calculationMethods,
      quotaLimits,
      quotaRefreshTypes,
      quotaRefreshValues,
      quotaRefreshDates,
      quotaCalculationBases,
      displayOrders,
    ]
  );
}

