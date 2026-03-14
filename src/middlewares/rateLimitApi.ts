import { getIPFromRequest } from "../utils";

const rateLimit = require("express-rate-limit");

// Simple rate limit function - only need to pass max
export const rateLimitApi = (
    max: number = 3 | 5 | 10 | 15 | 20 | 30 | 60 | 120,
    windowMs: number = 60 * 1000
) => {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            const authHeader = req.headers["authorization"];
            if (!authHeader) {
                return req.ip;
            }
            const token = authHeader.split(" ")[1];
            return token || req.ip;
        },
        handler: (req, res) => {
            const ip = getIPFromRequest(req);
            console.log(
                `User has exceeded the rate limit! Max: ${max}, Window: ${windowMs}ms`,
                ip,
                " url: ",
                req.originalUrl
            );
            res.status(429).json({
                message: `You have exceeded the ${max} requests per ${
                    windowMs / 1000
                } minute(s) limit!`,
            });
        },
        skip: (req) => {
            // Skip rate limiting for whitelisted IPs (if needed)
            const whitelistedIPs =
                process.env.WHITELISTED_IPS?.split(",") || [];
            // console.log("whitelistedIPs", whitelistedIPs, ' req.ip ', req.ip);
            return whitelistedIPs.includes(req.ip);
        },
    });
};

export const rateLimitLoginApi = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // Limit each user to 5 login attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const token = req.cookies["access_token"];
        if (!token) {
            return req.ip;
        }
        return token || req.ip;
    },
    handler: (req, res) => {
        console.log("Login rate limit exceeded for IP:", req.ip);
        res.status(429).json({
            error: "Too many login attempts. Please try again in 15 minutes.",
            // retryAfter: Math.ceil((15 * 60) / 60), // minutes
        });
    },
    skip: (req) => {
        // Skip rate limiting for whitelisted IPs (if needed)
        const whitelistedIPs = process.env.WHITELISTED_IPS?.split(",") || [];
        return whitelistedIPs.includes(req.ip);
    },
});
