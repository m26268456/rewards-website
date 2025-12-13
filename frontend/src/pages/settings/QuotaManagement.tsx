// @ts-nocheck
import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

// 格式化函數
const formatQuotaInfo = (
  used: number, // a: 系統計算的額度
  remaining: number | null, 
  limit: number | null, 
  isEditing: boolean, 
  editingValue?: string, 
  onEditingChange?: (val: string) => void, 
  manualAdjustment?: number // b: 人工調整值（從後端資料取得）
) => {
  const baseUsed = Number.isFinite(used) ? used : 0;
  const baseRemaining = remaining === null ? null : (Number.isFinite(remaining as number) ? (remaining as number) : 0);
  const baseLimit = limit === null ? null : (Number.isFinite(limit as number) ? (limit as number) : 0);

  const adjustment = Number.isFinite(manualAdjustment as number) ? (manualAdjustment as number) : 0;
  const totalUsed = baseUsed + adjustment; // c = a + b
  const usedStr = baseUsed.toLocaleString();
  const remainingStr = baseRemaining === null ? '無上限' : baseRemaining.toLocaleString();
  const limitStr = baseLimit === null ? '無上限' : baseLimit.toLocaleString();
  
  // 常態顯示 a+b=c 格式（如果有調整）
  const displayUsed = adjustment !== 0 
    ? `${used}${adjustment >= 0 ? '+' : ''}${adjustment}=${totalUsed}`
    : usedStr;
  
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-600">
        <span className="font-medium">已用：</span>
        {isEditing ? (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-gray-500">{usedStr}</span>
            <input 
              type="text" 
              value={editingValue} 
              onChange={e => onEditingChange?.(e.target.value)} 
              placeholder={adjustment !== 0 ? `${adjustment >= 0 ? '+' : ''}${adjustment}` : "+7/-5"} 
              className="w-16 px-1 border rounded text-xs" 
            />
            {(() => {
              // 即時計算新的總額（如果輸入框有值）
              let newAdjustment = 0;
              if (editingValue && editingValue.trim() !== '') {
                if (editingValue.startsWith('+')) newAdjustment = parseFloat(editingValue.substring(1)) || 0;
                else if (editingValue.startsWith('-')) newAdjustment = parseFloat(editingValue) || 0;
                else newAdjustment = parseFloat(editingValue) || 0;
              }
              const newTotal = used + newAdjustment;
              return <span className="text-gray-500">= {newTotal}</span>;
            })()}
          </div>
        ) : (
          <span className={totalUsed > 0 ? 'text-orange-600' : 'text-gray-500'}>
            {displayUsed}
          </span>
        )}
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
  const [isAddingReward, setIsAddingReward] = useState(false); // 是否在新增組成
  const [quotaAdjust, setQuotaAdjust] = useState('');
  const [quotaAdjustChanged, setQuotaAdjustChanged] = useState(false);

  // 編輯回饋組成狀態 (設定調整)
  const [editingReward, setEditingReward] = useState<{ idx: number; rIdx: number; group: string } | null>(null);
  const [rewardForm, setRewardForm] = useState({
    percentage: '', method: 'round', limit: '', 
    refreshType: '', refreshValue: '', refreshDate: '',
    calculationBasis: 'transaction' 
  });
  // 已移除共同回饋綁定功能

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

  const handleQuotaAdjustChange = (val: string) => {
    setQuotaAdjust(val);
    setQuotaAdjustChanged(true);
  };


  const handleQuotaSave = async () => {
    if (!editingQuota) return;
    const q = quotas[editingQuota.idx];
    const targetSchemeId = q.schemeId;
    const rewardId = q.rewardIds[editingQuota.rIdx];
    
    const cleaned = quotaAdjust?.trim() || '';
    const isEmpty = cleaned === '';

    // 解析調整值：允許正負數，僅接受數字；空值視為 null（移除人工干預）
    let adjustment: number | null = null;
    if (!isEmpty) {
    if (cleaned.startsWith('+')) adjustment = parseFloat(cleaned.substring(1));
    else if (cleaned.startsWith('-')) adjustment = parseFloat(cleaned);
    else adjustment = parseFloat(cleaned);

    if (!Number.isFinite(adjustment)) {
      alert('人工干預請輸入數字');
      return;
      }
    }

    try {
      // 發送 manualAdjustment 而非 usedQuota
      await api.put(`/quota/${targetSchemeId || 'null'}`, {
        paymentMethodId: q.paymentMethodId,
        rewardId,
        manualAdjustment: adjustment
      });
      await loadQuotas();
      setQuotaAdjust('');          // 清空編輯欄位
      setQuotaAdjustChanged(false);
    } catch (e: any) { 
      throw e; // 拋出錯誤，讓 handleSaveAll 處理
    }
  };

  const handleRewardEdit = (qIdx: number, rIdx: number, group: string) => {
    const q = quotas[qIdx];
    const percentage = q.rewardComposition?.split('/')?.[rIdx]?.replace('%', '') || '';
    const method = q.calculationMethods?.[rIdx] || 'round';
    const limit = q.quotaLimits?.[rIdx];
    // [修正] 從陣列中讀取正確的 basis，若無則預設 'transaction'
    const basisRaw = q.quotaCalculationBases?.[rIdx] || 'transaction';
    const basis = typeof basisRaw === 'string'
      ? basisRaw.trim().toLowerCase()
      : 'transaction';
    
    // 從後端資料中獲取當前的調整值
    const currentAdjustment = q.manualAdjustments?.[rIdx];
    
    setEditingReward({ idx: qIdx, rIdx: rIdx, group });
    setEditingQuota({ idx: qIdx, rIdx: rIdx, group });
    setIsAddingReward(false);
    setRewardForm({
      percentage,
      method,
      limit: limit !== null ? String(limit) : '',
      refreshType: q.quotaRefreshTypes?.[rIdx] || '',
      refreshValue: q.quotaRefreshValues?.[rIdx] || '',
      refreshDate: q.quotaRefreshDates?.[rIdx] || '',
      calculationBasis: basis
    });
    // 將當前的調整值帶入編輯欄位
    const hasAdjustment = currentAdjustment !== null && currentAdjustment !== undefined && currentAdjustment !== 0;
    setQuotaAdjust(hasAdjustment ? `${currentAdjustment >= 0 ? '+' : ''}${currentAdjustment}` : '');
    setQuotaAdjustChanged(false);
  };

  const handleRewardSave = async () => {
    if (!editingReward) return;
    
    // 驗證回饋百分比
    const percentage = parseFloat(rewardForm.percentage);
    if (isNaN(percentage) || percentage <= 0) {
      alert('請輸入有效的回饋百分比（必須大於 0）');
      return;
    }
    
    const q = quotas[editingReward.idx];
    const targetSchemeId = q.schemeId;
    const rewardId = q.rewardIds[editingReward.rIdx];
    const isScheme = !!q.schemeId;
    const isNew = isAddingReward || !rewardId;
    const endpoint = isNew
      ? (isScheme ? `/schemes/${targetSchemeId}/rewards` : `/payment-methods/${q.paymentMethodId}/rewards`)
      : (isScheme ? `/schemes/${targetSchemeId}/rewards/${rewardId}` : `/payment-methods/${q.paymentMethodId}/rewards/${rewardId}`);

    try {
      const payload = {
        rewardPercentage: percentage,
        calculationMethod: rewardForm.method,
        quotaLimit: rewardForm.limit ? parseFloat(rewardForm.limit) : null,
        quotaRefreshType: rewardForm.refreshType || null,
        quotaRefreshValue: rewardForm.refreshType === 'monthly' && rewardForm.refreshValue ? parseInt(rewardForm.refreshValue) : null,
        quotaRefreshDate: rewardForm.refreshType === 'date' ? rewardForm.refreshDate : null,
        quotaCalculationBasis: rewardForm.calculationBasis,
        displayOrder: q.rewardIds?.length || 0,
      };
      if (isNew) {
        await api.post(endpoint, payload);
      } else {
        await api.put(endpoint, payload);
      }
      loadQuotas();
      setIsAddingReward(false);
    } catch (e: any) { 
      throw e; // 拋出錯誤，讓 handleSaveAll 處理
    }
  };

  // 整合儲存邏輯：同時處理回饋設定和額度調整
  const handleSaveAll = async () => {
    if (!editingReward) return;
    
    try {
      // 如果有額度調整，先儲存額度
      if (editingQuota && quotaAdjustChanged) {
        await handleQuotaSave();
      }
      
      // 儲存回饋設定
      await handleRewardSave();
      
      // 清除編輯狀態
      setEditingReward(null);
      setEditingQuota(null);
      setQuotaAdjust('');
      setQuotaAdjustChanged(false);
      setIsAddingReward(false);
      alert('設定已更新');
    } catch (e: any) {
      alert(e.response?.data?.error || '儲存失敗');
    }
  };

  // 新增回饋組成：改為直接進入空白編輯列
  const handleRewardAdd = async (qIdx: number, group: string) => {
    const q = quotas[qIdx];
    const nextIndex =
      (q.rewardIds && q.rewardIds.length) ||
      (q.rewardComposition && q.rewardComposition.split('/').length) ||
      0;

    setIsAddingReward(true);
    setEditingReward({ idx: qIdx, rIdx: nextIndex, group });
    setEditingQuota({ idx: qIdx, rIdx: nextIndex, group });
    setRewardForm({
      percentage: '',
      method: 'round',
      limit: '',
      refreshType: '',
      refreshValue: '',
      refreshDate: '',
      calculationBasis: 'transaction',
    });
    setQuotaAdjust('');
    setQuotaAdjustChanged(false);
  };

  // 刪除回饋組成
  const handleRewardDelete = async (qIdx: number, rIdx: number, group: string) => {
    const q = quotas[qIdx];
    const rewardId = q.rewardIds?.[rIdx];
    // 若是新增中的暫存列，直接取消
    const isTempNew = isAddingReward && editingReward?.idx === qIdx && editingReward?.rIdx === rIdx;
    if (isTempNew) {
      setEditingReward(null);
      setEditingQuota(null);
      setIsAddingReward(false);
      setQuotaAdjust('');
      setQuotaAdjustChanged(false);
      return;
    }
    if (!rewardId) {
      alert('找不到要刪除的回饋組成');
      return;
    }
    if (!confirm('確定刪除此回饋組成？')) return;

    const targetSchemeId = q.schemeId;
    const isScheme = !!q.schemeId;
    const endpoint = isScheme
      ? `/schemes/${targetSchemeId}/rewards/${rewardId}`
      : `/payment-methods/${q.paymentMethodId}/rewards/${rewardId}`;

    try {
      await api.delete(endpoint);
      alert('回饋組成已刪除');
      loadQuotas();
    } catch (e: any) {
      alert(e.response?.data?.error || '刪除失敗');
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

  // 簡化：不再有共同回饋群組，直接按項目分組
  const groupByShared = (items: any[]) => {
    return items.map((item, idx) => ({
      key: item.schemeId ? `scheme-${item.schemeId}` : `pay-${item.paymentMethodId || idx}`,
      items: [item],
      colorIndexMap: new Map<string, number>([[item.schemeId || item.paymentMethodId || String(idx), idx]]),
    }));
  };

  const renderTable = (list: any[], groupKey: string) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-20 shadow-sm">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-normal break-words min-w-[140px] sticky left-0 bg-gray-50 z-30 border-r border-gray-200">名稱</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-normal break-words min-w-0">回饋組成</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-normal break-words min-w-0">計算方式</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-normal break-words min-w-0">額度狀態</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-normal break-words min-w-0">刷新時間</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-normal break-words min-w-0">管理</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {groupByShared(list).map(({ key: sharedKey, items, colorIndexMap }) => {
                const isSharedGroup = false;
              
              // 排序：root 方案在前，被綁定方案在後（與 QuotaQuery 一致）
                  const sortedItems = items.slice();
              
              const primary = sortedItems[0];
              let rewardIndices: number[] = [];
              const rewardCount =
                (primary.rewardIds && primary.rewardIds.length) ||
                (primary.rewardComposition && primary.rewardComposition.split('/').length) ||
                1;
              rewardIndices = Array.from({ length: rewardCount }, (_, i) => i);
              // 若正在新增新的組成，非共享群組時增加一列空白
              if (!isSharedGroup && isAddingReward && editingReward?.idx === primary.__index) {
                rewardIndices = [...rewardIndices, rewardIndices.length];
              }
              
              // 找出 root 方案名稱和被綁定方案名稱
                  const rootName = primary.schemeName || primary.name || '';
              const rootNameParts = rootName.split('-');
              const rootNameDisplay = rootNameParts.length > 1 ? rootNameParts[rootNameParts.length - 1] : rootName;
              
                  const childNames: string[] = [];
              
              const schemeNames = [rootNameDisplay, ...childNames];

              // 共享群組只渲染第一個回饋組成，非共享群組渲染所有回饋組成
              const rowsToRender = isSharedGroup ? [0] : rewardIndices;

              return rowsToRender.map((rIdx: number) => {
                const isFirst = rIdx === 0;
                const isEditingQ = editingQuota?.idx === primary.__index && editingQuota?.rIdx === rIdx;
                const isEditingR = editingReward?.idx === primary.__index && editingReward?.rIdx === rIdx;
                const isCardScheme = primary.schemeId && !primary.paymentMethodId;
                const sharedBound = null;
                const isSharedChild = false;

                const isTempNewRow = isAddingReward && editingReward?.idx === primary.__index && editingReward?.rIdx === rIdx;

                const methodRaw = isTempNewRow ? rewardForm.method : primary.calculationMethods?.[rIdx];
                const methodText =
                  methodRaw === 'round' ? '四捨五入' :
                  methodRaw === 'floor' ? '無條件捨去' :
                  methodRaw === 'ceil' ? '無條件進位' : (methodRaw || '四捨五入');
                const rawBasis = isTempNewRow
                  ? rewardForm.calculationBasis || 'transaction'
                  : primary.quotaCalculationBases?.[rIdx] || 'transaction';
                const basis = typeof rawBasis === 'string'
                  ? rawBasis.trim().toLowerCase()
                  : 'transaction';
                const basisText = basis === 'statement' ? '帳單總額' : '單筆回饋';

                const groupColorIdx = colorIndexMap?.get(sharedKey) || 0;
                const sharedPairs = [['bg-blue-50','bg-blue-100'], ['bg-blue-100','bg-blue-50']];
                const soloPairs = [['bg-white','bg-gray-50'], ['bg-gray-50','bg-white']];
                const colorPair = isSharedGroup ? sharedPairs[groupColorIdx % 2] : soloPairs[groupColorIdx % 2];
                // 同一方案維持同底色
                const rowBgColor = colorPair[0];
                const rowBorder = isSharedGroup ? 'border-blue-300' : 'border-gray-200';

                return (
                  <tr
                    key={`${sharedKey}-${primary.__index}-${rIdx}`}
                    className={`${rowBgColor} border-l-4 ${rowBorder}`}
                  >
                    {isFirst && (
                      <td rowSpan={rowsToRender.length} className={`px-3 py-2 text-sm font-medium sticky left-0 ${rowBgColor} z-10 border-r border-gray-200 align-middle whitespace-nowrap min-w-[140px]`}>
                        <div className="flex items-center">
                          <div className="font-semibold">{rootNameDisplay}</div>
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2 text-sm align-top whitespace-nowrap min-w-[120px]">
                      {isEditingR ? (
                        <div className="space-y-2">
                          <input 
                            value={rewardForm.percentage}
                            onChange={e => setRewardForm({...rewardForm, percentage: e.target.value})} 
                            className="w-full border p-1 rounded text-xs" 
                            placeholder="%" 
                          />
                        </div>
                      ) : (
                        <span className="bg-orange-100 px-1 rounded font-bold">
                          {primary.rewardComposition?.split('/')?.[rIdx] || (isTempNewRow ? `${rewardForm.percentage || ''}%` : '-')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs align-top text-gray-700 whitespace-nowrap min-w-[160px]">
                      {isEditingR ? (
                        <div className="flex flex-col gap-2">
                          <select 
                            value={rewardForm.method} 
                            onChange={e => setRewardForm({...rewardForm, method: e.target.value})} 
                            className="w-[140px] border p-1 rounded text-xs"
                          >
                            <option value="round">四捨五入</option>
                            <option value="floor">無條件捨去</option>
                            <option value="ceil">無條件進位</option>
                          </select>
                          <select 
                            value={rewardForm.calculationBasis} 
                            onChange={e => setRewardForm({...rewardForm, calculationBasis: e.target.value})} 
                            className="w-[140px] border p-1 rounded text-xs bg-yellow-50"
                          >
                            <option value="transaction">單筆回饋</option>
                            <option value="statement">帳單總額</option>
                          </select>
                        </div>
                      ) : (
                        <>
                          <div>{methodText}</div>
                          <div className={`text-[11px] rounded px-1 inline-block ${
                            basis === 'statement' 
                              ? 'text-blue-700 border border-blue-200 bg-blue-50' 
                              : 'text-purple-700 border border-purple-200 bg-purple-50'
                          }`}>
                            {basisText}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm align-top whitespace-nowrap min-w-[160px]">
                      {formatQuotaInfo(
                        primary.usedQuotas?.[rIdx] ?? 0, // a: 系統計算的額度
                        primary.remainingQuotas?.[rIdx] ?? null, 
                        primary.quotaLimits?.[rIdx] ?? null,
                        isEditingR, // 使用 isEditingR 來控制編輯模式
                        quotaAdjust, 
                        handleQuotaAdjustChange,
                        primary.manualAdjustments?.[rIdx] // b: 人工調整值（從後端資料取得）
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm align-top whitespace-nowrap min-w-[180px]">
                      {isEditingR ? (
                        <div className="flex flex-col gap-2">
                          <select 
                            value={rewardForm.refreshType} 
                            onChange={e => setRewardForm({...rewardForm, refreshType: e.target.value, refreshValue: '', refreshDate: ''})} 
                            className="w-[140px] border p-1 rounded text-xs"
                          >
                            <option value="">不刷新</option>
                            <option value="monthly">每月OO號</option>
                            <option value="date">指定日期</option>
                            <option value="activity">活動結束</option>
                          </select>
                          {rewardForm.refreshType === 'monthly' && (
                            <input 
                              type="number" 
                              min="1" 
                              max="28" 
                              value={rewardForm.refreshValue} 
                              onChange={e => {
                                const val = e.target.value;
                                const num = parseInt(val);
                                if (val === '' || (num >= 1 && num <= 28)) {
                                  setRewardForm({...rewardForm, refreshValue: val});
                                }
                              }} 
                              className="w-[140px] border p-1 rounded text-xs" 
                              placeholder="1-28號" 
                            />
                          )}
                          {rewardForm.refreshType === 'date' && (
                            <input 
                              type="date" 
                              value={rewardForm.refreshDate} 
                              onChange={e => setRewardForm({...rewardForm, refreshDate: e.target.value})} 
                              className="w-[140px] border p-1 rounded text-xs"
                              onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                            />
                          )}
                          <input 
                            value={rewardForm.limit} 
                            onChange={e => setRewardForm({...rewardForm, limit: e.target.value})} 
                            className="w-[140px] border p-1 rounded text-xs" 
                            placeholder="上限" 
                          />
                        </div>
                      ) : (
                        <div>{primary.refreshTimes?.[rIdx] || '-'}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm align-top whitespace-normal break-words min-w-0">
                      {isEditingR ? (
                        <div className="flex flex-col gap-1">
                          {sharedBound && (
                            <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1">
                              共用回饋：此變更會影響同組方案
                            </div>
                          )}
                        <div className="flex flex-wrap gap-2">
                          <button onClick={handleSaveAll} className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">儲存</button>
                          <button onClick={() => { 
                            setEditingReward(null); 
                            setEditingQuota(null); 
                            setQuotaAdjust(''); 
                            setQuotaAdjustChanged(false);
                          }} className="px-3 py-1 text-sm bg-gray-300 rounded">取消</button>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            onClick={() => handleRewardAdd(primary.__index, groupKey)}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            新增
                          </button>
                          <button
                            onClick={() => handleRewardDelete(primary.__index, rIdx, groupKey)}
                            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                          >
                            刪除
                          </button>
                        </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleRewardEdit(primary.__index, rIdx, groupKey)} 
                                  className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
                                >
                                  編輯
                                </button>
                            </div>
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

      {/* 共同回饋綁定功能已移除 */}
    </div>
  );
}