import { z } from 'zod';

// 卡片驗證
export const createCardSchema = z.object({
  name: z.string().min(1).max(100),
  note: z.string().max(500).optional().nullable(),
  displayOrder: z.number().int().min(0).optional().default(0),
});

export const updateCardSchema = createCardSchema.partial().extend({
  id: z.string().uuid(),
});

// 方案驗證
export const createSchemeSchema = z.object({
  cardId: z.string().uuid(),
  name: z.string().min(1).max(100),
  note: z.string().max(500).optional().nullable(),
  requiresSwitch: z.boolean().optional().default(false),
  activityStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  activityEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  displayOrder: z.number().int().min(0).optional().default(0),
  sharedRewardGroupId: z.string().uuid().optional().nullable(),
});

export const updateSchemeSchema = createSchemeSchema.omit({ cardId: true }).partial().extend({
  id: z.string().uuid(),
});

// 回饋組成驗證
// 修改重點：quotaRefreshValue 限制最大值為 28
export const rewardSchema = z.object({
  percentage: z.number().min(0).max(100),
  calculationMethod: z.enum(['round', 'floor', 'ceil']).default('round'),
  quotaLimit: z.number().min(0).optional().nullable(),
  quotaRefreshType: z.enum(['monthly', 'date', 'activity']).optional().nullable(),
  quotaRefreshValue: z.number().int().min(1).max(28, { message: "每月刷新日期必須在 1 到 28 號之間" }).optional().nullable(),
  quotaRefreshDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
});

// 通路驗證
export const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  isCommon: z.boolean().optional().default(false),
  displayOrder: z.number().int().min(0).optional().default(0),
});

export const updateChannelSchema = createChannelSchema.partial().extend({
  id: z.string().uuid(),
});

// 支付方式驗證
export const createPaymentMethodSchema = z.object({
  name: z.string().min(1).max(100),
  note: z.string().max(500).optional().nullable(),
  ownRewardPercentage: z.number().min(0).max(100).optional().default(0),
  displayOrder: z.number().int().min(0).optional().default(0),
});

export const updatePaymentMethodSchema = createPaymentMethodSchema.partial().extend({
  id: z.string().uuid(),
});

// 交易驗證
export const createTransactionSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(200),
  amount: z.number().min(0),
  typeId: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
  schemeId: z.string().uuid().optional().nullable(),
  paymentMethodId: z.string().uuid().optional().nullable(),
});

// 計算驗證
export const calculateSchema = z.object({
  amount: z.number().min(0),
  rewards: z.array(rewardSchema).length(3),
});

export const calculateWithSchemeSchema = z.object({
  amount: z.number().min(0),
  schemeId: z.string().uuid().optional().nullable(),
  paymentMethodId: z.string().uuid().optional().nullable(),
});

// 查詢驗證
export const queryChannelsSchema = z.object({
  channelIds: z.array(z.string().uuid()).optional(),
  keywords: z.array(z.string().min(1)).optional(),
}).refine(data => data.channelIds || data.keywords, {
  message: '必須提供 channelIds 或 keywords',
});