import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        // 在 Docker 容器中使用服務名稱 backend，在本地開發時使用 localhost
        // 優先檢查環境變數，如果沒有則根據主機名判斷
        target: process.env.DOCKER_ENV === 'true' 
          ? 'http://backend:3001'
          : (process.env.VITE_API_URL?.includes('backend')
            ? 'http://backend:3001'
            : 'http://localhost:3001'),
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
});

