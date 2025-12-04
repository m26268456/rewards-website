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