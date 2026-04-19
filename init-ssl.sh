#!/bin/bash
# Script cấp SSL lần đầu tiên (chạy trước khi start production stack)
# Dùng khi domain đã trỏ IP về server

DOMAIN="nguyenchiquan.id.vn"
EMAIL="chiquan02122004@gmail.com"

# 1. Khởi động nginx ở chế độ HTTP-only để Certbot xác thực
#    Tạm thời dùng config đơn giản không cần SSL
docker run --rm -d \
  --name nginx_init \
  -p 80:80 \
  -v "$(pwd)/certbot/www:/var/www/certbot" \
  nginx:alpine \
  sh -c "mkdir -p /var/www/certbot && nginx -g 'daemon off;' &
         while true; do sleep 1; done"

sleep 3

# 2. Cấp SSL bằng Certbot webroot
docker run --rm \
  -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/certbot/www:/var/www/certbot" \
  certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

# 3. Dừng nginx tạm
docker stop nginx_init

echo ""
echo "✅ SSL certificate issued for $DOMAIN"
echo "   Bây giờ chạy: docker compose -f docker-compose.prod.yml up -d --build"
