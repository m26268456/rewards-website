import axios from 'axios';

// 在開發環境中使用代理，生產環境使用完整 URL
const getBaseURL = () => {
  // 在瀏覽器中運行時
  if (typeof window !== 'undefined') {
    // 檢查是否在 Capacitor 環境中（手機應用程式）
    const isCapacitor = (window as any).Capacitor?.isNativePlatform();
    
    // 如果設定了 VITE_API_URL，使用它（生產環境）
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) {
      // 如果已經包含 /api，直接使用
      if (envUrl.includes('/api')) {
        return envUrl;
      }
      // 否則添加 /api
      return `${envUrl}/api`;
    }
    
    // 在 Capacitor 環境中，必須使用完整 URL
    if (isCapacitor) {
      // 使用生產環境的後端 URL
      return 'https://backend-production-abe5.up.railway.app/api';
    }
    
    // 開發環境使用相對路徑（會通過 Vite 代理）
    return '/api';
  }
  
  // 服務端渲染時使用環境變數
  if (!import.meta.env.VITE_API_URL) {
    return '/api';
  }
  
  const envUrl = import.meta.env.VITE_API_URL;
  // 如果已經包含 /api，直接使用
  if (envUrl.includes('/api')) {
    return envUrl;
  }
  // 否則添加 /api
  return `${envUrl}/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;

