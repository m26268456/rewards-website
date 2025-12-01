# 生產模式 Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 複製依賴檔案
COPY package*.json ./
RUN npm install

# 複製所有必要檔案
COPY index.html ./
COPY src ./src
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY nginx.conf ./

# 構建前端（環境變數可選，如果沒有會使用默認值）
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL:-http://localhost:3001}

RUN npm run build

# 使用 nginx 提供靜態檔案
FROM nginx:alpine

# 複製構建好的檔案
COPY --from=builder /app/dist /usr/share/nginx/html

# 複製 nginx 配置（從構建階段）
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

