import { useState, useEffect } from 'react';
import api from '../../utils/api';

// 格式化函數
const formatQuotaInfo = (used: number, remaining: number | null, limit: number | null, isEditing: boolean, editingValue?: string, onEditingChange?: (val: string) => void, adjustmentKey?: string, manualAdjustments?: Map<string, number>) => {
  const adjustment = adjustmentKey && manualAdjustments ? manualAdjustments.get(adjustmentKey) : undefined;
  const usedStr = used.toLocaleString();
  const remainingStr = remaining === null ? '無上限' : remaining.toLocaleString();
  const limitStr = limit === null ? '無上限' : limit.toLocaleString();
  
  // 常態顯示 a+b=c 格式（如果有調整）
  const displayUsed = adjustment !== undefined ? `${used}${adjustment >= 0 ? '+' : ''}${adjustment}=${used + adjustment}` : usedStr;
  
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
              placeholder={adjustment !== undefined ? `${adjustment >= 0 ? '+' : ''}${adjustment}` : "+7/-5"} 
              className="w-16 px-1 border rounded text-xs" 
            />
            {adjustment !== undefined && (
              <span className="text-gray-500">= {used + adjustment}</span>
            )}
          </div>
        ) : (
          <span className={used > 0 ? 'text-orange-600' : 'text-gray-500'}>
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
  const [quotaAdjust, setQuotaAdjust] = useState('');

  // 編輯回饋組成狀態 (設定調整)
  const [editingReward, setEditingReward] = useState<{ idx: number; rIdx: number; group: string } | null>(null);
  const [rewardForm, setRewardForm] = useState({
    percentage: '', method: 'round', limit: '', 
    refreshType: '', refreshValue: '', refreshDate: '',
    calculationBasis: 'transaction' 
  });
  // 人工干預額度調整記錄
  const [manualAdjustments, setManualAdjustments] = useState<Map<string, number>>(new Map());
  // 共同回饋綁定
  const [sharedGroupOptions, setSharedGroupOptions] = useState<Array<{ id: string; name: string; cardId?: string }>>([]);
  const [bindingTarget, setBindingTarget] = useState<{ idx: number; group: string } | null>(null);
  const [selectedSharedGroups, setSelectedSharedGroups] = useState<string[]>([]);

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
      const options: Array<{ id: string; name: string; cardId?: string }> = [];
      data.forEach((card: any) => {
        card.schemes?.forEach((s: any) => {
          options.push({ id: s.id, name: `${card.name}-${s.name}`, cardId: card.id });
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
    const targetSchemeId = q.rewardSourceSchemeId || q.sharedRewardGroupId || q.schemeId;
    const rewardId = q.rewardIds[editingQuota.rIdx];
    const adjustmentKey = `${targetSchemeId || q.schemeId || q.paymentMethodId}_${rewardId}`;
    
    // 獲取原始已用額度（不包含調整）
    const baseUsed = q.usedQuotas[editingQuota.rIdx] || 0;
    
    // 如果沒有輸入調整值，清除調整記錄
    if (!quotaAdjust || quotaAdjust.trim() === '') {
      const newAdjustments = new Map(manualAdjustments);
      newAdjustments.delete(adjustmentKey);
      setManualAdjustments(newAdjustments);
      // 更新為原始值
      try {
        await api.put(`/quota/${targetSchemeId || 'null'}`, {
          paymentMethodId: q.paymentMethodId,
          rewardId,
          usedQuota: baseUsed,
          remainingQuota: q.remainingQuotas[editingQuota.rIdx]
        });
        loadQuotas();
      } catch (e: any) {
        throw e;
      }
      return;
    }
    
    // 解析調整值
    let adjustment = 0;
    if (quotaAdjust.startsWith('+')) adjustment = parseFloat(quotaAdjust.substring(1));
    else if (quotaAdjust.startsWith('-')) adjustment = parseFloat(quotaAdjust);
    else adjustment = parseFloat(quotaAdjust);

    if (isNaN(adjustment)) return; // 如果無效，不執行（允許0）

    // 計算新的已用額度 = 原始值 + 調整值
    const newUsed = baseUsed + adjustment;
    const limit = q.quotaLimits[editingQuota.rIdx];
    const newRemaining = limit !== null ? Math.max(0, limit - newUsed) : null;

    try {
      await api.put(`/quota/${targetSchemeId || 'null'}`, {
        paymentMethodId: q.paymentMethodId,
        rewardId,
        usedQuota: newUsed,
        remainingQuota: newRemaining
      });
      // 記錄調整值（不是累積值，而是當前的調整值）
      setManualAdjustments(new Map(manualAdjustments.set(adjustmentKey, adjustment)));
      loadQuotas();
    } catch (e: any) { 
      throw e; // 拋出錯誤，讓 handleSaveAll 處理
    }
  };

  const handleRewardEdit = (qIdx: number, rIdx: number, group: string) => {
    const q = quotas[qIdx];
    const percentage = q.rewardComposition.split('/')[rIdx].replace('%', '');
    const method = q.calculationMethods[rIdx] || 'round';
    const limit = q.quotaLimits[rIdx];
    // [修正] 從陣列中讀取正確的 basis，若無則預設 'transaction'
    const basis = q.quotaCalculationBases?.[rIdx] || 'transaction';
    
    // 獲取當前的調整值（如果存在）
    const targetSchemeId = q.rewardSourceSchemeId || q.sharedRewardGroupId || q.schemeId || q.paymentMethodId;
    const rewardId = q.rewardIds[rIdx];
    const adjustmentKey = `${targetSchemeId}_${rewardId}`;
    const currentAdjustment = manualAdjustments.get(adjustmentKey);
    
    setEditingReward({ idx: qIdx, rIdx: rIdx, group });
    setEditingQuota({ idx: qIdx, rIdx: rIdx, group });
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
    setQuotaAdjust(currentAdjustment !== undefined ? `${currentAdjustment >= 0 ? '+' : ''}${currentAdjustment}` : '');
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
    const targetSchemeId = q.rewardSourceSchemeId || q.sharedRewardGroupId || q.schemeId;
    const rewardId = q.rewardIds[editingReward.rIdx];
    const endpoint = q.schemeId 
      ? `/schemes/${targetSchemeId}/rewards/${rewardId}`
      : `/payment-methods/${q.paymentMethodId}/rewards/${rewardId}`;

    try {
      await api.put(endpoint, {
        rewardPercentage: percentage,
        calculationMethod: rewardForm.method,
        quotaLimit: rewardForm.limit ? parseFloat(rewardForm.limit) : null,
        quotaRefreshType: rewardForm.refreshType || null,
        quotaRefreshValue: rewardForm.refreshType === 'monthly' && rewardForm.refreshValue ? parseInt(rewardForm.refreshValue) : (rewardForm.refreshType === 'monthly' ? null : null),
        quotaRefreshDate: rewardForm.refreshType === 'date' ? rewardForm.refreshDate : null,
        quotaCalculationBasis: rewardForm.calculationBasis
      });
      loadQuotas();
    } catch (e: any) { 
      throw e; // 拋出錯誤，讓 handleSaveAll 處理
    }
  };

  // 整合儲存邏輯：同時處理回饋設定和額度調整
  const handleSaveAll = async () => {
    if (!editingReward) return;
    
    try {
      // 如果有額度調整，先儲存額度
      if (editingQuota && quotaAdjust && quotaAdjust.trim() !== '') {
        await handleQuotaSave();
      }
      
      // 儲存回饋設定
      await handleRewardSave();
      
      // 清除編輯狀態
      setEditingReward(null);
      setEditingQuota(null);
      setQuotaAdjust('');
      alert('設定已更新');
    } catch (e: any) {
      alert(e.response?.data?.error || '儲存失敗');
    }
  };

  // 綁定共同回饋群組（只對信用卡方案）
  // 綁定共同回饋群組（多選）
  const handleBindShared = async (overrideIds?: string[]) => {
    if (!bindingTarget) return;
    const current = quotas[bindingTarget.idx];
    const currentSchemeId = current.schemeId;
    if (!currentSchemeId) return alert('僅信用卡方案可綁定共同回饋');

    const ids = overrideIds !== undefined ? overrideIds : selectedSharedGroups;
    // 若沒選任何，僅解除當前方案
    if (!ids || ids.length === 0) {
      const groupRootId = current.sharedRewardGroupId || current.schemeId;
      const groupMembers = quotas
        .filter(q => q.schemeId && (q.sharedRewardGroupId === groupRootId || q.schemeId === groupRootId))
        .map(q => q.schemeId);
      await Promise.all(
        groupMembers.map(id => api.put(`/schemes/${id}/shared-reward`, { sharedRewardGroupId: null }))
      );
      setBindingTarget(null);
      setSelectedSharedGroups([]);
      await loadQuotas();
      alert('共同回饋已解除');
      return;
    }

    // 確保包含當前方案與既有 root，根據 sharedRewardGroupId 決定 root
    const currentGroupRoot = current.sharedRewardGroupId || current.schemeId;
    const preferredRoot = current.sharedRewardGroupId || ids[0] || currentSchemeId;
    const toBindSet = new Set(ids);
    toBindSet.add(currentSchemeId);
    toBindSet.add(preferredRoot);
    const toBind = Array.from(toBindSet);
    const rootId = preferredRoot;
    const existingGroupMembers = quotas
      .filter(q => q.schemeId && (q.sharedRewardGroupId === currentGroupRoot || q.schemeId === currentGroupRoot))
      .map(q => q.schemeId);
    const toRemove = existingGroupMembers.filter(id => !toBindSet.has(id));

    try {
      await Promise.all(
        [
          ...toRemove.map(id => api.put(`/schemes/${id}/shared-reward`, { sharedRewardGroupId: null })),
          ...toBind.map(id => api.put(`/schemes/${id}/shared-reward`, { sharedRewardGroupId: id === rootId ? null : rootId })),
        ]
      );
      alert('共同回饋綁定已更新');
      setBindingTarget(null);
      setSelectedSharedGroups([]);
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

  // 將同一共同回饋群組的方案聚在一起（與 QuotaQuery 一致的邏輯）
  const groupByShared = (items: any[]) => {
    const order: string[] = [];
    const map = new Map<string, any[]>();
    
    // 先找出所有被綁定的 root schemeId
    const rootSchemeIds = new Set<string>();
    items.forEach((item) => {
      if (item.sharedRewardGroupId) {
        rootSchemeIds.add(item.sharedRewardGroupId);
      }
    });
    
    items.forEach((item) => {
      let key: string;
      if (item.sharedRewardGroupId) {
        // 被綁定的方案：使用 sharedRewardGroupId 作為 key
        key = item.sharedRewardGroupId;
      } else if (item.schemeId && rootSchemeIds.has(item.schemeId)) {
        // Root 方案（被其他方案綁定）：使用自己的 schemeId 作為 key
        key = item.schemeId;
      } else {
        // 獨立方案：使用 solo-${id} 作為 key
        key = `solo-${item.schemeId || item.paymentMethodId || item.__index}`;
      }
      
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(item);
    });
    
    // 將有共同回饋的群組置頂，並給群組分配顏色索引
    const sorted = order.sort((a, b) => {
      const aIsShared = a.startsWith('solo-') ? 1 : 0;
      const bIsShared = b.startsWith('solo-') ? 1 : 0;
      return aIsShared - bIsShared; // 共同回饋群組 (0) 排在前面，單獨項目 (1) 排在後面
    });
    const colorIndexMap = new Map<string, number>();
    sorted.forEach((k, idx) => colorIndexMap.set(k, idx));
    return sorted.map(k => ({ key: k, items: map.get(k)!, colorIndexMap }));
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
            {groupByShared(list).map(({ key: sharedKey, items, colorIndexMap }) => {
              const isSharedGroup = !sharedKey.startsWith('solo-');
              
              // 排序：root 方案在前，被綁定方案在後（與 QuotaQuery 一致）
              const sortedItems = items.slice().sort((a, b) => {
                const isRootA = !a.sharedRewardGroupId || a.sharedRewardGroupId === a.schemeId;
                const isRootB = !b.sharedRewardGroupId || b.sharedRewardGroupId === b.schemeId;
                if (isRootA !== isRootB) return isRootA ? -1 : 1;
                return 0;
              });
              
              const primary = sortedItems[0];
              const rewardIndices = primary.rewardIds.map((_: any, i: number) => i);
              
              // 找出 root 方案名稱和被綁定方案名稱
              const rootId = primary.sharedRewardGroupId || primary.schemeId;
              const rootScheme = sortedItems.find((it) => !it.sharedRewardGroupId || it.sharedRewardGroupId === it.schemeId) || primary;
              const rootName = rootScheme.schemeName || rootScheme.name || '';
              const rootNameParts = rootName.split('-');
              const rootNameDisplay = rootNameParts.length > 1 ? rootNameParts[rootNameParts.length - 1] : rootName;
              
              const childNames = sortedItems
                .filter((it) => it.schemeId !== rootId)
                .map((it) => {
                  const nm = it.schemeName || it.name || '';
                  const parts = nm.split('-');
                  return parts.length > 1 ? parts[parts.length - 1] : nm;
                })
                .filter(Boolean);
              
              const schemeNames = [rootNameDisplay, ...childNames];

              return rewardIndices.map((rIdx: number) => {
                const isFirst = rIdx === 0;
                const isEditingQ = editingQuota?.idx === primary.__index && editingQuota?.rIdx === rIdx;
                const isEditingR = editingReward?.idx === primary.__index && editingReward?.rIdx === rIdx;
                const isCardScheme = primary.schemeId && !primary.paymentMethodId;
                const sharedBound = primary.sharedRewardGroupId && primary.sharedRewardGroupId !== primary.schemeId ? primary.sharedRewardGroupId : null;
                const isSharedChild = !!sharedBound;

                const methodRaw = primary.calculationMethods[rIdx];
                const methodText =
                  methodRaw === 'round' ? '四捨五入' :
                  methodRaw === 'floor' ? '無條件捨去' :
                  methodRaw === 'ceil' ? '無條件進位' : (methodRaw || '四捨五入');
                const basis = primary.quotaCalculationBases?.[rIdx] || 'transaction';
                const basisText = basis === 'statement' ? '帳單總額' : '單筆回饋';

                const groupColorIdx = colorIndexMap?.get(sharedKey) || 0;
                const sharedPairs = [['bg-blue-50','bg-blue-100'], ['bg-blue-100','bg-blue-50']];
                const soloPairs = [['bg-white','bg-gray-50'], ['bg-gray-50','bg-white']];
                const colorPair = isSharedGroup ? sharedPairs[groupColorIdx % 2] : soloPairs[groupColorIdx % 2];
                const rowBgColor = colorPair[rIdx % 2];
                const rowBorder = isSharedGroup ? 'border-blue-300' : 'border-gray-200';

                return (
                  <tr
                    key={`${sharedKey}-${primary.__index}-${rIdx}`}
                    className={`${rowBgColor} border-l-4 ${rowBorder} hover:bg-blue-50 transition-colors`}
                  >
                    {isFirst && (
                      <td rowSpan={rewardIndices.length} className={`px-4 py-3 text-sm font-medium sticky left-0 ${rowBgColor} z-10 border-r border-gray-200 align-top`}>
                        <div className="space-y-1">
                          <div className="font-semibold">{rootNameDisplay}</div>
                          {childNames.length > 0 && (
                            <div className="text-xs text-gray-600 space-y-0.5">
                              {childNames.map((nm: string, i: number) => (
                                <div key={i}>{nm}</div>
                              ))}
                            </div>
                          )}
                          {isSharedGroup && (
                            <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1 inline-block mt-1">
                              共用回饋
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm align-top">
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
                        <span className="bg-orange-100 px-1 rounded font-bold">{primary.rewardComposition.split('/')[rIdx]}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs align-top space-y-1 text-gray-700">
                      {isEditingR ? (
                        <div className="space-y-2">
                          <select 
                            value={rewardForm.method} 
                            onChange={e => setRewardForm({...rewardForm, method: e.target.value})} 
                            className="w-full border p-1 rounded text-xs"
                          >
                            <option value="round">四捨五入</option>
                            <option value="floor">無條件捨去</option>
                            <option value="ceil">無條件進位</option>
                          </select>
                          <select 
                            value={rewardForm.calculationBasis} 
                            onChange={e => setRewardForm({...rewardForm, calculationBasis: e.target.value})} 
                            className="w-full border p-1 rounded text-xs bg-yellow-50"
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
                    <td className="px-4 py-3 text-sm align-top">
                      {formatQuotaInfo(
                        primary.usedQuotas[rIdx], 
                        primary.remainingQuotas[rIdx], 
                        primary.quotaLimits[rIdx],
                        isEditingR, // 使用 isEditingR 來控制編輯模式
                        quotaAdjust, 
                        setQuotaAdjust,
                        `${primary.rewardSourceSchemeId || primary.sharedRewardGroupId || primary.schemeId || primary.paymentMethodId}_${primary.rewardIds[rIdx]}`,
                        manualAdjustments
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm align-top">
                      {isEditingR ? (
                        <div className="space-y-2">
                          <select 
                            value={rewardForm.refreshType} 
                            onChange={e => setRewardForm({...rewardForm, refreshType: e.target.value, refreshValue: '', refreshDate: ''})} 
                            className="w-full border p-1 rounded text-xs"
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
                              className="w-full border p-1 rounded text-xs" 
                              placeholder="1-28號" 
                            />
                          )}
                          {rewardForm.refreshType === 'date' && (
                            <input 
                              type="date" 
                              value={rewardForm.refreshDate} 
                              onChange={e => setRewardForm({...rewardForm, refreshDate: e.target.value})} 
                              className="w-full border p-1 rounded text-xs" 
                            />
                          )}
                          <input 
                            value={rewardForm.limit} 
                            onChange={e => setRewardForm({...rewardForm, limit: e.target.value})} 
                            className="w-full border p-1 rounded text-xs" 
                            placeholder="上限" 
                          />
                        </div>
                      ) : (
                        <div>{primary.refreshTimes?.[rIdx] || '-'}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm align-top">
                      {isEditingR ? (
                        <div className="flex flex-col gap-1">
                          {sharedBound && (
                            <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1">
                              共用回饋：此變更會影響同組方案
                            </div>
                          )}
                          <button onClick={handleSaveAll} className="bg-blue-500 text-white px-2 py-1 rounded text-xs">儲存</button>
                          <button onClick={() => { 
                            setEditingReward(null); 
                            setEditingQuota(null); 
                            setQuotaAdjust(''); 
                          }} className="bg-gray-300 px-2 py-1 rounded text-xs">取消</button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {!isSharedChild ? (
                            <>
                              <button
                                onClick={() => { 
                                  handleRewardEdit(primary.__index, rIdx, groupKey);
                                }} 
                                className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
                              >
                                編輯
                              </button>
                              {isCardScheme && (
                                <button
                                  onClick={() => { 
                                    setBindingTarget({ idx: primary.__index, group: groupKey }); 
                                    const current = quotas.find(q => q.__index === primary.__index);
                                    const rootId = current?.sharedRewardGroupId || current?.rewardSourceSchemeId || current?.schemeId;
                                    const groupMembers = current?.sharedRewardGroupId
                                      ? quotas.filter(x => x.sharedRewardGroupId === current.sharedRewardGroupId || x.schemeId === current.sharedRewardGroupId).map(x => x.schemeId)
                                      : (current?.schemeId ? [current.schemeId] : []);
                                    const preset = rootId
                                      ? Array.from(new Set([rootId, ...groupMembers]))
                                      : groupMembers;
                                    setSelectedSharedGroups(preset);
                                  }}
                                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                                >
                                  回饋綁定
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-2 py-1">
                              共用回饋（由主方案管理）
                            </div>
                          )}
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

      {bindingTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-4 w-96 max-h-[80vh] overflow-y-auto">
            <h4 className="font-semibold mb-3 text-gray-800">回饋綁定</h4>
            {(() => {
              const current = quotas[bindingTarget.idx];
              const currentCardId = current?.cardId;
              const candidates = sharedGroupOptions.filter(opt => !currentCardId || opt.cardId === currentCardId);
              return (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedSharedGroups.length === 0}
                      onChange={() => setSelectedSharedGroups([])}
                    />
                    不綁定
                  </label>
                  {candidates.map(opt => (
                    <label key={opt.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedSharedGroups.includes(opt.id)}
                        onChange={() => {
                          setSelectedSharedGroups(prev =>
                            prev.includes(opt.id) ? prev.filter(id => id !== opt.id) : [...prev, opt.id]
                          );
                        }}
                      />
                      <span>{opt.name}</span>
                    </label>
                  ))}
                  {candidates.length === 0 && (
                    <div className="text-xs text-gray-500">此卡片無可綁定的其他方案</div>
                  )}
                </div>
              );
            })()}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setBindingTarget(null); setSelectedSharedGroups([]); }}
                className="px-3 py-1 bg-gray-300 text-gray-800 rounded text-sm"
              >
                取消
              </button>
                  <button
                    onClick={() => handleBindShared(selectedSharedGroups)}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
                  >
                    確認
                  </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}