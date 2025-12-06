import { addMonths, isAfter, startOfMonth, setDate } from 'date-fns';
import { zonedTimeToUtc, format as formatTz } from 'date-fns-tz';
import { QuotaRefreshType } from './types';

// 時區設定：UTC+8 (Asia/Taipei)
export const TIMEZONE = 'Asia/Taipei';

/**
 * 取得 UTC+8 時區的當前時間（作為 Date 物件，但表示 UTC+8 時區的時間）
 */
export function getTaipeiTime(): Date {
  const now = new Date();
  // 取得 UTC+8 時區的當前時間字串，然後解析為 Date
  // 例如：現在是 UTC 12:00，UTC+8 是 20:00，這裡返回的 Date 物件時間部分就是 20:00
  const taipeiTimeStr = formatTz(now, 'yyyy-MM-dd HH:mm:ss', { timeZone: TIMEZONE });
  return new Date(taipeiTimeStr);
}

/**
 * 將本地構造的日期（代表台北時間）轉換回 UTC 時間儲存到資料庫
 * 例如：輸入 2023-12-01 00:00:00 (視為台北時間)，輸出 2023-11-30 16:00:00 (UTC)
 */
export function toUtcDate(taipeiDate: Date): Date {
  return zonedTimeToUtc(taipeiDate, TIMEZONE);
}

/**
 * 計算下次刷新時間（回傳 UTC Date 用於儲存）
 * 邏輯：
 * 1. 取得當前台北時間
 * 2. 根據設定構造「本週期」的刷新點（台北時間）
 * 3. 如果「本週期」刷新點已過，則構造「下週期」的刷新點
 * 4. 將最終的刷新點轉換為 UTC
 */
export function calculateNextRefreshTime(
  refreshType: QuotaRefreshType | null,
  refreshValue: number | null,
  refreshDate: string | null,
  activityEndDate: string | null
): Date | null {
  if (!refreshType) return null;

  const nowTaipei = getTaipeiTime();

  switch (refreshType) {
    case 'monthly':
      if (refreshValue === null) return null;
      // 強制限制在 1-28 號 (雖然 Validator 已擋，但此處做雙重保險)
      const safeRefreshValue = Math.min(Math.max(refreshValue, 1), 28);

      // 取得本月 1 號
      const currentMonthStart = startOfMonth(nowTaipei);
      
      // 構造本月的刷新時間點 (例如：本月 5 號 00:00:00)
      let nextRefreshTaipei = setDate(currentMonthStart, safeRefreshValue);
      nextRefreshTaipei.setHours(0, 0, 0, 0);

      // 如果本月的刷新時間點已經過了（或就是現在），則計算下個月的刷新時間點
      if (!isAfter(nextRefreshTaipei, nowTaipei)) {
        nextRefreshTaipei = addMonths(nextRefreshTaipei, 1);
      }

      return toUtcDate(nextRefreshTaipei);

    case 'date':
      if (!refreshDate) return null;
      // 解析指定日期 (輸入格式 YYYY-MM-DD)
      const [year, month, day] = refreshDate.split('-').map(Number);
      
      // 構造台北時間的日期
      const targetDateTaipei = new Date(year, month - 1, day, 0, 0, 0, 0);
      
      // 如果指定日期已過，則不再刷新 (回傳 null 或保持原樣，視業務邏輯而定，此處回傳 null 表示不再刷新)
      if (!isAfter(targetDateTaipei, nowTaipei)) {
        return null; 
      }
      
      return toUtcDate(targetDateTaipei);

    case 'activity':
      if (!activityEndDate) return null;
      // 活動結束日刷新通常指活動結束後歸零或重置
      const [actYear, actMonth, actDay] = activityEndDate.split('-').map(Number);
      const activityEndTaipei = new Date(actYear, actMonth - 1, actDay, 0, 0, 0, 0);
      
      // 邏輯同上，只有在未來才設定
      if (!isAfter(activityEndTaipei, nowTaipei)) {
        return null;
      }
      
      return toUtcDate(activityEndTaipei);

    default:
      return null;
  }
}

/**
 * 檢查是否需要刷新額度
 * @param nextRefreshAtDb 資料庫中儲存的 UTC 下次刷新時間
 */
export function shouldRefreshQuota(nextRefreshAtDb: Date | null): boolean {
  if (!nextRefreshAtDb) return false;

  const now = new Date(); // 當前 UTC 時間
  const refreshTime = new Date(nextRefreshAtDb); // 資料庫 UTC 時間

  // 如果 當前時間 >= 刷新時間，則需要刷新
  // 這裡直接比較 UTC 時間即可，不需要轉時區
  return now >= refreshTime;
}

/**
 * 格式化刷新時間顯示
 */
export function formatRefreshTime(
  refreshType: QuotaRefreshType | null,
  refreshValue: number | null,
  refreshDate: string | null,
  activityEndDate: string | null
): string {
  if (!refreshType) return '';

  switch (refreshType) {
    case 'monthly':
      if (refreshValue === null) return '';
      const safeValue = Math.min(Math.max(refreshValue, 1), 28);
      return `每月 ${safeValue} 號`;
    case 'date':
      if (!refreshDate) return '';
      return `${refreshDate}`;
    case 'activity':
      if (!activityEndDate) return '';
      return `活動結束日: ${activityEndDate}`;
    default:
      return '';
  }
}