import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
const dotenv = require("dotenv");
const result = dotenv.config();
const TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "your-default-secret";

export const jwtDecodeToken = function (token: string): string | object | null {
    try {
        let decoded = jwt.verify(token, TOKEN_SECRET);
        if (decoded && typeof decoded === "object") {
            return decoded;
        }
    } catch (err) {
        try {
            let decoded = jwt.verify(token, "jwtSecretV1");
            if (decoded && typeof decoded === "object") {
                return decoded;
            }
        } catch (error) {
            return null;
        }
    }
    return null;
};

export const jwtSignToken = (payload: any, expiresIn: number | string) => {
    const accessToken = jwt.sign(
        { ...payload, jti: randomUUID() },
        TOKEN_SECRET,
        { expiresIn: expiresIn as any }
    );
    return accessToken;
};
