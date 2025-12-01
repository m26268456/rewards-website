import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { utcToZonedTime, format as formatTz } from 'date-fns-tz';
import api from '../utils/api';
import * as XLSX from 'xlsx';

// 時區設定：UTC+8 (Asia/Taipei)
const TIMEZONE = 'Asia/Taipei';

interface Transaction {
  id: string;
  transaction_date: string;
  reason: string;
  amount: number;
  type_name: string;
  scheme_name: string;
  note: string;
  created_at: string;
}

interface TransactionType {
  id: string;
  name: string;
}

interface Scheme {
  id: string;
  name: string;
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionTypes, setTransactionTypes] = useState<TransactionType[]>([]);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [reasonString, setReasonString] = useState('');
  const [formData, setFormData] = useState({
    transactionDate: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
    amount: '',
    typeId: '',
    note: '',
    schemeId: '',
  });

  useEffect(() => {
    loadTransactions();
    loadTransactionTypes();
    loadSchemes();
    loadReasonString();
  }, []);

  const loadTransactions = async () => {
    const res = await api.get('/transactions');
    setTransactions(res.data.data);
  };

  const loadTransactionTypes = async () => {
    const res = await api.get('/settings/transaction-types');
    setTransactionTypes(res.data.data);
  };

  const loadSchemes = async () => {
    // 從設定中取得可用方案
    try {
      const res = await api.get('/settings/calculation-schemes');
      // 需要轉換格式，保存原始資料以便後續判斷
      const schemesData = res.data.data.map((item: any) => ({
        id: item.scheme_id && item.payment_method_id
          ? `${item.scheme_id}_${item.payment_method_id}`
          : (item.scheme_id || item.payment_method_id),
        name: item.name,
        schemeId: item.scheme_id,
        paymentMethodId: item.payment_method_id,
      }));
      setSchemes(schemesData);
    } catch (error) {
      console.error('載入方案錯誤:', error);
    }
  };

  const loadReasonString = async () => {
    const res = await api.get('/settings/reason-strings');
    if (res.data.data.length > 0) {
      setReasonString(res.data.data[0].content);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.transactionDate || !formData.reason || !formData.typeId) {
      alert('請填寫必填欄位');
      return;
    }

    try {
      // 解析方案 ID（可能是 scheme_id_payment_id 格式）
      let schemeId: string | undefined;
      let paymentMethodId: string | undefined;

      if (formData.schemeId) {
        // 從 schemes 中找到對應的方案
        const selectedScheme = schemes.find(s => s.id === formData.schemeId);
        if (selectedScheme) {
          schemeId = selectedScheme.schemeId || undefined;
          paymentMethodId = selectedScheme.paymentMethodId || undefined;
        } else if (formData.schemeId.includes('_')) {
          // 如果找不到，嘗試解析格式
          const [scheme, payment] = formData.schemeId.split('_');
          schemeId = scheme;
          paymentMethodId = payment;
        } else {
          // 單獨的ID，需要判斷是 scheme 還是 payment
          // 先嘗試當作 scheme，如果後端驗證失敗會返回錯誤
          schemeId = formData.schemeId;
        }
      }

      await api.post('/transactions', {
        ...formData,
        schemeId,
        paymentMethodId,
      });
      alert('交易已新增');
      loadTransactions();
      // 重置表單
      setFormData({
        transactionDate: format(new Date(), 'yyyy-MM-dd'),
        reason: '',
        amount: '',
        typeId: '',
        note: '',
        schemeId: '',
      });
    } catch (error: any) {
      console.error('新增交易錯誤:', error);
      alert(error.response?.data?.error || '新增交易失敗');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這筆交易嗎？')) return;

    try {
      await api.delete(`/transactions/${id}`);
      alert('交易已刪除');
      loadTransactions();
    } catch (error) {
      console.error('刪除交易錯誤:', error);
      alert('刪除交易失敗');
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/transactions/export', {
        responseType: 'blob',
      });

      // 創建下載連結
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `交易明細_${format(new Date(), 'yyyyMMdd')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('導出錯誤:', error);
      alert('導出失敗');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
        記帳功能
      </h2>

      {/* 新增交易 */}
      <div className="card bg-gradient-to-br from-white to-green-50">
        <h3 className="text-lg font-semibold mb-4">新增交易</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              日期 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.transactionDate}
              onChange={(e) =>
                setFormData({ ...formData, transactionDate: e.target.value })
              }
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              事由 <span className="text-red-500">*</span>
            </label>
            {reasonString && (
              <div className="mb-2 p-2 bg-blue-50 rounded text-sm whitespace-pre-wrap">{reasonString}</div>
            )}
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              required
              rows={3}
              placeholder="可輸入多行文字，按 Enter 換行"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金額</label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              類型 <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.typeId}
              onChange={(e) => setFormData({ ...formData, typeId: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">請選擇</option>
              {transactionTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">使用方案</label>
            <select
              value={formData.schemeId}
              onChange={(e) => setFormData({ ...formData, schemeId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">不使用</option>
              {schemes.map((scheme) => (
                <option key={scheme.id} value={scheme.id}>
                  {scheme.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
          >
            ✨ 新增交易
          </button>
        </form>
      </div>

      {/* 檢視交易 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">檢視交易</h3>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            導出明細
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  時間戳記
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  日期
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  事由
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  金額
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  類型
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  使用方案
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  備註
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-4 py-3 text-sm">
                    {formatTz(utcToZonedTime(new Date(transaction.created_at), TIMEZONE), 'yyyy/MM/dd HH:mm:ss', { timeZone: TIMEZONE })}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {transaction.transaction_date 
                      ? formatTz(utcToZonedTime(new Date(transaction.transaction_date), TIMEZONE), 'yyyy/MM/dd', { timeZone: TIMEZONE })
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-pre-wrap">{transaction.reason}</td>
                  <td className="px-4 py-3 text-sm">
                    {transaction.amount ? transaction.amount.toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">{transaction.type_name}</td>
                  <td className="px-4 py-3 text-sm">{transaction.scheme_name || '-'}</td>
                  <td className="px-4 py-3 text-sm whitespace-pre-wrap">{transaction.note || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => handleDelete(transaction.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

