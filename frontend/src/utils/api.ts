import axios from 'axios';

// 使用環境變數，若未設定則預設為 localhost (開發方便)，生產環境務必設定 VITE_API_URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request 攔截器：自動帶入 Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response 攔截器：統一錯誤處理
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 統一處理 401 Unauthorized (例如 Token 過期)
    if (error.response && error.response.status === 401) {
      console.warn('Authentication expired. Redirecting to login...');
      localStorage.removeItem('token');
      // 建議：這裡可以使用 window.location.href 跳轉，或依賴 React Router 的重導機制
      // window.location.href = '/login'; 
    }
    
    // 開發環境下印出詳細錯誤，生產環境可移除
    if (import.meta.env.DEV) {
      console.error('API Error:', error.response?.data || error.message);
    }

    return Promise.reject(error);
  }
);

export default api;