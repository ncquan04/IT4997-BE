#!/bin/bash
# =============================================================
# deploy.sh — Chạy trên VPS để deploy nguyenchiquan.id.vn
# Cách dùng (từ thư mục IT4997-BE):  bash deploy.sh
# =============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DOMAIN="nguyenchiquan.id.vn"
BE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}   DEPLOY: $DOMAIN${NC}"
echo -e "${BLUE}=================================================${NC}"

# ─── Bước 1: Kiểm tra .env.prod ──────────────────────────────
echo -e "\n${YELLOW}[1/6] Kiểm tra .env.prod...${NC}"
if [ ! -f "$BE_DIR/.env.prod" ]; then
    echo -e "${RED}✗ Không tìm thấy .env.prod${NC}"
    echo "  Tạo file từ .env.example rồi điền đầy đủ trước khi chạy lại."
    exit 1
fi
if grep -q "FILL_IN" "$BE_DIR/.env.prod"; then
    echo -e "${RED}✗ Vẫn còn giá trị 'FILL_IN' trong .env.prod${NC}"
    grep "FILL_IN" "$BE_DIR/.env.prod"
    exit 1
fi
echo -e "${GREEN}✓ .env.prod OK${NC}"

# ─── Bước 2: Cài Docker (nếu chưa có) ────────────────────────
echo -e "\n${YELLOW}[2/6] Kiểm tra Docker...${NC}"
if ! command -v docker &>/dev/null; then
    echo "  Đang cài đặt Docker..."
    curl -fsSL https://get.docker.com | sh
    apt-get install -y docker-compose-plugin
    echo -e "${GREEN}✓ Docker đã cài xong${NC}"
else
    echo -e "${GREEN}✓ Docker $(docker --version | awk '{print $3}' | tr -d ',') sẵn sàng${NC}"
fi

# ─── Bước 3: Kiểm tra DNS ─────────────────────────────────────
echo -e "\n${YELLOW}[3/6] Kiểm tra DNS...${NC}"
SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "unknown")
DOMAIN_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || echo "")
if [ -z "$DOMAIN_IP" ]; then
    echo -e "${RED}✗ Không phân giải được $DOMAIN${NC}"
    echo "  Kiểm tra lại DNS A record trỏ về $SERVER_IP"
    exit 1
fi
if [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
    echo -e "${YELLOW}⚠ DNS chưa khớp: $DOMAIN → $DOMAIN_IP  (VPS: $SERVER_IP)${NC}"
    echo -n "  Tiếp tục? (y/N): "
    read -r answer
    [[ "$answer" =~ ^[Yy]$ ]] || exit 1
else
    echo -e "${GREEN}✓ DNS OK: $DOMAIN → $DOMAIN_IP${NC}"
fi

# ─── Bước 4: Cấp SSL (chỉ lần đầu) ──────────────────────────
echo -e "\n${YELLOW}[4/6] Kiểm tra SSL certificate...${NC}"
cd "$BE_DIR"
if [ ! -d "./certbot/conf/live/$DOMAIN" ]; then
    echo "  Chưa có SSL. Đang cấp qua Let's Encrypt..."
    bash init-ssl.sh
else
    echo -e "${GREEN}✓ SSL certificate đã tồn tại${NC}"
fi

# ─── Bước 5: Build & Start containers ────────────────────────
echo -e "\n${YELLOW}[5/6] Build và khởi động containers...${NC}"
echo "  (Lần đầu build mất ~5–10 phút)"
docker compose -f docker-compose.prod.yml up -d --build
echo -e "${GREEN}✓ Containers đã khởi động${NC}"

# ─── Bước 6: Khởi tạo MongoDB Replica Set ────────────────────
echo -e "\n${YELLOW}[6/6] Khởi tạo MongoDB Replica Set...${NC}"
echo "  Chờ MongoDB sẵn sàng (15 giây)..."
sleep 15

INIT_RESULT=$(docker exec mongodb mongosh --quiet --eval '
try {
    var status = rs.status();
    if (status.ok) { print("ALREADY_INITIALIZED"); }
} catch(e) {
    rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongodb:27017" }] });
    print("INITIALIZED_NOW");
}
' 2>/dev/null || echo "ERROR")

if [[ "$INIT_RESULT" == *"ALREADY_INITIALIZED"* ]]; then
    echo -e "${GREEN}✓ Replica Set đã khởi tạo trước đó${NC}"
elif [[ "$INIT_RESULT" == *"INITIALIZED_NOW"* ]]; then
    echo -e "${GREEN}✓ Replica Set khởi tạo thành công${NC}"
else
    echo -e "${YELLOW}⚠ Kiểm tra thủ công: docker exec -it mongodb mongosh --eval 'rs.status()'${NC}"
fi

# ─── Hoàn tất ─────────────────────────────────────────────────
echo ""
echo -e "${BLUE}=================================================${NC}"
echo -e "${GREEN}   DEPLOY HOÀN TAT!${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""
echo -e "  Frontend : ${GREEN}https://$DOMAIN${NC}"
echo -e "  API      : ${GREEN}https://$DOMAIN/api${NC}"
echo ""
echo "  Lệnh hữu ích:"
echo "    docker compose -f docker-compose.prod.yml ps"
echo "    docker logs backend -f"
echo "    docker logs nginx -f"
echo ""
echo -e "${YELLOW}  Seed DB (chỉ lần đầu nếu DB rỗng):${NC}"
echo "    docker exec backend node dist/src/seed/index.js"
