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
  schemeId?: string;
  paymentMethodId?: string;
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
    try {
      const res = await api.get('/transactions');
      setTransactions(res.data.data);
    } catch (error) {
      console.error('載入交易記錄錯誤:', error);
      alert('載入交易記錄失敗');
    }
  };

  const loadTransactionTypes = async () => {
    try {
      const res = await api.get('/settings/transaction-types');
      setTransactionTypes(res.data.data);
    } catch (error) {
      console.error('載入交易類型錯誤:', error);
      alert('載入交易類型失敗');
    }
  };

  const loadSchemes = async () => {
    try {
      const res = await api.get('/settings/calculation-schemes');
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
    try {
      const res = await api.get('/settings/reason-strings');
      if (res.data.data.length > 0) {
        setReasonString(res.data.data[0].content);
      }
    } catch (error) {
      console.error('載入原因字串錯誤:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.transactionDate || !formData.reason || !formData.typeId) {
      alert('請填寫必填欄位');
      return;
    }

    try {
      const selectedScheme = schemes.find(s => s.id === formData.schemeId);
      let submitSchemeId: string | undefined;
      let submitPaymentMethodId: string | undefined;

      if (selectedScheme) {
        submitSchemeId = selectedScheme.schemeId || undefined;
        submitPaymentMethodId = selectedScheme.paymentMethodId || undefined;
      } else if (formData.schemeId && formData.schemeId.includes('_')) {
        const [scheme, payment] = formData.schemeId.split('_');
        submitSchemeId = scheme;
        submitPaymentMethodId = payment;
      } else if (formData.schemeId) {
        submitSchemeId = formData.schemeId; 
      }

      await api.post('/transactions', {
        ...formData,
        schemeId: submitSchemeId,
        paymentMethodId: submitPaymentMethodId,
      });
      alert('交易已新增');
      loadTransactions();
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
            <input
              type="text"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              required
              placeholder="輸入事由"
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
            <input
              type="text"
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="請輸入備註"
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

        {/* [修正項目 5] 表格容器加入 overflow-x-auto */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  時間
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  日期
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  事由
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  金額
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  類型
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  使用方案
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  備註
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {formatTz(utcToZonedTime(new Date(transaction.created_at), TIMEZONE), 'yyyy/MM/dd HH:mm', { timeZone: TIMEZONE })}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {transaction.transaction_date 
                      ? formatTz(utcToZonedTime(new Date(transaction.transaction_date), TIMEZONE), 'yyyy/MM/dd', { timeZone: TIMEZONE })
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm min-w-[150px]">{transaction.reason}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {transaction.amount ? transaction.amount.toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{transaction.type_name}</td>
                  <td className="px-4 py-3 text-sm min-w-[120px]">{transaction.scheme_name || '-'}</td>
                  <td className="px-4 py-3 text-sm min-w-[100px] whitespace-pre-wrap">{transaction.note || '-'}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
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