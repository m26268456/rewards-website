// main/backend/src/utils/types.ts

export type CalculationMethod = 'round' | 'floor' | 'ceil';

export type QuotaRefreshType = 'monthly' | 'date' | 'activity';

// 新增計算基準型別：單筆計算 (transaction) vs 帳單總額 (statement)
export type QuotaCalculationBasis = 'transaction' | 'statement';

export interface RewardComposition {
  percentage: number;
  calculationMethod: CalculationMethod;
  quotaLimit: number | null;
  quotaRefreshType: QuotaRefreshType | null;
  quotaRefreshValue: number | null;
  quotaRefreshDate: string | null;
  // 新增欄位
  quotaCalculationBasis?: QuotaCalculationBasis;
  // 額度資訊
  usedQuota?: number;
  remainingQuota?: number | null;
}

export interface SchemeInfo {
  id: string;
  cardId: string;
  cardName: string;
  schemeName: string;
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
}

export interface PaymentMethodInfo {
  id: string;
  name: string;
  note?: string;
  ownRewardPercentage: number;
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
}

export interface ChannelQueryResult {
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
}

export interface CalculationResult {
  amount: number;
  rewards: Array<{
    percentage: number;
    calculationMethod: CalculationMethod;
    originalReward: number;
    calculatedReward: number;
  }>;
  totalReward: number;
  quotaInfo?: Array<{
    rewardPercentage: number;
    quotaLimit: number | null;
    remainingQuota: number | null;
    referenceAmount: number | null;
  }>;
}

export interface QuotaInfo {
  id: string;
  name: string;
  rewardComposition: string;
  quotaLimits: Array<number | null>;
  usedQuotas: number[];
  remainingQuotas: Array<number | null>;
  referenceAmounts: Array<number | null>;
  refreshTimes: string[];
}

// 資料庫額度查詢使用的原始列型別
export interface QuotaDbRow {
  scheme_id: string | null;
  payment_method_id: string | null;
  card_id: string | null;
  payment_method_id_for_group: string | null;
  name: string | null;
  card_name: string | null;
  scheme_name: string | null;
  payment_method_name: string | null;
  shared_reward_group_id: string | null;
  reward_id: string;
  reward_percentage: string | number;
  calculation_method: string;
  quota_limit: string | number | null;
  quota_refresh_type: string;
  quota_refresh_value: number;
  quota_refresh_date: Date | null;
  quota_calculation_basis: string;
  activity_end_date: Date | null;
  display_order: number;
  used_quota: string | number | null;
  remaining_quota: string | number | null;
  current_amount: string | number | null;
  next_refresh_at: Date | null;
}