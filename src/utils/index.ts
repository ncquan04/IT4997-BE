import crypto from "crypto";

export const parsePositiveInt = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
};

export const getIPFromRequest = (req: any) => {
    const forwarded: any = req.headers["x-forwarded-for"];
    const ip = forwarded ? forwarded.split(/, /)[0] : req.socket?.remoteAddress;
    return ip;
};

const SECRET = "your-very-strong-secret-key";

// Key 32 bytes cho AES-256
const AES_KEY = crypto.createHash("sha256").update(SECRET).digest();
const IV_LENGTH = 16;

function toBase64Url(b64: string) {
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function fromBase64Url(url: string) {
    let b64 = url.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    return b64;
}

export function encryptObject(obj: Record<string, any>): string {
    const text = JSON.stringify(obj);

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", AES_KEY, iv);

    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");

    const ivB64 = iv.toString("base64");

    return toBase64Url(ivB64 + ":" + encrypted);
}

export function decryptObject(encoded: string): any {
    const decoded = fromBase64Url(encoded);

    const [ivBase64, encryptedText] = decoded.split(":");
    const iv = Buffer.from(ivBase64, "base64");

    const decipher = crypto.createDecipheriv("aes-256-cbc", AES_KEY, iv);

    let decrypted = decipher.update(encryptedText, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
}

export const isProd = () => {
    return process.env.PROD === "true";
};
