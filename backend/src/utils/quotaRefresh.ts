import { addMonths, parse, format, isAfter, isBefore, startOfMonth } from 'date-fns';
import { zonedTimeToUtc, utcToZonedTime, format as formatTz } from 'date-fns-tz';
import { QuotaRefreshType } from './types';

// 時區設定：UTC+8 (Asia/Taipei)
export const TIMEZONE = 'Asia/Taipei';

/**
 * 取得 UTC+8 時區的當前時間（作為 Date 物件，但表示 UTC+8 時區的時間）
 */
export function getTaipeiTime(): Date {
  const now = new Date();
  // 取得 UTC+8 時區的當前時間字串，然後解析為 Date
  const taipeiTimeStr = formatTz(now, 'yyyy-MM-dd HH:mm:ss', { timeZone: TIMEZONE });
  // 解析為本地時間（但實際上代表 UTC+8 的時間）
  return new Date(taipeiTimeStr.replace(' ', 'T') + '+08:00');
}

/**
 * 將 UTC+8 時區的時間轉換為 UTC Date 物件（用於儲存到資料庫）
 */
export function toUtcDate(taipeiDate: Date): Date {
  // 將 UTC+8 時區的時間轉換為 UTC
  return zonedTimeToUtc(taipeiDate, TIMEZONE);
}

/**
 * 將資料庫中的 UTC 時間轉換為 UTC+8 時區的 Date 物件
 */
export function fromUtcToTaipei(utcDate: Date): Date {
  return utcToZonedTime(utcDate, TIMEZONE);
}

/**
 * 計算下次刷新時間（使用 UTC+8 時區）
 */
export function calculateNextRefreshTime(
  refreshType: QuotaRefreshType | null,
  refreshValue: number | null,
  refreshDate: string | null,
  activityEndDate: string | null
): Date | null {
  if (!refreshType) return null;

  // 使用 UTC+8 時區的當前時間
  const now = getTaipeiTime();

  switch (refreshType) {
    case 'monthly':
      if (refreshValue === null) return null;
      // 限制在 1-28 之間，避免月份天數不一的問題
      if (refreshValue < 1 || refreshValue > 28) {
        console.warn(`刷新日期 ${refreshValue} 超出範圍 (1-28)，已限制為 28`);
        refreshValue = 28;
      }
      // 每月固定日期刷新（UTC+8 時區）
      // 取得 UTC+8 時區的當前月份開始時間
      const nowTaipei = utcToZonedTime(now, TIMEZONE);
      const currentMonth = startOfMonth(nowTaipei);
      
      // 在 UTC+8 時區創建本月刷新時間（n號 00:00:00）
      const thisMonthRefreshTaipei = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        refreshValue,
        0, 0, 0, 0
      );
      
      // 下個月的刷新時間
      const nextMonthRefreshTaipei = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        refreshValue,
        0, 0, 0, 0
      );

      // 如果這個月的刷新日已過，則設為下個月
      if (isBefore(thisMonthRefreshTaipei, nowTaipei)) {
        // 轉換為 UTC 時間儲存
        return toUtcDate(nextMonthRefreshTaipei);
      }
      // 轉換為 UTC 時間儲存
      return toUtcDate(thisMonthRefreshTaipei);

    case 'date':
      if (!refreshDate) return null;
      // 解析日期並設定為 UTC+8 時區的 00:00:00
      // 假設輸入的日期是 UTC+8 時區的日期
      const [year, month, day] = refreshDate.split('-').map(Number);
      const dateTaipei = new Date(year, month - 1, day, 0, 0, 0, 0);
      // 轉換為 UTC 時間儲存
      return toUtcDate(dateTaipei);

    case 'activity':
      if (!activityEndDate) return null;
      // 解析日期並設定為 UTC+8 時區的 00:00:00
      // 假設輸入的日期是 UTC+8 時區的日期
      const [actYear, actMonth, actDay] = activityEndDate.split('-').map(Number);
      const activityTaipei = new Date(actYear, actMonth - 1, actDay, 0, 0, 0, 0);
      // 轉換為 UTC 時間儲存
      return toUtcDate(activityTaipei);

    default:
      return null;
  }
}

/**
 * 檢查是否需要刷新額度
 * 當時間到達刷新日 00:00:00 時應該刷新（使用 UTC+8 時區）
 */
export function shouldRefreshQuota(nextRefreshAt: Date | null): boolean {
  if (!nextRefreshAt) return false;
  // 將資料庫中的 UTC 時間轉換為 UTC+8 時區進行比較
  const nextRefreshTaipei = utcToZonedTime(nextRefreshAt, TIMEZONE);
  // 取得 UTC+8 時區的當前時間
  const nowTaipei = utcToZonedTime(new Date(), TIMEZONE);
  // 如果刷新時間已過（包括等於），則需要刷新
  return !isAfter(nextRefreshTaipei, nowTaipei);
}

/**
 * 格式化刷新時間顯示（使用 UTC+8 時區）
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
      return `每月${refreshValue}號 (UTC+8)`;
    case 'date':
      if (!refreshDate) return '';
      return format(parse(refreshDate, 'yyyy-MM-dd', new Date()), 'yyyy/MM/dd') + ' (UTC+8)';
    case 'activity':
      if (!activityEndDate) return '';
      return format(parse(activityEndDate, 'yyyy-MM-dd', new Date()), 'yyyy/MM/dd') + ' (UTC+8)';
    default:
      return '';
  }
}


