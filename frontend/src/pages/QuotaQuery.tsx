import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';

interface QuotaInfo {
  schemeId: string | null;
  paymentMethodId: string | null;
  name: string;
  rewardComposition: string;
  calculationMethods: string[];
  quotaLimits: Array<number | null>;
  currentAmounts: number[];
  usedQuotas: number[]; // a: 系統計算的額度
  manualAdjustments?: number[]; // b: 人工調整值
  totalUsedQuotas?: number[]; // c: a + b
  remainingQuotas: Array<number | null>;
  referenceAmounts: Array<number | null>;
  refreshTimes: string[];
  rewardIds: string[];
  quotaCalculationBases?: string[];
  cardId?: string | null;
  paymentMethodIdForGroup?: string | null;
  cardName?: string | null;
  paymentMethodName?: string | null;
  schemeName?: string | null;
}

export default function QuotaQuery() {
  const [quotas, setQuotas] = useState<QuotaInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    setCurrentTime(new Date().toLocaleString('zh-TW', { hour12: false }));
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleString('zh-TW', { hour12: false })), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadQuotas();
    const interval = setInterval(loadQuotas, 60000);
    return () => clearInterval(interval);
  }, []);

  // 點擊空白 / ESC 收合
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedCards(new Set());
        setExpandedPayments(new Set());
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setExpandedCards(new Set());
        setExpandedPayments(new Set());
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  const loadQuotas = async () => {
    try {
      setLoading(true);
      const res = await api.get('/quota');
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        const processedData = res.data.data.map((quota: QuotaInfo) => {
          if (!quota.schemeId && quota.paymentMethodId) {
            if ((!quota.rewardIds || quota.rewardIds.length === 0 || quota.rewardIds.every(id => !id || id.trim() === '')) 
                && quota.rewardComposition && quota.rewardComposition.trim() !== '') {
              const count = quota.rewardComposition.split('/').length;
              quota.rewardIds = Array(count).fill('');
            }
          }
          return quota;
        });
        setQuotas(processedData);
      } else {
        console.error('載入額度錯誤: 資料格式不正確', res.data);
        setQuotas([]);
      }
    } catch (error: any) {
      console.error('載入額度錯誤:', error);
      alert('載入額度失敗: ' + (error.response?.data?.error || error.message || '未知錯誤'));
      setQuotas([]);
    } finally {
      setLoading(false);
    }
  };

  const formatQuotaInfo = (
    used: number, // a: 系統計算的額度
    remaining: number | null,
    limit: number | null,
    manualAdjustment?: number // b: 人工調整值
  ) => {
    const adjustment = manualAdjustment !== undefined ? manualAdjustment : 0;
    const totalUsed = used + adjustment; // c = a + b
    const displayUsed = adjustment !== 0 
      ? `${used}${adjustment >= 0 ? '+' : ''}${adjustment}=${totalUsed}`
      : used.toLocaleString();
    const usedStr = used.toLocaleString();
    const remainingStr = remaining === null ? '無上限' : remaining.toLocaleString();
    const limitStr = limit === null ? '無上限' : limit.toLocaleString();
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-600">
          <span className="font-medium">已用：</span>
          <span className={totalUsed > 0 ? 'text-orange-600' : 'text-gray-500'}>
            {displayUsed}
          </span>
        </div>
        <div className="text-xs text-gray-600">
          <span className="font-medium">剩餘：</span>
          <span className={remaining !== null && remaining < (limit || 0) * 0.2 ? 'text-red-600 font-semibold' : 'text-green-600'}>{remainingStr}</span>
        </div>
        <div className="text-xs text-gray-500">
          <span className="font-medium">上限：</span>
          {limitStr}
        </div>
      </div>
    );
  };

  const formatConsumptionInfo = (
    current: number,
    reference: number | null
  ) => {
    const currentStr = current.toLocaleString();
    const referenceStr = reference === null ? '無上限' : Math.round(reference).toLocaleString();
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-600">
          <span className="font-medium">消費：</span>
          <span className={current > 0 ? 'text-blue-600' : 'text-gray-500'}>{currentStr}</span>
        </div>
        <div className="text-xs text-gray-600">
          <span className="font-medium">參考：</span>
          <span className="text-purple-600">{referenceStr}</span>
        </div>
      </div>
    );
  };

  const renderQuotaTable = (quotaList: QuotaInfo[]) => {
    if (quotaList.length === 0) return null;
    
    // 簡化：不再有共同回饋群組，直接逐項呈現
    const groupByShared = (items: QuotaInfo[]) => {
      return items.map((item, idx) => ({
        key: item.schemeId ? `scheme-${item.schemeId}` : `pay-${item.paymentMethodId || idx}`,
        items: [item],
      }));
    };
    
    const groupedQuotas = groupByShared(quotaList);

    // 為每個群組分配顏色索引
    const colorIndexMap = new Map<string, number>();
    groupedQuotas.forEach(({ key }, idx) => colorIndexMap.set(key, idx));
    
    return (
      <div className="mb-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* 表格可橫向捲動，列寬依內容展開 */}
          <div className="overflow-x-auto w-full">
            <table className="table-auto min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-20 shadow-sm">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[140px] sticky left-0 bg-gray-50 z-30 border-r border-gray-200">
                    名稱
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                    回饋組成
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[140px]">
                    計算方式
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[160px]">
                    額度狀態
                    <div className="text-[10px] font-normal text-gray-500 mt-1">
                      已用/剩餘/上限
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[160px]">
                    消費資訊
                    <div className="text-[10px] font-normal text-gray-500 mt-1">
                      消費/參考餘額
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[140px]">
                    刷新時間
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupedQuotas.map(({ key: sharedKey, items: quotas }) => {
                  const isSharedGroup = !sharedKey.startsWith('solo-');
                  const colorIndex = colorIndexMap.get(sharedKey) || 0;
                  
                  // 排序：root 方案在前，被綁定方案在後
                  const sortedItems = quotas.slice();
                  
                  const primary = sortedItems[0];
                  let validRewardIndices: number[] = [];
                  if (primary.rewardIds && primary.rewardIds.length > 0) {
                    primary.rewardIds.forEach((_, index) => validRewardIndices.push(index));
                  } else if (primary.rewardComposition && primary.rewardComposition.trim() !== '') {
                    const count = primary.rewardComposition.split('/').length;
                    validRewardIndices = Array.from({ length: count }, (_, i) => i);
                  } else {
                    validRewardIndices = [0];
                  }

                  // 共享群組只渲染第一個回饋組成，非共享群組渲染所有回饋組成
                  const rowsToRender = validRewardIndices;

                  const bgPairShared = [['bg-blue-50', 'bg-blue-100'], ['bg-blue-100', 'bg-blue-50']];
                  const bgPairSolo = [['bg-white', 'bg-gray-50'], ['bg-gray-50', 'bg-white']];
                  const colorPair = isSharedGroup ? bgPairShared[colorIndex % 2] : bgPairSolo[colorIndex % 2];
                  const borderColor = isSharedGroup ? 'border-blue-300' : 'border-gray-200';

                  // 找出 root 方案名稱和被綁定方案名稱
                  const rootName = primary.schemeName || primary.name || '';
                  const rootNameParts = rootName.split('-');
                  const rootNameDisplay = rootNameParts.length > 1 ? rootNameParts[rootNameParts.length - 1] : rootName;
                  
                  const childNames: string[] = [];

                  return rowsToRender.map((rIdx: number) => {
                    const isFirst = rIdx === 0;
                    const rewardPercentage = primary.rewardComposition?.split('/')[rIdx]?.replace('%', '') || '';
                    const calculationMethod = primary.calculationMethods?.[rIdx] || 'round';
                    const calculationMethodText = 
                      calculationMethod === 'round' ? '四捨五入' :
                      calculationMethod === 'floor' ? '無條件捨去' :
                      calculationMethod === 'ceil' ? '無條件進位' : '四捨五入';
                    const rawBasis = (primary as any).quotaCalculationBases?.[rIdx] || 'transaction';
                    const basis = typeof rawBasis === 'string'
                      ? rawBasis.trim().toLowerCase()
                      : 'transaction';
                    const basisText = basis === 'statement' ? '帳單總額' : '單筆回饋';
                    
                    const usedQuota = primary.usedQuotas?.[rIdx] || 0;
                    const remainingQuota = primary.remainingQuotas?.[rIdx] ?? null;
                    const quotaLimit = primary.quotaLimits?.[rIdx] ?? null;
                    const currentAmount = primary.currentAmounts?.[rIdx] || 0;
                    const referenceAmount = primary.referenceAmounts?.[rIdx] ?? null;

                  const bgColor = colorPair[rIdx % 2 === 0 ? 0 : 1];
                    
                    return (
                  <tr key={`${sharedKey}-${primary.schemeId || primary.paymentMethodId || 'q'}-${rIdx}`} className={`${bgColor} border-l-4 ${borderColor}`}>
                        {isFirst && (
                          <td
                            rowSpan={rowsToRender.length}
                        className={`px-3 py-2 text-sm font-medium sticky left-0 ${bgColor} z-10 border-r border-gray-200 align-middle whitespace-nowrap min-w-[140px]`}
                          >
                            <div className="flex items-center">
                              <div className="font-semibold">{rootNameDisplay}</div>
                            </div>
                          </td>
                        )}
                        <td className="px-3 py-2 text-sm align-top whitespace-nowrap min-w-[120px]">
                          <span className="bg-orange-100 px-1 rounded font-bold">{rewardPercentage ? `${rewardPercentage}%` : '-'}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 space-y-1 whitespace-nowrap min-w-[140px]">
                          <div>{calculationMethodText}</div>
                          <div className={`text-[11px] rounded px-1 inline-block ${
                            basis === 'statement' 
                              ? 'text-blue-700 border border-blue-200 bg-blue-50' 
                              : 'text-purple-700 border border-purple-200 bg-purple-50'
                          }`}>
                            {basisText}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-sm align-top whitespace-nowrap min-w-[160px]">
                          {formatQuotaInfo(
                            usedQuota, 
                            remainingQuota, 
                            quotaLimit,
                            primary.manualAdjustments?.[rIdx]
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm align-top whitespace-nowrap min-w-[160px]">
                          {formatConsumptionInfo(currentAmount, referenceAmount)}
                        </td>
                        <td className="px-3 py-2 text-sm align-top whitespace-nowrap min-w-[140px]">
                          <div>{primary.refreshTimes?.[rIdx] || '-'}</div>
                        </td>
                      </tr>
                    );
                  });
                }).flat()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const toggleCard = (cardId: string) => {
    const newExpanded = new Set<string>();
    if (!expandedCards.has(cardId)) {
      newExpanded.add(cardId);
    }
    setExpandedCards(newExpanded);
  };

  const togglePayment = (paymentId: string) => {
    const newExpanded = new Set<string>();
    if (!expandedPayments.has(paymentId)) {
      newExpanded.add(paymentId);
    }
    setExpandedPayments(newExpanded);
  };

  const cardQuotas = quotas.filter(q => q.schemeId && !q.paymentMethodId);
  const paymentQuotas = quotas.filter(q => !q.schemeId && q.paymentMethodId);

  const cardGroups = new Map<string, QuotaInfo[]>();
  cardQuotas.forEach(quota => {
    if (!quota.cardId) return;
    const cardId = quota.cardId;
    if (!cardGroups.has(cardId)) cardGroups.set(cardId, []);
    cardGroups.get(cardId)!.push(quota);
  });

  const paymentGroups = new Map<string, QuotaInfo[]>();
  paymentQuotas.forEach(quota => {
    const paymentId = quota.paymentMethodIdForGroup || quota.paymentMethodId || 'unknown';
    if (!paymentGroups.has(paymentId)) paymentGroups.set(paymentId, []);
    paymentGroups.get(paymentId)!.push(quota);
  });

  const hasAnyQuota = cardQuotas.length > 0 || paymentQuotas.length > 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
          額度查詢
        </h2>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
          <span className="ml-3 text-gray-600">載入中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" ref={rootRef}>
      <div className="flex items-center justify-between">
      <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
        額度查詢
      </h2>
        <div className="text-sm font-mono bg-gray-100 px-2 rounded">{currentTime}</div>
      </div>

      {!hasAnyQuota && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">目前沒有任何額度資料。請先新增卡片方案或支付方式並設定回饋組成。</p>
        </div>
      )}

      {cardGroups.size > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">信用卡</h3>
          <div className="space-y-2">
            {Array.from(cardGroups.entries()).map(([cardId, quotas]) => {
              const cardName = quotas[0]?.cardName || cardId;
              const isExpanded = expandedCards.has(cardId);
              return (
                <div key={cardId} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => toggleCard(cardId)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">{cardName}</span>
                    <span className="text-gray-500">{isExpanded ? '▼' : '▶'}</span>
                  </button>
                  {isExpanded && renderQuotaTable(quotas)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {paymentGroups.size > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">支付方式</h3>
          <div className="space-y-2">
            {Array.from(paymentGroups.entries()).map(([paymentId, quotas]) => {
              const paymentName = quotas[0]?.paymentMethodName || quotas[0]?.name || '未知支付方式';
              const isExpanded = expandedPayments.has(paymentId);
              return (
                <div key={paymentId} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => togglePayment(paymentId)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">{paymentName}</span>
                    <span className="text-gray-500">{isExpanded ? '▼' : '▶'}</span>
                  </button>
                  {isExpanded && renderQuotaTable(quotas)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}