#!/bin/bash
# Script cấp SSL lần đầu tiên (chạy trước khi start production stack)
# Dùng khi domain đã trỏ IP về server

DOMAIN="nguyenchiquan.id.vn"
EMAIL="chiquan02122004@gmail.com"

# Dừng mọi container đang chiếm port 80 (nếu có)
docker stop nginx_init 2>/dev/null || true
docker stop nginx 2>/dev/null || true

# Cấp SSL bằng certbot standalone (tự chạy HTTP server trên port 80)
docker run --rm \
  -p 80:80 \
  -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
  certbot/certbot certonly \
    --standalone \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

echo ""
echo "✅ SSL certificate issued for $DOMAIN"
echo "   Bây giờ chạy: docker compose -f docker-compose.prod.yml up -d --build"
