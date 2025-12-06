import { useState, useEffect } from 'react';
import api from '../../utils/api';

// 格式化函數
const formatQuotaInfo = (used: number, remaining: number | null, limit: number | null, isEditing: boolean, editingValue?: string, onEditingChange?: (val: string) => void) => {
  const usedStr = used.toLocaleString();
  const remainingStr = remaining === null ? '無上限' : remaining.toLocaleString();
  const limitStr = limit === null ? '無上限' : limit.toLocaleString();
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-600">
        <span className="font-medium">已用：</span>
        {isEditing ? (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-gray-500">{usedStr}</span>
            <input type="text" value={editingValue} onChange={e => onEditingChange?.(e.target.value)} placeholder="+7/-5" className="w-16 px-1 border rounded text-xs" />
          </div>
        ) : <span className={used > 0 ? 'text-orange-600' : 'text-gray-500'}>{usedStr}</span>}
      </div>
      <div className="text-xs text-gray-600">
        <span className="font-medium">剩餘：</span>
        <span className={remaining !== null && remaining < (limit || 0) * 0.2 ? 'text-red-600 font-semibold' : 'text-green-600'}>{remainingStr}</span>
      </div>
      <div className="text-xs text-gray-500"><span className="font-medium">上限：</span>{limitStr}</div>
    </div>
  );
};

export default function QuotaManagement() {
  const [quotas, setQuotas] = useState<any[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState('');
  
  // 編輯額度狀態 (數值調整)
  const [editingQuota, setEditingQuota] = useState<{ idx: number; rIdx: number; group: string } | null>(null);
  const [quotaAdjust, setQuotaAdjust] = useState('');

  // 編輯回饋組成狀態 (設定調整)
  const [editingReward, setEditingReward] = useState<{ idx: number; rIdx: number; group: string } | null>(null);
  const [rewardForm, setRewardForm] = useState({
    percentage: '', method: 'round', limit: '', 
    refreshType: '', refreshValue: '', refreshDate: '',
    calculationBasis: 'transaction' 
  });
  // 共同回饋綁定
  const [sharedGroupOptions, setSharedGroupOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [bindingTarget, setBindingTarget] = useState<{ idx: number; group: string } | null>(null);
  const [selectedSharedGroup, setSelectedSharedGroup] = useState<string>('');

  useEffect(() => {
    loadQuotas();
    loadSharedGroups();
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleString('zh-TW', { hour12: false })), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadQuotas = async () => {
    try {
      const res = await api.get('/quota');
      if (res.data.success) {
        const data = res.data.data.map((q: any, i: number) => ({ ...q, __index: i }));
        setQuotas(data);
      }
    } catch (e) { console.error(e); }
  };

  const loadSharedGroups = async () => {
    try {
      // 從方案總覽取得所有方案，將名稱用於下拉（僅示意：共用回饋根方案列表）
      const res = await api.get('/schemes/overview');
      const data = res.data.data || [];
      const options: Array<{ id: string; name: string }> = [];
      data.forEach((card: any) => {
        card.schemes?.forEach((s: any) => {
          options.push({ id: s.id, name: `${card.name}-${s.name}` });
        });
      });
      setSharedGroupOptions(options);
    } catch (e) {
      console.error('載入共同回饋清單失敗', e);
    }
  };

  const handleQuotaSave = async () => {
    if (!editingQuota) return;
    const q = quotas[editingQuota.idx];
    const rewardId = q.rewardIds[editingQuota.rIdx];
    
    let adjustment = 0;
    if (quotaAdjust.startsWith('+')) adjustment = parseFloat(quotaAdjust.substring(1));
    else if (quotaAdjust.startsWith('-')) adjustment = parseFloat(quotaAdjust);
    else adjustment = parseFloat(quotaAdjust);

    if (isNaN(adjustment) || adjustment === 0) return alert('請輸入增減值 (如 +10, -5)');

    const newUsed = (q.usedQuotas[editingQuota.rIdx] || 0) + adjustment;
    const limit = q.quotaLimits[editingQuota.rIdx];
    const newRemaining = limit !== null ? Math.max(0, limit - newUsed) : null;

    try {
      await api.put(`/quota/${q.schemeId || 'null'}`, {
        paymentMethodId: q.paymentMethodId,
        rewardId,
        usedQuota: newUsed,
        remainingQuota: newRemaining
      });
      alert('額度已更新');
      setEditingQuota(null);
      setQuotaAdjust('');
      loadQuotas();
    } catch (e: any) { alert(e.response?.data?.error || '更新失敗'); }
  };

  const handleRewardEdit = (qIdx: number, rIdx: number, group: string) => {
    const q = quotas[qIdx];
    const percentage = q.rewardComposition.split('/')[rIdx].replace('%', '');
    const method = q.calculationMethods[rIdx] || 'round';
    const limit = q.quotaLimits[rIdx];
    // [修正] 從陣列中讀取正確的 basis，若無則預設 'transaction'
    const basis = q.quotaCalculationBases?.[rIdx] || 'transaction';
    
    setEditingReward({ idx: qIdx, rIdx: rIdx, group });
    setRewardForm({
      percentage,
      method,
      limit: limit !== null ? String(limit) : '',
      refreshType: q.quotaRefreshTypes?.[rIdx] || '',
      refreshValue: q.quotaRefreshValues?.[rIdx] || '',
      refreshDate: q.quotaRefreshDates?.[rIdx] || '',
      calculationBasis: basis
    });
  };

  const handleRewardSave = async () => {
    if (!editingReward) return;
    const q = quotas[editingReward.idx];
    const rewardId = q.rewardIds[editingReward.rIdx];
    const endpoint = q.schemeId 
      ? `/schemes/${q.schemeId}/rewards/${rewardId}`
      : `/payment-methods/${q.paymentMethodId}/rewards/${rewardId}`;

    try {
      await api.put(endpoint, {
        rewardPercentage: parseFloat(rewardForm.percentage),
        calculationMethod: rewardForm.method,
        quotaLimit: rewardForm.limit ? parseFloat(rewardForm.limit) : null,
        quotaRefreshType: rewardForm.refreshType || null,
        quotaRefreshValue: rewardForm.refreshType === 'monthly' && rewardForm.refreshValue ? parseInt(rewardForm.refreshValue) : (rewardForm.refreshType === 'monthly' ? null : null),
        quotaRefreshDate: rewardForm.refreshType === 'date' ? rewardForm.refreshDate : null,
        quotaCalculationBasis: rewardForm.calculationBasis
      });
      alert('設定已更新');
      setEditingReward(null);
      loadQuotas();
    } catch (e: any) { alert(e.response?.data?.error || '更新失敗'); }
  };

  // 綁定共同回饋群組（只對信用卡方案）
  const handleBindShared = async () => {
    if (!bindingTarget) return;
    const q = quotas[bindingTarget.idx];
    if (!q.schemeId) return alert('僅信用卡方案可綁定共同回饋');
    try {
      await api.put(`/schemes/${q.schemeId}/shared-reward`, { sharedRewardGroupId: selectedSharedGroup || null });
      alert('共同回饋綁定已更新');
      setBindingTarget(null);
      setSelectedSharedGroup('');
      loadQuotas();
    } catch (e: any) {
      alert(e.response?.data?.error || '更新失敗');
    }
  };

  const cardGroups = new Map();
  const paymentGroups = new Map();
  quotas.forEach(q => {
    if (q.schemeId && !q.paymentMethodId) {
      if (!cardGroups.has(q.cardId)) cardGroups.set(q.cardId, []);
      cardGroups.get(q.cardId).push(q);
    } else if (!q.schemeId && q.paymentMethodId) {
      const pid = q.paymentMethodIdForGroup || q.paymentMethodId;
      if (!paymentGroups.has(pid)) paymentGroups.set(pid, []);
      paymentGroups.get(pid).push(q);
    }
  });

  // 將同一共同回饋群組的方案聚在一起（無群組則以自身索引為 key）
  const groupByShared = (items: any[]) => {
    const order: string[] = [];
    const map = new Map<string, any[]>();
    items.forEach((item) => {
      const key = item.sharedRewardGroupId || `solo-${item.__index}`;
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(item);
    });
    return order.map(k => ({ key: k, items: map.get(k)! }));
  };

  const renderTable = (list: any[], groupKey: string) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-20 shadow-sm">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 z-30 border-r border-gray-200">名稱</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">回饋組成</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">計算方式</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">額度狀態</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">刷新時間</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">管理</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {groupByShared(list).map(({ key: sharedKey, items }) => {
              return items.map((q) => {
              const rewardIndices = q.rewardIds.map((_: any, i: number) => i);
              return rewardIndices.map((rIdx: number) => {
                const isFirst = rIdx === 0;
                const isEditingQ = editingQuota?.idx === q.__index && editingQuota?.rIdx === rIdx;
                const isEditingR = editingReward?.idx === q.__index && editingReward?.rIdx === rIdx;
                const isCardScheme = q.schemeId && !q.paymentMethodId;
                const sharedBound = q.sharedRewardGroupId || null;

                const methodText = q.calculationMethods[rIdx];
                const basis = q.quotaCalculationBases?.[rIdx] || 'transaction';
                const basisText = basis === 'statement' ? '帳單總額' : '單筆回饋';

                return (
                  <tr
                    key={`${sharedKey}-${q.__index}-${rIdx}`}
                    className={`${rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-l-4 border-blue-100 hover:bg-blue-50 transition-colors`}
                  >
                    {isFirst && (
                      <td rowSpan={rewardIndices.length} className="px-4 py-3 text-sm font-medium sticky left-0 bg-white z-10 border-r border-gray-200 align-top">
                        <div className="space-y-1">
                          <div>{q.name}</div>
                          {sharedBound && (
                            <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1 inline-block">
                              共用回饋
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm align-top">
                      <span className="bg-orange-100 px-1 rounded font-bold">{q.rewardComposition.split('/')[rIdx]}</span>
                    </td>
                    <td className="px-4 py-3 text-xs align-top space-y-1 text-gray-700">
                      <div>{methodText}</div>
                      <div className="text-[11px] text-purple-700 border border-purple-200 rounded px-1 inline-block">{basisText}</div>
                    </td>
                    <td className="px-4 py-3 text-sm align-top">
                      {formatQuotaInfo(
                        q.usedQuotas[rIdx], q.remainingQuotas[rIdx], q.quotaLimits[rIdx],
                        isEditingQ, quotaAdjust, setQuotaAdjust
                      )}
                      {isEditingQ && (
                        <div className="flex gap-1 mt-1">
                          <button onClick={handleQuotaSave} className="bg-green-500 text-white px-2 py-0.5 rounded text-xs">確認</button>
                          <button onClick={() => { setEditingQuota(null); setQuotaAdjust(''); }} className="bg-gray-300 px-2 py-0.5 rounded text-xs">取消</button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm align-top">
                      {q.refreshTimes?.[rIdx] || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm align-top">
                      {!isEditingQ && !isEditingR && (
                        <div className="flex flex-col gap-1">
                          <button onClick={() => { setEditingQuota({ idx: q.__index, rIdx, group: groupKey }); setQuotaAdjust(''); }} className="text-yellow-600 text-xs border border-yellow-600 rounded px-1 hover:bg-yellow-50">調額</button>
                          <button onClick={() => handleRewardEdit(q.__index, rIdx, groupKey)} className="text-purple-600 text-xs border border-purple-600 rounded px-1 hover:bg-purple-50">設定</button>
                          {isCardScheme && (
                            <button
                              onClick={() => { setBindingTarget({ idx: q.__index, group: groupKey }); setSelectedSharedGroup(sharedBound || ''); }}
                              className="text-blue-600 text-xs border border-blue-600 rounded px-1 hover:bg-blue-50"
                            >
                              {sharedBound ? '變更共用' : '綁定共用'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              });
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">額度管理</h3>
        <div className="text-sm font-mono bg-gray-100 px-2 rounded">{currentTime}</div>
      </div>

      {cardGroups.size > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-gray-700">信用卡</h4>
          {Array.from(cardGroups.entries()).map(([id, list]: [string, any[]]) => (
            <div key={id} className="border rounded-lg overflow-hidden bg-white shadow-sm">
              <button 
                onClick={() => {
                  const newSet = new Set(expandedCards);
                  newSet.has(id) ? newSet.delete(id) : newSet.add(id);
                  setExpandedCards(newSet);
                }}
                className="w-full px-4 py-3 bg-gray-50 flex justify-between items-center hover:bg-gray-100 transition-colors"
              >
                <span className="font-bold text-gray-800">{list[0].cardName}</span>
                <span className="text-gray-500">{expandedCards.has(id) ? '▼' : '▶'}</span>
              </button>
              {expandedCards.has(id) && renderTable(list, `card-${id}`)}
            </div>
          ))}
        </div>
      )}

      {paymentGroups.size > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-gray-700">支付方式</h4>
          {Array.from(paymentGroups.entries()).map(([id, list]: [string, any[]]) => (
            <div key={id} className="border rounded-lg overflow-hidden bg-white shadow-sm">
              <button 
                onClick={() => {
                  const newSet = new Set(expandedPayments);
                  newSet.has(id) ? newSet.delete(id) : newSet.add(id);
                  setExpandedPayments(newSet);
                }}
                className="w-full px-4 py-3 bg-gray-50 flex justify-between items-center hover:bg-gray-100 transition-colors"
              >
                <span className="font-bold text-gray-800">{list[0].paymentMethodName}</span>
                <span className="text-gray-500">{expandedPayments.has(id) ? '▼' : '▶'}</span>
              </button>
              {expandedPayments.has(id) && renderTable(list, `payment-${id}`)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}