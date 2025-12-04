// path: main/frontend/src/pages/settings/CalculationSchemeSettings.tsx
import { useState, useEffect, ChangeEvent } from 'react';
import api from '../../utils/api';

interface CalculationScheme {
  id: string;
  scheme_id: string | null;
  payment_method_id: string | null;
  display_order: number;
  name: string;
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

export default function CalculationSchemeSettings() {
  const [schemes, setSchemes] = useState<CalculationScheme[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [allPaymentMethods, setAllPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    selectedType: '', // 'card' 或 'payment'
    selectedCardId: '',
    selectedSchemeId: '',
    selectedPaymentMethodId: '',
    displayOrder: 0,
  });
  const [selectedCardSchemes, setSelectedCardSchemes] = useState<Scheme[]>([]);
  const [isReorderingSchemes, setIsReorderingSchemes] = useState(false);
  const [reorderedSchemes, setReorderedSchemes] = useState<CalculationScheme[]>([]);

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
      const res = await api.get('/settings/calculation-schemes');
      setSchemes(res.data.data);
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

  const handleAdd = async () => {
    // 驗證邏輯
    if (formData.selectedType === 'card') {
      if (!formData.selectedSchemeId) {
        alert('請選擇方案');
        return;
      }
    } else if (formData.selectedType === 'payment') {
      if (!formData.selectedPaymentMethodId) {
        alert('請選擇支付方式');
        return;
      }
    } else {
      alert('請選擇類型');
      return;
    }

    try {
      // 計算新的 displayOrder（確保新增到最下面）
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
        // [修正項目 4] 移除信用卡綁定支付方式的邏輯
        submitData.paymentMethodId = undefined; 
      } else {
        submitData.paymentMethodId = formData.selectedPaymentMethodId;
      }

      await api.post('/settings/calculation-schemes', submitData);
      alert('方案已新增');
      setShowForm(false);
      resetForm();
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.error || '新增失敗');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個計算方案嗎？')) return;
    try {
      await api.delete(`/settings/calculation-schemes/${id}`);
      alert('方案已刪除');
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.error || '刪除失敗');
    }
  };

  const resetForm = () => {
    setFormData({ 
      selectedType: '', 
      selectedCardId: '', 
      selectedSchemeId: '', 
      selectedPaymentMethodId: '', 
      displayOrder: 0 
    });
    setSelectedCardSchemes([]);
  };

  const handleOrderUpdate = async () => {
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

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">回饋計算設定</h3>

      <div className="flex justify-between items-center">
        <h4 className="font-medium">計算方案列表</h4>
        <div className="flex gap-2">
          <button
            onClick={handleOrderUpdate}
            className={`px-3 py-1 rounded text-sm ${
              isReorderingSchemes
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-500 text-white hover:bg-gray-600'
            }`}
          >
            {isReorderingSchemes ? '儲存順序' : '調整順序'}
          </button>
          {isReorderingSchemes && (
            <button
              onClick={() => {
                setIsReorderingSchemes(false);
                setReorderedSchemes([...schemes]);
              }}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              取消
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            新增方案
          </button>
        </div>
      </div>

      {showForm && (
        <div className="p-4 bg-gray-50 rounded-lg border">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">類型 *</label>
              <select
                value={formData.selectedType}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const type = e.target.value;
                  setFormData(prev => ({
                    ...prev,
                    selectedType: type,
                    selectedCardId: '',
                    selectedSchemeId: '',
                    selectedPaymentMethodId: ''
                  }));
                }}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">請選擇類型</option>
                <option value="card">信用卡</option>
                <option value="payment">支付方式</option>
              </select>
            </div>

            {formData.selectedType === 'card' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">選擇卡片 *</label>
                  <select
                    value={formData.selectedCardId}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData(prev => ({ ...prev, selectedCardId: e.target.value, selectedSchemeId: '' }))
                    }
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">請選擇卡片</option>
                    {allCards.map((card) => (
                      <option key={card.id} value={card.id}>{card.name}</option>
                    ))}
                  </select>
                </div>
                {formData.selectedCardId && (
                  <div>
                    <label className="block text-sm font-medium mb-1">選擇方案 *</label>
                    <select
                      value={formData.selectedSchemeId}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData(prev => ({ ...prev, selectedSchemeId: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="">請選擇方案</option>
                      {selectedCardSchemes.map((scheme) => (
                        <option key={scheme.id} value={scheme.id}>{scheme.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {/* [修正項目 4] 移除了選擇支付方式的下拉選單 */}
              </>
            )}

            {formData.selectedType === 'payment' && (
              <div>
                <label className="block text-sm font-medium mb-1">選擇支付方式 *</label>
                <select
                  value={formData.selectedPaymentMethodId}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                    setFormData(prev => ({ ...prev, selectedPaymentMethodId: e.target.value }))
                  }
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">請選擇支付方式</option>
                  {allPaymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                新增
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(isReorderingSchemes ? reorderedSchemes : schemes).map((scheme, index) => (
          <div key={scheme.id} className="flex items-center gap-2">
            <div className="flex-1 flex items-center justify-between p-3 bg-gray-50 rounded border">
              <div>
                <div className="font-medium">{scheme.name}</div>
              </div>
              {!isReorderingSchemes && (
                <button
                  onClick={() => handleDelete(scheme.id)}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  刪除
                </button>
              )}
            </div>
            {isReorderingSchemes && (
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveScheme(index, 'top')}
                  className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                  title="置頂"
                >
                  ⬆⬆
                </button>
                <button
                  onClick={() => moveScheme(index, 'up')}
                  className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                  disabled={index === 0}
                  title="上移"
                >
                  ⬆
                </button>
                <button
                  onClick={() => moveScheme(index, 'down')}
                  className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                  disabled={index === (isReorderingSchemes ? reorderedSchemes : schemes).length - 1}
                  title="下移"
                >
                  ⬇
                </button>
                <button
                  onClick={() => moveScheme(index, 'bottom')}
                  className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 text-[10px] leading-tight"
                  title="置底"
                >
                  ⬇⬇
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}