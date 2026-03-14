import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
    // Nếu client đã tồn tại và đang mở (hoặc đang kết nối), trả về luôn
    if (client && (client.isOpen || client.isReady)) {
        return client;
    }

    // Nếu chưa có client, khởi tạo mới
    if (!client) {
        client = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
        });

        client.on("error", (err) => {
            console.error("[Redis Error]:", err);
        });

        client.on("connect", () => {
            console.log("[Redis] Connected");
        });
    }

    try {
        // 3. Kết nối
        // Chỉ gọi connect nếu nó chưa được connect
        if (!client.isOpen) {
             await client.connect();
        }
        return client;
    } catch (error) {
        // 4. Xử lý lỗi "Zombie Client"
        console.error("[Redis Connection Failed]", error);
        // Quan trọng: Reset client về null để lần sau thử kết nối lại
        client = null;
        throw error;
    }
}
