#!/bin/bash
# 匯入測試資料腳本

echo "正在匯入測試資料..."

docker exec -i rewards-db psql -U rewards_user -d rewards_db < /docker-entrypoint-initdb.d/seed.sql

echo "測試資料匯入完成！"


