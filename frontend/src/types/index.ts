// 共享的 TypeScript 類型定義

export interface Channel {
  id: string;
  name: string;
  isCommon: boolean;
  display_order?: number;
}

export interface Card {
  id: string;
  name: string;
  note?: string | null;
  display_order: number;
  schemes?: Scheme[];
}

export interface Scheme {
  id: string;
  name: string;
  note?: string | null;
  requires_switch: boolean;
  display_order?: number;
  activity_start_date?: string | null;
  activity_end_date?: string | null;
  rewards?: Array<{
    percentage: number;
    calculation_method: string;
    quota_limit: number | null;
    quota_refresh_type: string | null;
    quota_refresh_value: number | null;
    quota_refresh_date: string | null;
  }>;
  exclusions?: string[];
  applications?: Array<{
    channelId: string;
    channelName: string;
    note?: string;
  }>;
}

export interface PaymentMethod {
  id: string;
  name: string;
  note?: string | null;
  own_reward_percentage: number;
  display_order: number;
  linked_schemes?: Array<{
    schemeId: string;
    cardName: string;
    schemeName: string;
  }>;
  applications?: Array<{
    channelId: string;
    channelName: string;
    note?: string;
  }>;
}

export interface TransactionType {
  id: string;
  name: string;
  display_order: number;
}

export interface CalculationScheme {
  id: string;
  name: string;
  display_order: number;
  scheme_id?: string | null;
  payment_method_id?: string | null;
}


