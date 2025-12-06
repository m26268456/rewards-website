import { CalculationMethod } from './types';

/**
 * 計算單次回饋金額 (基礎邏輯)
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
 * 計算總回饋 (包含多個回饋組成)
 */
export function calculateTotalReward(
  amount: number,
  rewards: Array<{
    percentage: number;
    calculationMethod: CalculationMethod;
  }>
) {
  let totalReward = 0;
  const breakdown = rewards.map((r) => {
    const originalReward = (amount * r.percentage) / 100;
    const calculatedReward = calculateReward(amount, r.percentage, r.calculationMethod);
    totalReward += calculatedReward;

    return {
      percentage: r.percentage,
      calculationMethod: r.calculationMethod,
      originalReward,
      calculatedReward,
    };
  });

  return {
    amount,
    totalReward,
    breakdown,
  };
}

/**
 * 計算「邊際回饋」 (用於帳單總額模式)
 * 邏輯：本次回饋 = (累積+本次)的計算結果 - (累積)的計算結果
 */
export function calculateMarginalReward(
  currentAccumulatedAmount: number,
  newAmount: number,
  percentage: number,
  method: CalculationMethod
): number {
  const totalAmount = currentAccumulatedAmount + newAmount;
  
  // 計算加總後的理論回饋
  const totalReward = calculateReward(totalAmount, percentage, method);
  
  // 計算原本的回饋
  const previousReward = calculateReward(currentAccumulatedAmount, percentage, method);
  
  // 差額即為本次新增金額所貢獻的回饋
  return totalReward - previousReward;
}