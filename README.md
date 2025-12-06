# 回饋查詢/計算與記帳 Web 應用程式

## 專案概述

這是一個功能完整的回饋查詢、計算與記帳系統，主要用於手機 App 和電腦網頁。系統包含五大核心功能模組：

- **A: 回饋查詢** - 方案總覽與通路回饋查詢
- **B: 回饋計算** - 帶入/不帶入方案的回饋計算
- **C: 記帳功能** - 新增、檢視、導出交易明細
- **D: 額度查詢** - 各方案額度狀態追蹤
- **E: 管理設定** - 系統各項設定管理

## 技術棧

- **前端**: React 18 + TypeScript + Vite + TailwindCSS
- **後端**: Node.js + Express + TypeScript
- **資料庫**: PostgreSQL 15
- **容器化**: Docker + Docker Compose

## 專案結構

```
rewards-website/
├── backend/          # 後端 API 服務
├── frontend/         # 前端 React 應用
├── database/         # 資料庫遷移腳本與種子資料
├── docker-compose.yml
└── README.md
```

## 快速開始

### 使用 Docker Compose

```bash
docker-compose up -d
```

### 手動啟動

#### 後端
```bash
cd backend
npm install
npm run dev
```

#### 前端
```bash
cd frontend
npm install
npm run dev
```

### 環境變數

- `DATABASE_URL`：PostgreSQL 連線字串（必填）
- `PORT`：後端服務埠號，預設 `3001`
- `HOST`：服務監聽位址，預設 `0.0.0.0`
- `CORS_ORIGINS`：允許的前端來源，逗號分隔，例如 `https://app.example.com,http://localhost:5173`

## 資料庫設計

詳細的資料庫結構請參考 `database/schema.sql`

## 開發規範

- 使用 TypeScript 確保型別安全
- 遵循 RESTful API 設計原則
- 前後端分離架構
- 資料驗證與錯誤處理
- 響應式設計（支援手機與電腦）


