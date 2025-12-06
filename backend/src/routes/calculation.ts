import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { calculateTotalReward } from '../utils/rewardCalculation';
import { CalculationMethod } from '../utils/types';
import { logger } from '../utils/logger';

const router = Router();

// 回饋計算（不帶入方案）
router.post('/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, rewards } = req.body;

    if (!amount || !Array.isArray(rewards) || rewards.length !== 3) {
      return res.status(400).json({
        success: false,
        error: '請提供金額和三個回饋組成',
      });
    }

    const calculation = calculateTotalReward(
      parseFloat(amount),
      rewards.map((r: any) => ({
        percentage: parseFloat(r.percentage),
        calculationMethod: r.calculationMethod as CalculationMethod,
      }))
    );

    return res.json({ success: true, data: calculation });
  } catch (error) {
    logger.error('回饋計算失敗 (不帶方案):', error);
    return next(error);
  }
});

// 回饋計算（帶入方案）
router.post('/calculate-with-scheme', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, schemeId, paymentMethodId } = req.body;

    if (!amount) {
      return res.status(400).json({
        success: false,
        error: '請提供金額',
      });
    }

    let rewards: Array<{ percentage: number; calculationMethod: CalculationMethod; id?: string }> = [];
    let rewardsResult: any;

    // 如果有方案 ID，取得方案的回饋組成
    if (schemeId) {
      rewardsResult = await pool.query(
        `SELECT sr.id, sr.reward_percentage, sr.calculation_method, sr.quota_limit,
                sr.quota_refresh_type, sr.quota_refresh_value, sr.quota_refresh_date,
                cs.activity_end_date
         FROM scheme_rewards sr
         JOIN card_schemes cs ON sr.scheme_id = cs.id
         WHERE sr.scheme_id = $1
         ORDER BY sr.display_order`,
        [schemeId]
      );

      rewards = rewardsResult.rows.map((r: any) => ({
        id: r.id,
        percentage: parseFloat(r.reward_percentage),
        calculationMethod: r.calculation_method as CalculationMethod,
      }));
    }

    // 如果有支付方式，加上支付方式本身的回饋
    // 移除本身回饋邏輯，統一使用回饋組成（payment_rewards）
    // 回饋組成已在上面從 payment_scheme_links 和 payment_rewards 取得

    if (rewards.length === 0) {
      return res.status(400).json({
        success: false,
        error: '請提供方案或支付方式',
      });
    }

    // 計算回饋
    const calculation = calculateTotalReward(parseFloat(amount), rewards.map(r => ({
      percentage: r.percentage,
      calculationMethod: r.calculationMethod,
    })));

    // 取得額度資訊（僅針對有方案的情況）
    let quotaInfo: any[] = [];
    if (schemeId && rewardsResult) {
      quotaInfo = await Promise.all(
        rewardsResult.rows.map(async (reward: any, idx: number) => {
          // quota_limit 應該從 scheme_rewards 表讀取，而不是 quota_trackings
          const quotaLimit = reward.quota_limit ? parseFloat(reward.quota_limit) : null;
          
          const quotaResult = await pool.query(
            `SELECT remaining_quota, used_quota
             FROM quota_trackings
             WHERE scheme_id = $1 
               AND reward_id = $2
               AND (payment_method_id = $3 OR (payment_method_id IS NULL AND $3 IS NULL))`,
            [schemeId, reward.id, paymentMethodId || null]
          );

          const quota = quotaResult.rows[0];
          const remainingQuota = quota?.remaining_quota ? parseFloat(quota.remaining_quota) : null;
          const percentage = parseFloat(reward.reward_percentage);

          // 計算預估消費後的剩餘額度
          const calculatedReward = calculation.breakdown[idx]?.calculatedReward || 0;

          // 當前餘額（如果有追蹤記錄，使用 remaining_quota；否則使用 quota_limit）
          let currentQuota: number | null = null;
          if (quotaLimit !== null) {
            if (remainingQuota !== null) {
              currentQuota = remainingQuota;
            } else {
              // 如果還沒有追蹤記錄，使用 quota_limit 作為當前餘額
              currentQuota = quotaLimit;
            }
          }

          // 計算預估消費後的剩餘額度
          let newRemainingQuota: number | null = null;
          if (quotaLimit !== null) {
            if (remainingQuota !== null) {
              newRemainingQuota = remainingQuota - calculatedReward;
            } else {
              // 如果還沒有追蹤記錄，使用 quota_limit 減去計算出的回饋
              newRemainingQuota = quotaLimit - calculatedReward;
            }
          }

          // 計算參考餘額
          const referenceAmount =
            newRemainingQuota !== null ? (newRemainingQuota / percentage) * 100 : null;

          return {
            rewardPercentage: percentage,
            quotaLimit: quotaLimit !== null ? quotaLimit : '無上限',
            currentQuota: currentQuota !== null ? currentQuota : '無上限',
            deductedQuota: calculatedReward,
            remainingQuota: newRemainingQuota !== null ? newRemainingQuota : '無上限',
            referenceAmount: referenceAmount !== null ? referenceAmount : '無上限',
          };
        })
      );
    }

    return res.json({
      success: true,
      data: {
        ...calculation,
        quotaInfo,
      },
    });
  } catch (error) {
    logger.error('回饋計算失敗 (帶方案):', error);
    return next(error);
  }
});

// 取得可用於計算的方案列表（從設定表）
router.get('/schemes', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // 從 calculation_schemes 表取得，按 display_order 排序
    const result = await pool.query(
      `SELECT cs.id, cs.scheme_id, cs.payment_method_id, cs.display_order,
              CASE
                WHEN cs.payment_method_id IS NOT NULL AND cs.scheme_id IS NOT NULL THEN
                  (SELECT c.name || '-' || cs2.name || '-' || pm.name
                   FROM card_schemes cs2
                   JOIN cards c ON cs2.card_id = c.id
                   JOIN payment_methods pm ON cs.payment_method_id = pm.id
                   WHERE cs2.id = cs.scheme_id)
                WHEN cs.scheme_id IS NOT NULL THEN
                  (SELECT c.name || '-' || cs2.name
                   FROM card_schemes cs2
                   JOIN cards c ON cs2.card_id = c.id
                   WHERE cs2.id = cs.scheme_id)
                WHEN cs.payment_method_id IS NOT NULL THEN
                  (SELECT name FROM payment_methods WHERE id = cs.payment_method_id)
              END as name
       FROM calculation_schemes cs
       ORDER BY cs.display_order, cs.id`
    );

    const schemes = result.rows.map((r) => ({
      id: r.scheme_id && r.payment_method_id 
        ? `${r.scheme_id}_${r.payment_method_id}` 
        : (r.scheme_id || r.payment_method_id),
      name: r.name,
      type: r.scheme_id && r.payment_method_id 
        ? 'payment_scheme' 
        : (r.scheme_id ? 'scheme' : 'payment'),
      schemeId: r.scheme_id,
      paymentId: r.payment_method_id,
    }));

    return res.json({ success: true, data: schemes });
  } catch (error) {
    logger.error('取得計算方案列表失敗:', error);
    return next(error);
  }
});

export default router;

