import { useState } from 'react';
import api from '../utils/api';

export default function SeedDataButton() {
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!confirm('確定要匯入測試資料嗎？這將添加示例卡片、方案、通路等資料。')) {
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/seed/import');
      if (res.data.success) {
        alert('測試資料匯入成功！請重新整理頁面查看。');
        window.location.reload();
      }
    } catch (error: any) {
      console.error('匯入錯誤:', error);
      alert(error.response?.data?.error || '匯入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleImport}
      disabled={loading}
      className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-full shadow-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 z-50 flex items-center gap-2 font-semibold"
    >
      {loading ? (
        <>
          <span className="animate-spin">⏳</span>
          匯入中...
        </>
      ) : (
        <>
          <span>📥</span>
          匯入測試資料
        </>
      )}
    </button>
  );
}


