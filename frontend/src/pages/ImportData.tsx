import { useState } from 'react';
import api from '../utils/api';
import { DEFAULT_CARDS, DEFAULT_PAYMENTS, DEFAULT_MERCHANTS } from '../data/importData';

export default function ImportData() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleImport = async () => {
    if (!window.confirm('確定要清除所有現有資料並導入新資料嗎？此操作無法復原！')) {
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // 這裡需要將用戶提供的 JavaScript 資料轉換為 JSON
      // 由於資料量很大，我們將在另一個文件中定義
      const response = await api.post('/import/import', {
        cards: DEFAULT_CARDS,
        payments: DEFAULT_PAYMENTS,
        merchants: DEFAULT_MERCHANTS,
      });

      if (response.data.success) {
        setMessage(`✅ ${response.data.message}\n統計：${JSON.stringify(response.data.stats, null, 2)}`);
      } else {
        setMessage(`❌ 導入失敗：${response.data.error}`);
      }
    } catch (error: any) {
      setMessage(`❌ 導入錯誤：${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">導入資料</h1>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800">
            <strong>⚠️ 警告：</strong>此操作將清除所有現有資料（包括卡片、方案、支付方式、通路、交易記錄等），並導入新資料。此操作無法復原！
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <button
            onClick={handleImport}
            disabled={loading}
            className={`w-full px-4 py-3 rounded-md font-semibold ${
              loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {loading ? '導入中...' : '清除所有資料並導入新資料'}
          </button>

          {message && (
            <div className={`mt-4 p-4 rounded-md ${
              message.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              <pre className="whitespace-pre-wrap">{message}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


