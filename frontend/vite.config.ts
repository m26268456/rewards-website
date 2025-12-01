import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifestFilename: 'manifest.json',
      manifest: {
        name: '回饋查詢/計算與記帳系統',
        short_name: '回饋系統',
        description: '回饋查詢、計算與記帳系統',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.railway\.app\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false // 開發環境不啟用 PWA
      }
    })
  ],
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

