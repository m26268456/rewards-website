import axios from 'axios';

// 使用環境變數，若未設定則預設為 localhost (開發方便)，生產環境務必設定 VITE_API_URL
let API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// 確保 API_URL 以 /api 結尾
if (!API_URL.endsWith('/api')) {
  // 如果 URL 以斜線結尾，移除它
  API_URL = API_URL.replace(/\/$/, '');
  // 添加 /api 前綴（如果還沒有）
  if (!API_URL.endsWith('/api')) {
    API_URL = `${API_URL}/api`;
  }
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response 攔截器：統一錯誤處理（目前未啟用認證）
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 開發環境下印出詳細錯誤，生產環境可移除
    if (import.meta.env.DEV) {
      console.error('API Error:', error.response?.data || error.message);
    }

    return Promise.reject(error);
  }
);

export default api;