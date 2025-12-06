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

  useEffect(() => {
    loadQuotas();
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
        quotaRefreshValue: rewardForm.refreshValue || null,
        quotaRefreshDate: rewardForm.refreshDate || null,
        quotaCalculationBasis: rewardForm.calculationBasis
      });
      alert('設定已更新');
      setEditingReward(null);
      loadQuotas();
    } catch (e: any) { alert(e.response?.data?.error || '更新失敗'); }
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

  const renderTable = (list: any[], groupKey: string) => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">名稱</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">回饋</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">額度</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">操作</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {list.map((q) => {
            const rewardIndices = q.rewardIds.map((_: any, i: number) => i);
            return rewardIndices.map((rIdx: number) => {
              const isFirst = rIdx === 0;
              const isEditingQ = editingQuota?.idx === q.__index && editingQuota?.rIdx === rIdx;
              const isEditingR = editingReward?.idx === q.__index && editingReward?.rIdx === rIdx;
              // [修正] 共同回饋綁定只在編輯信用卡方案的「設定」時顯示
              const showBindingInfo = isEditingR && q.schemeId && !q.paymentMethodId;
              
              return (
                <tr key={`${q.__index}-${rIdx}`}>
                  {isFirst && <td rowSpan={rewardIndices.length} className="px-4 py-2 text-sm font-medium border-r align-top">{q.name}</td>}
                  <td className="px-4 py-2 text-sm align-top">
                    {isEditingR ? (
                      <div className="space-y-2 min-w-[200px]">
                        <div className="flex gap-2">
                          <input value={rewardForm.percentage} onChange={e => setRewardForm({...rewardForm, percentage: e.target.value})} className="w-1/3 border p-1 rounded text-xs" placeholder="%" />
                          <select value={rewardForm.method} onChange={e => setRewardForm({...rewardForm, method: e.target.value})} className="w-2/3 border p-1 rounded text-xs">
                            <option value="round">四捨五入</option>
                            <option value="floor">無條件捨去</option>
                            <option value="ceil">無條件進位</option>
                          </select>
                        </div>
                        <div className="flex flex-col">
                          <label className="text-[10px] text-gray-500 mb-0.5">計算基準</label>
                          <select value={rewardForm.calculationBasis} onChange={e => setRewardForm({...rewardForm, calculationBasis: e.target.value})} className="w-full border p-1 rounded text-xs bg-yellow-50">
                            <option value="transaction">單筆回饋</option>
                            <option value="statement">帳單總額</option>
                          </select>
                        </div>
                        <input value={rewardForm.limit} onChange={e => setRewardForm({...rewardForm, limit: e.target.value})} className="w-full border p-1 rounded text-xs" placeholder="上限" />
                        <div className="flex gap-1">
                          <button onClick={handleRewardSave} className="bg-blue-500 text-white px-2 py-1 rounded text-xs">儲存</button>
                          <button onClick={() => setEditingReward(null)} className="bg-gray-300 px-2 py-1 rounded text-xs">取消</button>
                        </div>
                        
                        {/* [修正] 共同回饋綁定 UI - 僅在此處顯示 */}
                        {showBindingInfo && (
                          <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-xs">
                            <div className="font-semibold text-blue-700 mb-1">共同回饋設定</div>
                            <div className="text-gray-500">請至「信用卡管理」頁面進行綁定設定。</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs">
                        <span className="bg-orange-100 px-1 rounded font-bold">{q.rewardComposition.split('/')[rIdx]}</span>
                        <div className="text-gray-500 mt-0.5">{q.calculationMethods[rIdx]}</div>
                        {q.quotaCalculationBases?.[rIdx] === 'statement' && (
                          <div className="text-purple-600 border border-purple-200 px-1 rounded mt-0.5 inline-block scale-90 origin-left">帳單總額</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm align-top">
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
                  <td className="px-4 py-2 text-sm align-top">
                    {!isEditingQ && !isEditingR && (
                      <div className="flex flex-col gap-1">
                        <button onClick={() => { setEditingQuota({ idx: q.__index, rIdx, group: groupKey }); setQuotaAdjust(''); }} className="text-yellow-600 text-xs border border-yellow-600 rounded px-1 hover:bg-yellow-50">調額</button>
                        <button onClick={() => handleRewardEdit(q.__index, rIdx, groupKey)} className="text-purple-600 text-xs border border-purple-600 rounded px-1 hover:bg-purple-50">設定</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
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