export type CalculationMethod = 'round' | 'floor' | 'ceil';

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


