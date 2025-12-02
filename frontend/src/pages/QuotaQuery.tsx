import { useState, useEffect } from 'react';
import api from '../utils/api';

interface QuotaInfo {
  schemeId: string | null;
  paymentMethodId: string | null;
  name: string;
  rewardComposition: string;
  calculationMethods: string[];
  quotaLimits: Array<number | null>;
  currentAmounts: number[];
  usedQuotas: number[];
  remainingQuotas: Array<number | null>;
  referenceAmounts: Array<number | null>;
  refreshTimes: string[];
  rewardIds: string[];
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

  useEffect(() => {
    loadQuotas();
    // 每分鐘重新載入一次（檢查是否需要刷新）
    const interval = setInterval(loadQuotas, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadQuotas = async () => {
    try {
      setLoading(true);
      const res = await api.get('/quota');
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        // 處理支付方式：如果 rewardIds 都是空值，但 rewardComposition 有值，則創建對應的 rewardIds
        const processedData = res.data.data.map((quota: QuotaInfo) => {
          // 如果是支付方式且 rewardIds 為空或都是空值，但 rewardComposition 有值
          if (!quota.schemeId && quota.paymentMethodId) {
            if ((!quota.rewardIds || quota.rewardIds.length === 0 || quota.rewardIds.every(id => !id || id.trim() === '')) 
                && quota.rewardComposition && quota.rewardComposition.trim() !== '') {
              // 根據 rewardComposition 的數量創建對應的 rewardIds（使用空字串作為佔位符）
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

  const formatQuota = (value: number | null) => {
    if (value === null) return '無上限';
    return value.toLocaleString();
  };

  // 將額度分為兩類：信用卡、支付方式（移除信用卡綁定支付方式）
  const cardQuotas = quotas.filter(q => q.schemeId && !q.paymentMethodId);
  const paymentQuotas = quotas.filter(q => !q.schemeId && q.paymentMethodId);

  // 按卡片分組（直接列出所有卡片，不使用"未知卡片"）
  const cardGroups = new Map<string, QuotaInfo[]>();
  cardQuotas.forEach(quota => {
    // 如果沒有 cardId，跳過（不應該發生，但為了安全）
    // 這可能是資料庫中的錯誤資料，記錄警告但不中斷執行
    if (!quota.cardId) {
      console.warn('額度資料缺少 cardId（已跳過）:', {
        schemeId: quota.schemeId,
        name: quota.name,
        quota
      });
      return;
    }
    const cardId = quota.cardId;
    if (!cardGroups.has(cardId)) {
      cardGroups.set(cardId, []);
    }
    cardGroups.get(cardId)!.push(quota);
  });

  // 按支付方式分組
  const paymentGroups = new Map<string, QuotaInfo[]>();
  paymentQuotas.forEach(quota => {
    const paymentId = quota.paymentMethodIdForGroup || quota.paymentMethodId || 'unknown';
    if (!paymentGroups.has(paymentId)) {
      paymentGroups.set(paymentId, []);
    }
    paymentGroups.get(paymentId)!.push(quota);
  });

  // 格式化額度資訊（已使用/剩餘/上限）
  const formatQuotaInfo = (
    used: number,
    remaining: number | null,
    limit: number | null
  ) => {
    const usedStr = used.toLocaleString();
    const remainingStr = remaining === null ? '無上限' : remaining.toLocaleString();
    const limitStr = limit === null ? '無上限' : limit.toLocaleString();
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-600">
          <span className="font-medium">已用：</span>
          <span className={used > 0 ? 'text-orange-600' : 'text-gray-500'}>{usedStr}</span>
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

  // 格式化消費資訊（當前消費/參考餘額）
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

  const renderQuotaTable = (quotaList: QuotaInfo[], title: string = '') => {
    if (quotaList.length === 0) return null;
    
    return (
      <div className={title ? "mb-8" : ""}>
        {title && <h3 className="text-xl font-semibold mb-4 text-gray-800">{title}</h3>}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-20 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-30 border-r border-gray-200">
                    名稱
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    回饋組成
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    計算方式
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[140px]">
                    額度狀態
                    <div className="text-[10px] font-normal text-gray-500 mt-1">
                      已用/剩餘/上限
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[120px]">
                    消費資訊
                    <div className="text-[10px] font-normal text-gray-500 mt-1">
                      消費/參考餘額
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    刷新時間
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {quotaList.map((quota, quotaIndex) => {
                  // 處理 rewardIds：如果為空但 rewardComposition 有值，則使用 rewardComposition 的長度
                  let validRewardIndices: number[] = [];
                  
                  if (quota.rewardIds && quota.rewardIds.length > 0) {
                    // 如果有 rewardIds，過濾掉空值
                    quota.rewardIds.forEach((id, index) => {
                      // 允許空字串（用於只有 own_reward_percentage 的支付方式）
                      validRewardIndices.push(index);
                    });
                  } else if (quota.rewardComposition && quota.rewardComposition.trim() !== '') {
                    // 如果沒有 rewardIds 但有 rewardComposition，根據 rewardComposition 創建索引
                    const count = quota.rewardComposition.split('/').length;
                    validRewardIndices = Array.from({ length: count }, (_, i) => i);
                  } else {
                    // 完全沒有資料，顯示一行空資料
                    validRewardIndices = [0];
                  }
                  
                  const rewardCount = validRewardIndices.length;
                  // 使用更明顯的顏色區別不同方案
                  const bgColor = quotaIndex % 2 === 0 ? 'bg-white' : 'bg-blue-50';
                  const borderColor = quotaIndex % 2 === 0 ? 'border-gray-200' : 'border-blue-200';
                  
                  return validRewardIndices.map((originalIndex, displayIndex) => {
                    const isFirstRow = displayIndex === 0;
                    const rewardPercentage = quota.rewardComposition?.split('/')[originalIndex]?.replace('%', '') || '';
                    const calculationMethod = quota.calculationMethods?.[originalIndex] || 'round';
                    const calculationMethodText = 
                      calculationMethod === 'round' ? '四捨五入' :
                      calculationMethod === 'floor' ? '無條件捨去' :
                      calculationMethod === 'ceil' ? '無條件進位' : '四捨五入';
                    
                    const usedQuota = quota.usedQuotas?.[originalIndex] || 0;
                    const remainingQuota = quota.remainingQuotas?.[originalIndex] ?? null;
                    const quotaLimit = quota.quotaLimits?.[originalIndex] ?? null;
                    const currentAmount = quota.currentAmounts?.[originalIndex] || 0;
                    const referenceAmount = quota.referenceAmounts?.[originalIndex] ?? null;
                    
                    return (
                      <tr key={`${quotaIndex}-${originalIndex}`} className={`${bgColor} ${borderColor} border-l-4 hover:bg-blue-100 transition-colors`}>
                        {isFirstRow && (
                          <td
                            className={`px-4 py-3 text-sm font-medium sticky left-0 ${bgColor} z-10 border-r border-gray-200`}
                            rowSpan={rewardCount}
                          >
                            <div className="font-semibold text-gray-900">{quota.name}</div>
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            {rewardPercentage || '-'}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {calculationMethodText}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {formatQuotaInfo(usedQuota, remainingQuota, quotaLimit)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {formatConsumptionInfo(currentAmount, referenceAmount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <div className="text-xs">
                            {quota.refreshTimes?.[originalIndex] || '-'}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const toggleCard = (cardId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(cardId)) {
      newExpanded.delete(cardId);
    } else {
      newExpanded.add(cardId);
    }
    setExpandedCards(newExpanded);
  };

  const togglePayment = (paymentId: string) => {
    const newExpanded = new Set(expandedPayments);
    if (newExpanded.has(paymentId)) {
      newExpanded.delete(paymentId);
    } else {
      newExpanded.add(paymentId);
    }
    setExpandedPayments(newExpanded);
  };

  // 如果沒有任何額度資料，顯示提示訊息
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
    <div className="space-y-6">
      <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
        額度查詢
      </h2>

      {!hasAnyQuota && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">目前沒有任何額度資料。請先新增卡片方案或支付方式並設定回饋組成。</p>
        </div>
      )}

      {/* 信用卡區塊 */}
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
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4">
                      <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-20 shadow-sm">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-30 border-r border-gray-200">
                                名稱
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                回饋組成
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                計算方式
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[140px]">
                                額度狀態
                                <div className="text-[10px] font-normal text-gray-500 mt-1">
                                  已用/剩餘/上限
                                </div>
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[120px]">
                                消費資訊
                                <div className="text-[10px] font-normal text-gray-500 mt-1">
                                  消費/參考餘額
                                </div>
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                刷新時間
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {quotas.map((quota, quotaIndex) => {
                              // 處理 rewardIds：如果為空但 rewardComposition 有值，則使用 rewardComposition 的長度
                              let validRewardIndices: number[] = [];
                              
                              if (quota.rewardIds && quota.rewardIds.length > 0) {
                                // 如果有 rewardIds，過濾掉空值
                                quota.rewardIds.forEach((id, index) => {
                                  // 允許空字串（用於只有 own_reward_percentage 的支付方式）
                                  validRewardIndices.push(index);
                                });
                              } else if (quota.rewardComposition && quota.rewardComposition.trim() !== '') {
                                // 如果沒有 rewardIds 但有 rewardComposition，根據 rewardComposition 創建索引
                                const count = quota.rewardComposition.split('/').length;
                                validRewardIndices = Array.from({ length: count }, (_, i) => i);
                              } else {
                                // 完全沒有資料，顯示一行空資料
                                validRewardIndices = [0];
                              }
                              
                              const rewardCount = validRewardIndices.length;
                              // 使用更明顯的顏色區別不同方案
                              const bgColor = quotaIndex % 2 === 0 ? 'bg-white' : 'bg-blue-50';
                              const borderColor = quotaIndex % 2 === 0 ? 'border-gray-200' : 'border-blue-200';
                              
                              return validRewardIndices.map((originalIndex, displayIndex) => {
                                const isFirstRow = displayIndex === 0;
                                const rewardPercentage = quota.rewardComposition?.split('/')[originalIndex]?.replace('%', '') || '';
                                const calculationMethod = quota.calculationMethods?.[originalIndex] || 'round';
                                const calculationMethodText = 
                                  calculationMethod === 'round' ? '四捨五入' :
                                  calculationMethod === 'floor' ? '無條件捨去' :
                                  calculationMethod === 'ceil' ? '無條件進位' : '四捨五入';
                                
                                const usedQuota = quota.usedQuotas?.[originalIndex] || 0;
                                const remainingQuota = quota.remainingQuotas?.[originalIndex] ?? null;
                                const quotaLimit = quota.quotaLimits?.[originalIndex] ?? null;
                                const currentAmount = quota.currentAmounts?.[originalIndex] || 0;
                                const referenceAmount = quota.referenceAmounts?.[originalIndex] ?? null;
                                
                                return (
                                  <tr key={`${quotaIndex}-${originalIndex}`} className={`${bgColor} ${borderColor} border-l-4 hover:bg-blue-100 transition-colors`}>
                                    {isFirstRow && (
                                      <td
                                        className={`px-4 py-3 text-sm font-medium sticky left-0 ${bgColor} z-10 border-r border-gray-200`}
                                        rowSpan={rewardCount}
                                      >
                                        <div className="font-semibold text-gray-900">{quota.name}</div>
                                      </td>
                                    )}
                                    <td className="px-4 py-3 text-sm">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                        {rewardPercentage || '-'}%
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                      {calculationMethodText}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {formatQuotaInfo(usedQuota, remainingQuota, quotaLimit)}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {formatConsumptionInfo(currentAmount, referenceAmount)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                      <div className="text-xs">
                                        {quota.refreshTimes?.[originalIndex] || '-'}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              });
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 支付方式區塊 */}
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
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4">
                      <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-20 shadow-sm">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-30 border-r border-gray-200">
                                名稱
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                回饋組成
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                計算方式
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[140px]">
                                額度狀態
                                <div className="text-[10px] font-normal text-gray-500 mt-1">
                                  已用/剩餘/上限
                                </div>
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[120px]">
                                消費資訊
                                <div className="text-[10px] font-normal text-gray-500 mt-1">
                                  消費/參考餘額
                                </div>
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                刷新時間
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {quotas.map((quota, quotaIndex) => {
                              // 處理 rewardIds：如果為空但 rewardComposition 有值，則使用 rewardComposition 的長度
                              let validRewardIndices: number[] = [];
                              
                              if (quota.rewardIds && quota.rewardIds.length > 0) {
                                // 如果有 rewardIds，過濾掉空值
                                quota.rewardIds.forEach((id, index) => {
                                  // 允許空字串（用於只有 own_reward_percentage 的支付方式）
                                  validRewardIndices.push(index);
                                });
                              } else if (quota.rewardComposition && quota.rewardComposition.trim() !== '') {
                                // 如果沒有 rewardIds 但有 rewardComposition，根據 rewardComposition 創建索引
                                const count = quota.rewardComposition.split('/').length;
                                validRewardIndices = Array.from({ length: count }, (_, i) => i);
                              } else {
                                // 完全沒有資料，顯示一行空資料
                                validRewardIndices = [0];
                              }
                              
                              const rewardCount = validRewardIndices.length;
                              // 使用更明顯的顏色區別不同方案
                              const bgColor = quotaIndex % 2 === 0 ? 'bg-white' : 'bg-blue-50';
                              const borderColor = quotaIndex % 2 === 0 ? 'border-gray-200' : 'border-blue-200';
                              
                              return validRewardIndices.map((originalIndex, displayIndex) => {
                                const isFirstRow = displayIndex === 0;
                                const rewardPercentage = quota.rewardComposition?.split('/')[originalIndex]?.replace('%', '') || '';
                                const calculationMethod = quota.calculationMethods?.[originalIndex] || 'round';
                                const calculationMethodText = 
                                  calculationMethod === 'round' ? '四捨五入' :
                                  calculationMethod === 'floor' ? '無條件捨去' :
                                  calculationMethod === 'ceil' ? '無條件進位' : '四捨五入';
                                
                                const usedQuota = quota.usedQuotas?.[originalIndex] || 0;
                                const remainingQuota = quota.remainingQuotas?.[originalIndex] ?? null;
                                const quotaLimit = quota.quotaLimits?.[originalIndex] ?? null;
                                const currentAmount = quota.currentAmounts?.[originalIndex] || 0;
                                const referenceAmount = quota.referenceAmounts?.[originalIndex] ?? null;
                                
                                return (
                                  <tr key={`${quotaIndex}-${originalIndex}`} className={`${bgColor} ${borderColor} border-l-4 hover:bg-blue-100 transition-colors`}>
                                    {isFirstRow && (
                                      <td
                                        className={`px-4 py-3 text-sm font-medium sticky left-0 ${bgColor} z-10 border-r border-gray-200`}
                                        rowSpan={rewardCount}
                                      >
                                        <div className="font-semibold text-gray-900">{quota.name}</div>
                                      </td>
                                    )}
                                    <td className="px-4 py-3 text-sm">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                        {rewardPercentage || '-'}%
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                      {calculationMethodText}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {formatQuotaInfo(usedQuota, remainingQuota, quotaLimit)}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {formatConsumptionInfo(currentAmount, referenceAmount)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                      <div className="text-xs">
                                        {quota.refreshTimes?.[originalIndex] || '-'}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              });
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
