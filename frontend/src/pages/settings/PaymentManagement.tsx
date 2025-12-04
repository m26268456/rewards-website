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
  const [isEditingChannels, setIsEditingChannels] = useState(false);
  const [channelText, setChannelText] = useState('');
  
  // 回饋組成編輯狀態
  const [isEditingRewards, setIsEditingRewards] = useState(false);
  const [rewardForm, setRewardForm] = useState<any[]>([]);

  useEffect(() => {
    if (showDetails) loadDetails();
  }, [showDetails]);

  const loadDetails = async () => {
    try {
      const [chRes, rwRes, lsRes] = await Promise.all([
        api.get(`/payment-methods/${payment.id}/channels`),
        api.get(`/payment-methods/${payment.id}/rewards`),
        api.get(`/payment-methods/${payment.id}/linked-schemes`) // 假設有此 API 或直接用 payment.linked_schemes
      ]);
      setChannels(chRes.data.data);
      setRewards(rwRes.data.data);
      // setLinkedSchemes(lsRes.data.data); // 視後端實作而定
      
      setChannelText(chRes.data.data.map((c: any) => c.note ? `${c.name} (${c.note})` : c.name).join('\n'));
      setRewardForm(rwRes.data.data.map((r: any) => ({
        percentage: r.reward_percentage,
        calculationMethod: r.calculation_method,
        quotaLimit: r.quota_limit,
        quotaRefreshType: r.quota_refresh_type,
        quotaRefreshValue: r.quota_refresh_value,
        quotaCalculationBasis: r.quota_calculation_basis || 'transaction'
      })));
    } catch (e) { console.error(e); }
  };

  const handleSaveChannels = async () => {
    try {
      // 簡易實作：解析文字並呼叫 API
      const lines = channelText.split('\n').map(l => l.trim()).filter(l => l);
      // ... (類似 CardManagement 的解析與 batch-resolve 邏輯)
      // 這裡簡化展示，實際請複製 CardManagement 中的 resolveChannels 邏輯
      
      // 假設已解析 ID
      // await api.put(`/payment-methods/${payment.id}/channels`, ...);
      alert('通路已更新 (請實作解析邏輯)');
      setIsEditingChannels(false);
      loadDetails();
    } catch (e) { alert('更新失敗'); }
  };

  return (
    <div className="p-3 bg-gray-50 rounded border">
      <div className="flex justify-between">
        <div>
          <div className="font-medium">{payment.name}</div>
          {payment.note && <div className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: linkify(payment.note) }} />}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowDetails(!showDetails)} className="px-3 py-1 bg-blue-500 text-white rounded text-sm">
            {showDetails ? '隱藏詳細' : '管理詳細'}
          </button>
          <button onClick={onEdit} className="px-3 py-1 bg-yellow-500 text-white rounded text-sm">編輯</button>
          <button onClick={onDelete} className="px-3 py-1 bg-red-500 text-white rounded text-sm">刪除</button>
        </div>
      </div>

      {showDetails && (
        <div className="mt-3 space-y-4 border-t pt-2">
          {/* 通路管理 */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <h5 className="text-sm font-medium">適用通路</h5>
              {!isEditingChannels ? (
                <button onClick={() => setIsEditingChannels(true)} className="text-xs text-blue-600">編輯</button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleSaveChannels} className="text-xs text-green-600">儲存</button>
                  <button onClick={() => setIsEditingChannels(false)} className="text-xs text-gray-600">取消</button>
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

          {/* 回饋組成 (需包含 quotaCalculationBasis) */}
          <div>
            <h5 className="text-sm font-medium mb-1">回饋組成</h5>
            {/* 這裡應實作類似 SchemeDetailManager 的表格 */}
            <div className="text-xs text-gray-500">(回饋組成管理介面待實作，請參考 CardManagement)</div>
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

  useEffect(() => { loadPayments(); }, []);

  const loadPayments = async () => {
    const res = await api.get('/payment-methods');
    setPayments(res.data.data);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value,
      note: (form.elements.namedItem('note') as HTMLInputElement).value,
      displayOrder: editingPayment ? editingPayment.display_order : 0
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
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">支付方式列表</h4>
        <button onClick={() => { setEditingPayment(null); setShowForm(true); }} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">新增支付方式</button>
      </div>

      {showForm && (
        <div className="p-4 bg-gray-50 rounded border">
          <form onSubmit={handleSubmit} className="space-y-3">
            <input name="name" defaultValue={editingPayment?.name} placeholder="名稱" required className="w-full border p-2 rounded" />
            <input name="note" defaultValue={editingPayment?.note} placeholder="備註" className="w-full border p-2 rounded" />
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">儲存</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-300 rounded">取消</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {payments.map(pm => (
          <PaymentMethodItem 
            key={pm.id} 
            payment={pm} 
            onEdit={() => { setEditingPayment(pm); setShowForm(true); }} 
            onDelete={() => handleDelete(pm.id)}
            onReload={loadPayments}
          />
        ))}
      </div>
    </div>
  );
}