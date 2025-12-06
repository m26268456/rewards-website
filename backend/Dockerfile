# 生產模式 Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 複製依賴檔案並安裝所有依賴（包括 devDependencies，用於構建）
COPY package*.json ./
RUN npm install

# 複製原始碼
COPY . .

# 構建 TypeScript
RUN npm run build

# 驗證構建結果（如果失敗會顯示詳細資訊）
RUN if [ ! -f dist/index.js ]; then \
      echo "=== ERROR: dist/index.js not found ==="; \
      echo "Current directory contents:"; \
      ls -la; \
      echo "Dist directory contents:"; \
      ls -la dist/ 2>/dev/null || echo "dist directory does not exist"; \
      echo "Source directory contents:"; \
      ls -la src/ 2>/dev/null || echo "src directory not found"; \
      exit 1; \
    fi

# 生產階段
FROM node:20-alpine

WORKDIR /app

# 只複製生產依賴
COPY package*.json ./
RUN npm install --only=production

# 從構建階段複製構建好的檔案
COPY --from=builder /app/dist ./dist

EXPOSE 3001

# 使用生產模式啟動
CMD ["node", "dist/index.js"]

