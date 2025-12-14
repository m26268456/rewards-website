import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import api from '../../utils/api';

interface TransactionType {
  id: string;
  name: string;
  display_order: number;
}

interface CalculationScheme {
  id: string;
  name: string;
  scheme_id: string | null;
  payment_method_id: string | null;
  display_order: number;
}

interface Card {
  id: string;
  name: string;
}

interface Scheme {
  id: string;
  name: string;
}

interface PaymentMethod {
  id: string;
  name: string;
}

export default function TransactionSettings() {
  const [reasonString, setReasonString] = useState('');
  const [transactionTypes, setTransactionTypes] = useState<TransactionType[]>([]);
  const [schemes, setSchemes] = useState<CalculationScheme[]>([]);
  const [editingType, setEditingType] = useState<TransactionType | null>(null);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [clearDateRange, setClearDateRange] = useState({ startDate: '', endDate: '' });
  
  const [isReorderingSchemes, setIsReorderingSchemes] = useState(false);
  const [reorderedSchemes, setReorderedSchemes] = useState<CalculationScheme[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedTransactionTypes, setExpandedTransactionTypes] = useState(false);
  const [expandedSchemes, setExpandedSchemes] = useState(false);
  const [formData, setFormData] = useState({
    selectedType: '',
    selectedCardId: '',
    selectedSchemeId: '',
    selectedPaymentMethodId: '',
    displayOrder: 0,
  });
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [selectedCardSchemes, setSelectedCardSchemes] = useState<Scheme[]>([]);
  const [allPaymentMethods, setAllPaymentMethods] = useState<PaymentMethod[]>([]);

  const [isReorderingTypes, setIsReorderingTypes] = useState(false);
  const [reorderedTypes, setReorderedTypes] = useState<TransactionType[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (showForm) {
      loadCards();
      loadPaymentMethods();
    }
  }, [showForm]);

  useEffect(() => {
    if (formData.selectedCardId) {
      loadCardSchemes();
    } else {
      setSelectedCardSchemes([]);
    }
  }, [formData.selectedCardId]);

  const loadData = async () => {
    try {
      const [reasonRes, typesRes, schemesRes] = await Promise.all([
        api.get('/settings/reason-strings'),
        api.get('/settings/transaction-types'),
        api.get('/settings/calculation-schemes'),
      ]);
      if (reasonRes.data.data.length > 0) {
        setReasonString(reasonRes.data.data[0].content);
      }
      setTransactionTypes(typesRes.data.data);
      setSchemes(schemesRes.data.data);
    } catch (error) {
      console.error('載入資料錯誤:', error);
    }
  };

  const loadCards = async () => {
    try {
      const res = await api.get('/cards');
      setAllCards(res.data.data);
    } catch (error) {
      console.error('載入卡片錯誤:', error);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      const res = await api.get('/payment-methods');
      setAllPaymentMethods(res.data.data);
    } catch (error) {
      console.error('載入支付方式錯誤:', error);
    }
  };

  const loadCardSchemes = async () => {
    try {
      const res = await api.get(`/schemes/card/${formData.selectedCardId}`);
      setSelectedCardSchemes(res.data.data.map((s: any) => ({ id: s.id, name: s.name })));
    } catch (error) {
      console.error('載入方案錯誤:', error);
    }
  };

  const handleUpdateReason = async () => {
    try {
      await api.put('/settings/reason-strings', { content: reasonString });
      alert('事由字串已更新');
    } catch (error) {
      console.error('更新錯誤:', error);
      alert('更新失敗');
    }
  };

  const handleTypeSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formDataObj = new FormData(form);
    const data = {
      name: formDataObj.get('name'),
      displayOrder: parseInt(formDataObj.get('displayOrder') as string) || 0,
    };

    try {
      if (editingType) {
        await api.put(`/settings/transaction-types/${editingType.id}`, data);
      } else {
        await api.post('/settings/transaction-types', data);
      }
      alert(editingType ? '交易類型已更新' : '交易類型已新增');
      setShowTypeForm(false);
      setEditingType(null);
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.error || '操作失敗');
    }
  };

  const handleTypeDelete = async (id: string) => {
    if (!confirm('確定要刪除這個交易類型嗎？')) return;
    try {
      await api.delete(`/settings/transaction-types/${id}`);
      alert('交易類型已刪除');
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.error || '刪除失敗');
    }
  };

  const handleTypeOrderUpdate = async () => {
    if (isReorderingTypes) {
      try {
        const orders = reorderedTypes.map((type, index) => ({
          id: type.id,
          displayOrder: index,
        }));
        await api.put('/settings/transaction-types/order', { orders });
        alert('順序已更新');
        setIsReorderingTypes(false);
        loadData();
      } catch (error: any) {
        alert(error.response?.data?.error || '更新失敗');
      }
    } else {
      setIsReorderingTypes(true);
      setReorderedTypes([...transactionTypes]);
    }
  };

  const moveType = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newTypes = [...reorderedTypes];
    if (direction === 'up' && index > 0) {
      [newTypes[index - 1], newTypes[index]] = [newTypes[index], newTypes[index - 1]];
    } else if (direction === 'down' && index < newTypes.length - 1) {
      [newTypes[index], newTypes[index + 1]] = [newTypes[index + 1], newTypes[index]];
    } else if (direction === 'top') {
      const item = newTypes.splice(index, 1)[0];
      newTypes.unshift(item);
    } else if (direction === 'bottom') {
      const item = newTypes.splice(index, 1)[0];
      newTypes.push(item);
    }
    setReorderedTypes(newTypes);
  };

  const handleAddScheme = async () => {
    if (formData.selectedType === 'card' && !formData.selectedSchemeId) {
      return alert('請選擇方案');
    } else if (formData.selectedType === 'payment' && !formData.selectedPaymentMethodId) {
      return alert('請選擇支付方式');
    } else if (!formData.selectedType) {
      return alert('請選擇類型');
    }

    try {
      const maxDisplayOrder = schemes.length > 0 
        ? Math.max(...schemes.map(s => s.display_order ?? 0)) 
        : -1;
      
      const submitData: {
        schemeId?: string;
        paymentMethodId?: string;
        displayOrder: number;
      } = {
        displayOrder: maxDisplayOrder + 1,
      };

      if (formData.selectedType === 'card') {
        submitData.schemeId = formData.selectedSchemeId;
        // [修正] 強制移除 payment link
        submitData.paymentMethodId = undefined;
      } else {
        submitData.paymentMethodId = formData.selectedPaymentMethodId;
      }

      await api.post('/settings/calculation-schemes', submitData);
      alert('方案已新增');
      setShowForm(false);
      setFormData({ selectedType: '', selectedCardId: '', selectedSchemeId: '', selectedPaymentMethodId: '', displayOrder: 0 });
      setSelectedCardSchemes([]);
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.error || '新增失敗');
    }
  };

  const handleSchemeDelete = async (id: string) => {
    if (!confirm('確定要刪除這個方案嗎？')) return;
    try {
      await api.delete(`/settings/calculation-schemes/${id}`);
      alert('方案已刪除');
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.error || '刪除失敗');
    }
  };

  const handleSchemeOrderUpdate = async () => {
    if (isReorderingSchemes) {
      try {
        const orders = reorderedSchemes.map((scheme, index) => ({
          id: scheme.id,
          displayOrder: index,
        }));
        await api.put('/settings/calculation-schemes/order', { orders });
        alert('順序已更新');
        setIsReorderingSchemes(false);
        loadData();
      } catch (error: any) {
        alert(error.response?.data?.error || '更新失敗');
      }
    } else {
      setIsReorderingSchemes(true);
      setReorderedSchemes([...schemes]);
    }
  };

  const moveScheme = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const newSchemes = [...reorderedSchemes];
    if (direction === 'up' && index > 0) {
      [newSchemes[index - 1], newSchemes[index]] = [newSchemes[index], newSchemes[index - 1]];
    } else if (direction === 'down' && index < newSchemes.length - 1) {
      [newSchemes[index], newSchemes[index + 1]] = [newSchemes[index + 1], newSchemes[index]];
    } else if (direction === 'top') {
      const item = newSchemes.splice(index, 1)[0];
      newSchemes.unshift(item);
    } else if (direction === 'bottom') {
      const item = newSchemes.splice(index, 1)[0];
      newSchemes.push(item);
    }
    setReorderedSchemes(newSchemes);
  };

  const handleClearTransactions = async () => {
    if (!confirm(`確定要清除 ${clearDateRange.startDate} 至 ${clearDateRange.endDate} 的所有交易明細嗎？此操作無法復原！`)) return;
    if (!confirm('請再次確認：這將永久刪除該時間區間內的所有交易記錄，且會影響額度計算。確定要繼續嗎？')) return;

    try {
      const res = await api.delete(
        `/settings/transactions/clear?startDate=${clearDateRange.startDate}&endDate=${clearDateRange.endDate}`
      );
      alert(res.data.message || '交易明細已清除');
      setClearDateRange({ startDate: '', endDate: '' });
    } catch (error: any) {
      alert(error.response?.data?.error || '清除失敗');
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">記帳功能設定</h3>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">事由字串</label>
          <textarea
            value={reasonString}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReasonString(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          <button onClick={handleUpdateReason} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">更新</button>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <button onClick={() => setExpandedTransactionTypes(!expandedTransactionTypes)} className="text-lg font-medium hover:text-blue-600 transition-colors">
              {expandedTransactionTypes ? '▼' : '▶'} 交易類型
            </button>
            {expandedTransactionTypes && (
              <div className="flex gap-2">
                <button onClick={handleTypeOrderUpdate} className={`px-3 py-1 rounded text-sm text-white ${isReorderingTypes ? 'bg-green-500' : 'bg-gray-500'}`}>
                  {isReorderingTypes ? '儲存順序' : '調整順序'}
                </button>
                {isReorderingTypes && <button onClick={() => { setIsReorderingTypes(false); setReorderedTypes([...transactionTypes]); }} className="px-3 py-1 bg-red-500 text-white rounded text-sm">取消</button>}
                <button onClick={() => { setEditingType(null); setShowTypeForm(true); }} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">新增類型</button>
              </div>
            )}
          </div>

          {expandedTransactionTypes && (
            <>
              {showTypeForm && (
                <div className="p-4 bg-gray-50 rounded-lg border mb-4">
                  <form onSubmit={handleTypeSubmit} className="space-y-3">
                    <input name="name" defaultValue={editingType?.name} placeholder="類型名稱" required className="w-full border p-2 rounded" />
                    <div className="flex gap-2">
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">{editingType ? '更新' : '新增'}</button>
                      <button type="button" onClick={() => setShowTypeForm(false)} className="px-4 py-2 bg-gray-300 rounded">取消</button>
                    </div>
                  </form>
                </div>
              )}
              <div className="space-y-2">
                {(isReorderingTypes ? reorderedTypes : transactionTypes).map((type, index) => (
                  <div key={type.id} className="flex items-center gap-2">
                    <div className="flex-1 flex items-center justify-between p-3 bg-gray-50 rounded border">
                      <div className="font-medium">{type.name}</div>
                      {!isReorderingTypes && (
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingType(type); setShowTypeForm(true); }} className="text-yellow-600 text-sm">編輯</button>
                          <button onClick={() => handleTypeDelete(type.id)} className="text-red-600 text-sm">刪除</button>
                        </div>
                      )}
                    </div>
                    {isReorderingTypes && (
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveType(index, 'top')} className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs">⬆⬆</button>
                        <button onClick={() => moveType(index, 'up')} className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs" disabled={index === 0}>⬆</button>
                        <button onClick={() => moveType(index, 'down')} className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs" disabled={index === (isReorderingTypes ? reorderedTypes : transactionTypes).length - 1}>⬇</button>
                        <button onClick={() => moveType(index, 'bottom')} className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs">⬇⬇</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <button onClick={() => setExpandedSchemes(!expandedSchemes)} className="text-lg font-medium hover:text-blue-600 transition-colors">
              {expandedSchemes ? '▼' : '▶'} 可用方案
            </button>
            {expandedSchemes && (
              <div className="flex gap-2">
                <button onClick={handleSchemeOrderUpdate} className={`px-3 py-1 rounded text-sm text-white ${isReorderingSchemes ? 'bg-green-500' : 'bg-gray-500'}`}>
                  {isReorderingSchemes ? '儲存順序' : '調整順序'}
                </button>
                {isReorderingSchemes && <button onClick={() => { setIsReorderingSchemes(false); setReorderedSchemes([...schemes]); }} className="px-3 py-1 bg-red-500 text-white rounded text-sm">取消</button>}
                <button onClick={() => setShowForm(true)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">新增方案</button>
              </div>
            )}
          </div>
          {expandedSchemes && (
            <>
              {showForm && (
                <div className="p-4 bg-gray-50 rounded-lg border mb-4">
                  <div className="space-y-3">
                    <select value={formData.selectedType} onChange={e => setFormData({ ...formData, selectedType: e.target.value, selectedCardId: '', selectedSchemeId: '', selectedPaymentMethodId: '' })} className="w-full border p-2 rounded">
                      <option value="">請選擇類型</option>
                      <option value="card">信用卡</option>
                      <option value="payment">支付方式</option>
                    </select>
                    {formData.selectedType === 'card' && (
                      <>
                        <select value={formData.selectedCardId} onChange={e => setFormData({ ...formData, selectedCardId: e.target.value, selectedSchemeId: '' })} className="w-full border p-2 rounded">
                          <option value="">請選擇卡片</option>
                          {allCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {formData.selectedCardId && (
                          <select value={formData.selectedSchemeId} onChange={e => setFormData({ ...formData, selectedSchemeId: e.target.value })} className="w-full border p-2 rounded">
                            <option value="">請選擇方案</option>
                            {selectedCardSchemes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        )}
                      </>
                    )}
                    {formData.selectedType === 'payment' && (
                      <select value={formData.selectedPaymentMethodId} onChange={e => setFormData({ ...formData, selectedPaymentMethodId: e.target.value })} className="w-full border p-2 rounded">
                        <option value="">請選擇支付方式</option>
                        {allPaymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                      </select>
                    )}
                    <div className="flex gap-2">
                      <button onClick={handleAddScheme} className="px-4 py-2 bg-blue-600 text-white rounded">新增</button>
                      <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-300 rounded">取消</button>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {(isReorderingSchemes ? reorderedSchemes : schemes).map((scheme, index) => (
                  <div key={scheme.id} className="flex items-center gap-2">
                    <div className="flex-1 flex items-center justify-between p-3 bg-gray-50 rounded border">
                      <div className="font-medium">{scheme.name}</div>
                      {!isReorderingSchemes && <button onClick={() => handleSchemeDelete(scheme.id)} className="text-red-600 text-sm">刪除</button>}
                    </div>
                    {isReorderingSchemes && (
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveScheme(index, 'top')} className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs">⬆⬆</button>
                        <button onClick={() => moveScheme(index, 'up')} className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs" disabled={index === 0}>⬆</button>
                        <button onClick={() => moveScheme(index, 'down')} className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs" disabled={index === (isReorderingSchemes ? reorderedSchemes : schemes).length - 1}>⬇</button>
                        <button onClick={() => moveScheme(index, 'bottom')} className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs">⬇⬇</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <h4 className="font-medium text-red-600 mb-2">清除交易明細</h4>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1"><label className="block text-sm font-medium mb-1">開始日期</label><input type="date" value={clearDateRange.startDate} onChange={e => setClearDateRange({ ...clearDateRange, startDate: e.target.value })} onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()} className="w-full border p-2 rounded" /></div>
                <div className="flex-1"><label className="block text-sm font-medium mb-1">結束日期</label><input type="date" value={clearDateRange.endDate} onChange={e => setClearDateRange({ ...clearDateRange, endDate: e.target.value })} onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()} className="w-full border p-2 rounded" /></div>
                <button onClick={() => { 
                  const now = new Date();
                  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1); // 上上個月1號
                  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1);   // 上個月1號
                  setClearDateRange({ 
                    startDate: start.toISOString().split('T')[0], 
                    endDate: end.toISOString().split('T')[0] 
                  }); 
                }} className="px-3 py-2 bg-gray-500 text-white rounded text-sm">快速設定</button>
              </div>
              <button onClick={handleClearTransactions} className="px-4 py-2 bg-red-600 text-white rounded">確認清除</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}