import { CalculationMethod } from './types';

/**
 * 計算回饋金額
 * @param amount 消費金額
 * @param percentage 回饋百分比（例如 0.3 表示 0.3%）
 * @param method 計算方式
 * @returns 計算後的回饋金額
 */
export function calculateReward(
  amount: number,
  percentage: number,
  method: CalculationMethod
): number {
  const originalReward = (amount * percentage) / 100;

  switch (method) {
    case 'round':
      return Math.round(originalReward);
    case 'floor':
      return Math.floor(originalReward);
    case 'ceil':
      return Math.ceil(originalReward);
    default:
      return originalReward;
  }
}

/**
 * 計算多個回饋組成的總回饋
 */
export function calculateTotalReward(
  amount: number,
  rewards: Array<{
    percentage: number;
    calculationMethod: CalculationMethod;
  }>
): {
  breakdown: Array<{
    percentage: number;
    calculationMethod: CalculationMethod;
    originalReward: number;
    calculatedReward: number;
  }>;
  totalReward: number;
} {
  const breakdown = rewards.map((reward) => {
    const originalReward = (amount * reward.percentage) / 100;
    const calculatedReward = calculateReward(
      amount,
      reward.percentage,
      reward.calculationMethod
    );

    return {
      percentage: reward.percentage,
      calculationMethod: reward.calculationMethod,
      originalReward,
      calculatedReward,
    };
  });

  const totalReward = breakdown.reduce(
    (sum, item) => sum + item.calculatedReward,
    0
  );

  return { breakdown, totalReward };
}


