// path: main/frontend/src/pages/settings/PaymentManagement.tsx
import { useState, useEffect, useRef, FormEvent } from 'react';
import api from '../../utils/api';

// 輔助函數 (與 CardManagement 相同，可考慮提取到 utils)
function linkify(text: string): string {
  if (!text) return '';
  return text.replace(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi, (url) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">${url}</a>`;
  });
}

// 支付方式項目組件
function PaymentMethodItem({ payment, onEdit, onDelete, onReload }: any) {
  const [showDetails, setShowDetails] = useState(false);
  const [channels, setChannels] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [linkedSchemes, setLinkedSchemes] = useState<any[]>([]);
  const [cardsOptions, setCardsOptions] = useState<any[]>([]);
  const [cardSchemeMap, setCardSchemeMap] = useState<Record<string, any[]>>({});
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>('');
  const [isEditingChannels, setIsEditingChannels] = useState(false);
  const [channelText, setChannelText] = useState('');
  const channelCache = useRef<Map<string, string>>(new Map());
  const itemRef = useRef<HTMLDivElement | null>(null);
  
  // 回饋組成改為唯讀，不提供編輯

  useEffect(() => {
    if (showDetails) loadDetails();
  }, [showDetails, payment.id]);

  useEffect(() => {
    if (!showDetails) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDetails(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (itemRef.current && !itemRef.current.contains(e.target as Node)) {
        setShowDetails(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [showDetails]);

  const resolveChannels = async (names: string[]) => {
    const pending = names.filter(n => !channelCache.current.has(n.toLowerCase()));
    if (pending.length > 0) {
      try {
        const res = await api.post('/channels/batch-resolve', { items: pending.map(name => ({ name })), createIfMissing: true });
        (res.data.data || []).forEach((item: any) => {
          if (item.inputName && item.channelId) {
            channelCache.current.set(item.inputName.toLowerCase(), item.channelId);
          }
        });
      } catch (e) {
        console.error('解析通路失敗', e);
      }
    }
  };

  const loadDetails = async () => {
    try {
      const [chRes, rwRes, lsRes, schemeRes] = await Promise.all([
        api.get(`/payment-methods/${payment.id}/channels`),
        api.get(`/payment-methods/${payment.id}/rewards`),
        api.get(`/payment-methods/${payment.id}/linked-schemes`),
        api.get('/schemes/overview'),
      ]);
      setChannels(chRes.data.data);
      setRewards(rwRes.data.data);
      setLinkedSchemes(lsRes.data.data || []);
      // 展開 overview 取得方案選項（cardName + schemeName）
      const cardOpts: any[] = [];
      const csMap: Record<string, any[]> = {};
      (schemeRes.data.data || []).forEach((card: any) => {
        cardOpts.push({ cardId: card.id, cardName: card.name });
        csMap[card.id] = (card.schemes || []).map((s: any) => ({
          schemeId: s.id,
          schemeName: s.name,
        }));
      });
      setCardsOptions(cardOpts);
      setCardSchemeMap(csMap);
      setChannelText(chRes.data.data.map((c: any) => c.note ? `${c.name} (${c.note})` : c.name).join('\n'));
    } catch (e) { console.error(e); }
  };

  const handleSaveChannels = async () => {
    try {
      const lines = channelText.split('\n').map(l => l.trim()).filter(l => l);
      const entries = lines.map(line => {
        const match = line.match(/^(.+?)\s*\((.+?)\)$/);
        return match ? { name: match[1].trim(), note: match[2].trim() } : { name: line, note: '' };
      });

      await resolveChannels(entries.map(e => e.name));

      const applications = entries.map(e => ({
        channelId: channelCache.current.get(e.name.toLowerCase()),
        note: e.note,
      })).filter(e => e.channelId);

      await api.put(`/payment-methods/${payment.id}/channels`, { applications });
      alert('通路已更新');
      setIsEditingChannels(false);
      loadDetails();
    } catch (e) { alert('更新失敗'); }
  };

  const handleLinkScheme = async () => {
    if (!selectedSchemeId) return;
    try {
      await api.post(`/payment-methods/${payment.id}/link-scheme`, {
        schemeId: selectedSchemeId,
        displayOrder: linkedSchemes.length,
      });
      setSelectedSchemeId('');
      await loadDetails();
    } catch (e) {
      alert('綁定失敗');
    }
  };

  const handleUnlinkScheme = async (schemeId: string) => {
    try {
      await api.delete(`/payment-methods/${payment.id}/unlink-scheme/${schemeId}`);
      await loadDetails();
    } catch (e) {
      alert('解除綁定失敗');
    }
  };

  // 回饋組成改為唯讀，不提供編輯

  return (
    <div className="p-3 bg-gray-50 rounded border" ref={itemRef}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium">{payment.name}</div>
          {payment.note && <div className="text-sm text-gray-600 mt-1" dangerouslySetInnerHTML={{ __html: linkify(payment.note) }} />}
      </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 whitespace-nowrap"
          >
          {showDetails ? '隱藏詳細' : '管理詳細'}
        </button>
          <button
            onClick={onEdit}
            className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 whitespace-nowrap"
          >
            編輯
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 whitespace-nowrap"
          >
            刪除
          </button>
        </div>
      </div>
 
      {showDetails && (
        <div className="mt-3 space-y-4 border-t pt-2">
          {/* 通路管理 */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <h5 className="text-sm font-medium">適用通路</h5>
              {!isEditingChannels ? (
                <button onClick={() => setIsEditingChannels(true)} className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600">編輯</button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleSaveChannels} className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">儲存</button>
                  <button onClick={() => setIsEditingChannels(false)} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">取消</button>
                </div>
              )}
            </div>
            {isEditingChannels ? (
              <textarea value={channelText} onChange={e => setChannelText(e.target.value)} className="w-full border p-1 text-sm rounded" rows={3} />
            ) : (
              <div className="text-xs text-gray-700">
                {channels.length > 0 ? channels.map(c => c.name).join(', ') : '無'}
              </div>
            )}
          </div>

          {/* 綁定的卡片方案（信用卡綁定支付方式） */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h5 className="text-sm font-medium">綁定的卡片方案</h5>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-medium text-gray-700">卡片</span>
                <select
                  value={selectedCardId}
                  onChange={(e) => { setSelectedCardId(e.target.value); setSelectedSchemeId(''); }}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="">選擇卡片</option>
                  {cardsOptions.map((opt) => (
                    <option key={opt.cardId} value={opt.cardId}>{opt.cardName}</option>
                  ))}
                </select>
                <span className="text-xs font-medium text-gray-700">方案</span>
                <select
                  value={selectedSchemeId}
                  onChange={(e) => setSelectedSchemeId(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                  disabled={!selectedCardId}
                >
                  <option value="">選擇方案</option>
                  {(cardSchemeMap[selectedCardId] || []).map((s) => (
                    <option key={s.schemeId} value={s.schemeId}>{s.schemeName}</option>
                  ))}
                </select>
                <button
                  onClick={handleLinkScheme}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                  disabled={!selectedSchemeId}
                >
                  綁定
                </button>
              </div>
            </div>
            {linkedSchemes && linkedSchemes.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-xs">
                {linkedSchemes.map((ls: any, idx: number) => (
                  <div key={idx} className="inline-flex items-center gap-2 bg-gray-100 px-2 py-1 rounded border">
                    <span className="font-semibold text-gray-800">{ls.cardName}</span>
                    <span className="text-gray-500">-</span>
                    <span>{ls.schemeName}</span>
                    <button
                      onClick={() => handleUnlinkScheme(ls.schemeId)}
                      className="text-red-600 text-[11px] hover:underline"
                    >
                      解除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">尚未綁定方案</div>
            )}
          </div>

      {/* 回饋組成：唯讀顯示，編輯改由額度管理 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-medium mb-1">回饋組成</h5>
            </div>
            {rewards.length === 0 && (
              <div className="text-xs text-gray-500">尚未設定回饋</div>
            )}
            {rewards.length > 0 && (
              <div className="overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full text-xs text-gray-700">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left font-semibold whitespace-nowrap">回饋 %</th>
                      <th className="px-2 py-1 text-left font-semibold whitespace-nowrap">方式 / 基準</th>
                      <th className="px-2 py-1 text-left font-semibold whitespace-nowrap">上限</th>
                      <th className="px-2 py-1 text-left font-semibold whitespace-nowrap">刷新</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rewards.map((r: any, idx: number) => {
                      const methodMap: Record<string, string> = { round: '四捨五入', floor: '無條件捨去', ceil: '無條件進位' };
                      const basisMap: Record<string, string> = { transaction: '單筆回饋', statement: '帳單總額' };
                      const refreshText =
                        r.quota_refresh_type === 'monthly' && r.quota_refresh_value
                          ? `每月 ${r.quota_refresh_value} 號`
                          : r.quota_refresh_type === 'date' && r.quota_refresh_date
                          ? `指定 ${String(r.quota_refresh_date).split('T')[0]}`
                          : r.quota_refresh_type === 'activity'
                          ? '活動結束'
                          : '不刷新';
                      return (
                        <tr key={r.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-2 py-1 font-semibold text-green-700">{r.reward_percentage}%</td>
                          <td className="px-2 py-1 space-y-0.5">
                            <div>{methodMap[r.calculation_method] || r.calculation_method}</div>
                            <div className="text-[11px] text-purple-600 border border-purple-200 rounded px-1 inline-block">
                              {basisMap[r.quota_calculation_basis || 'transaction'] || '單筆回饋'}
                            </div>
                          </td>
                          <td className="px-2 py-1">{r.quota_limit ?? '無上限'}</td>
                          <td className="px-2 py-1">{refreshText}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

export default function PaymentManagement() {
  const [payments, setPayments] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [reorderedPayments, setReorderedPayments] = useState<any[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { loadPayments(); }, []);
  useEffect(() => {
    const confirmClose = () => {
      if (editingPayment || showForm) {
        return confirm('確定要取消編輯嗎？未儲存的變更將遺失。');
      }
      return true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingPayment || showForm) {
          if (!confirmClose()) return;
          setEditingPayment(null);
          setShowForm(false);
        }
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        if (editingPayment || showForm) {
          if (!confirmClose()) return;
          setEditingPayment(null);
          setShowForm(false);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [editingPayment, showForm]);

  const loadPayments = async () => {
    const res = await api.get('/payment-methods');
    setPayments(res.data.data);
  };

  const savePaymentOrder = async () => {
    try {
      await Promise.all(
        reorderedPayments.map((pm, idx) =>
          api.put(`/payment-methods/${pm.id}`, { ...pm, displayOrder: idx })
        )
      );
      setIsReordering(false);
      loadPayments();
    } catch (e) {
      alert('排序更新失敗');
    }
  };

  const movePayment = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newArr = [...reorderedPayments];
    const item = newArr[index];
    newArr.splice(index, 1);
    if (direction === 'top') newArr.unshift(item);
    else if (direction === 'bottom') newArr.push(item);
    else {
      const target = direction === 'up' ? index - 1 : index + 1;
      newArr.splice(Math.max(0, Math.min(target, newArr.length)), 0, item);
    }
    setReorderedPayments(newArr);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value,
      note: (form.elements.namedItem('note') as HTMLInputElement).value,
      displayOrder: editingPayment ? editingPayment.display_order : 0,
      activityStartDate: (form.elements.namedItem('activityStartDate') as HTMLInputElement)?.value || null,
      activityEndDate: (form.elements.namedItem('activityEndDate') as HTMLInputElement)?.value || null,
    };
    
    if (editingPayment) await api.put(`/payment-methods/${editingPayment.id}`, data);
    else await api.post('/payment-methods', data);
    
    setShowForm(false);
    setEditingPayment(null);
    loadPayments();
  };

  const handleDelete = async (id: string) => {
    if (confirm('確定刪除？')) {
      await api.delete(`/payment-methods/${id}`);
      loadPayments();
    }
  };

  return (
    <div className="space-y-4" ref={rootRef}>
      <div className="flex justify-between items-center">
        <h4 className="font-medium">支付方式列表</h4>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (isReordering) savePaymentOrder();
              else { setIsReordering(true); setReorderedPayments([...payments]); }
            }}
            className={`px-3 py-1 rounded text-sm text-white ${isReordering ? 'bg-green-500' : 'bg-gray-500'}`}
          >
            {isReordering ? '儲存順序' : '調整順序'}
          </button>
          {isReordering ? (
            <button onClick={() => setIsReordering(false)} className="px-3 py-1 bg-red-500 text-white rounded text-sm">取消</button>
          ) : (
            <button onClick={() => { setEditingPayment(null); setShowForm(true); }} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">新增支付方式</button>
          )}
        </div>
      </div>

      {/* 新增表單（僅新增時） */}
      {showForm && !editingPayment && (
        <div className="p-4 bg-gray-50 rounded border">
          <form onSubmit={handleSubmit} className="space-y-3">
            <input name="name" defaultValue={editingPayment?.name} placeholder="名稱" required className="w-full border p-2 rounded" />
            <input name="note" defaultValue={editingPayment?.note} placeholder="備註" className="w-full border p-2 rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-xs text-gray-600 flex flex-col">
                活動開始日
                <input
                  type="date"
                  name="activityStartDate"
                  className="border p-2 rounded text-sm"
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                />
              </label>
              <label className="text-xs text-gray-600 flex flex-col">
                活動結束日
                <input
                  type="date"
                  name="activityEndDate"
                  className="border p-2 rounded text-sm"
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">儲存</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-300 rounded">取消</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {(isReordering ? reorderedPayments : payments).map((pm, idx) => (
          <div key={pm.id} className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
              <div className="flex-1">
                <PaymentMethodItem 
                  payment={pm} 
                  onEdit={() => { if (!isReordering) { setEditingPayment(pm); setShowForm(true); }}}
                  onDelete={() => !isReordering && handleDelete(pm.id)}
                  onReload={loadPayments}
                />
              </div>
              {isReordering && (
                <div className="flex flex-col gap-1">
                  <button onClick={() => movePayment(idx, 'top')} className="px-2 py-1 bg-gray-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === 0}>⏫ 置頂</button>
                  <button onClick={() => movePayment(idx, 'up')} className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === 0}>▲ 上移</button>
                  <button onClick={() => movePayment(idx, 'down')} className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === (isReordering ? reorderedPayments.length - 1 : payments.length - 1)}>▼ 下移</button>
                  <button onClick={() => movePayment(idx, 'bottom')} className="px-2 py-1 bg-gray-600 text-white rounded text-xs disabled:opacity-40" disabled={idx === (isReordering ? reorderedPayments.length - 1 : payments.length - 1)}>⏬ 置底</button>
                </div>
              )}
            </div>
            {!isReordering && editingPayment?.id === pm.id && showForm && (
              <div className="p-3 bg-white border rounded shadow-sm mt-2">
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input name="name" defaultValue={editingPayment?.name} placeholder="名稱" required className="w-full border p-2 rounded text-sm" />
                  <input name="note" defaultValue={editingPayment?.note} placeholder="備註" className="w-full border p-2 rounded text-sm" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="text-xs text-gray-600 flex flex-col">
                      活動開始日
                      <input
                        type="date"
                        name="activityStartDate"
                        defaultValue={editingPayment?.activity_start_date || ''}
                        className="border p-2 rounded text-sm"
                        onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                      />
                    </label>
                    <label className="text-xs text-gray-600 flex flex-col">
                      活動結束日
                      <input
                        type="date"
                        name="activityEndDate"
                        defaultValue={editingPayment?.activity_end_date || ''}
                        className="border p-2 rounded text-sm"
                        onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-xs">儲存</button>
                    <button type="button" onClick={() => { setShowForm(false); setEditingPayment(null); }} className="px-3 py-1 bg-gray-400 text-white rounded text-xs">取消</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}