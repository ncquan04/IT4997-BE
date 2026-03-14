import { getRedisClient } from "./redisClient";

const DEFAULT_TTL = 3600;

export async function setValue(key: string, value: string | number, ttl: number = DEFAULT_TTL) {
    const client = await getRedisClient();
        return client.set(key, value.toString(), { EX: ttl });
}

export async function getValue(key: string) {
    const client = await getRedisClient();
    return client.get(key);
}

/* ============ OBJECT ============ */
export async function setObject<T>(key: string, value: T, ttl: number = DEFAULT_TTL) {
    const client = await getRedisClient();
    const jsonString = JSON.stringify(value);
    
    return client.set(key, jsonString,  { EX: ttl });
}

export async function getObject<T>(key: string): Promise<T | null> {
    const client = await getRedisClient();
    const data = await client.get(key);
    
    if (!data) return null;
    try {
        return JSON.parse(data) as T;
    } catch (e) {
        return null;
    }
}

/* ============ ARRAY ============ */

export async function setArray<T>(key: string, arr: T[], ttl: number = DEFAULT_TTL) {
    const client = await getRedisClient();
    return client.set(key, JSON.stringify(arr),  { EX: ttl });
}

export async function getArray<T>(key: string): Promise<T[] | null> {
    const client = await getRedisClient();
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
}


/* ============ DELETE ============ */
export async function deleteKey(key: string) {
    const client = await getRedisClient();
    return client.del(key);
}

export async function deleteKeysByPattern(pattern: string) {
    const client = await getRedisClient();
    // 1. Tìm tất cả các key khớp với pattern (VD: "products:base_mapped:*")
    const keys = await client.keys(pattern);
    
    // 2. Nếu tìm thấy key thì xóa
    if (keys.length > 0) {
        return client.del(keys);
    }
    return 0;
}
