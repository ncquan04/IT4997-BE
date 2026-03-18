import UserModel from "../models/user-model.mongo";
import { isProd } from "../utils";
import { jwtDecodeToken, jwtSignToken } from "../utils/jwt-token";
const dotenv = require("dotenv");

const result = dotenv.config();
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_TTL = 24 * 60 * 60 * 1000;

export const auth = async (req, res, next) => {
    const token = req.cookies["access_token"];
    const refreshToken = req.cookies["refresh_token"];

    const cookieOptions = {
        httpOnly: true,
        secure: isProd(),
        sameSite: (isProd() ? "none" : "lax") as "none" | "lax",
        domain: process.env.COOKIE_DOMAIN || undefined,
        path: "/",
    };

    if (!token && !refreshToken) {
        return res.status(401).json({ error: "Authentication required" });
    }

    let decodedAccess;
    let decodedRefresh;
    try {
        decodedAccess = jwtDecodeToken(token);
    } catch {}
    try {
        decodedRefresh = jwtDecodeToken(refreshToken);
    } catch {}

    if (!decodedAccess && !decodedRefresh) {
        return res.status(401).json({ error: "Invalid token" });
    }

    const ids: string[] = [];
    if (decodedAccess?.id) {
        ids.push(String(decodedAccess.id));
    }
    if (decodedRefresh?.id) {
        ids.push(String(decodedRefresh.id));
    }

    const users = await Promise.all(ids.map((id) => UserModel.findById(id)));

    const map: Record<string, any> = {};
    ids.forEach((id, i) => (map[id] = users[i]));

    const userAccess = decodedAccess ? map[String(decodedAccess.id)] : null;
    const userRefresh = decodedRefresh ? map[String(decodedRefresh.id)] : null;

    if (decodedAccess && userAccess) {
        req.user = {
            id: userAccess._id,
            role: userAccess.role,
            email: userAccess.email,
            branchId: userAccess.branchId
                ? String(userAccess.branchId)
                : undefined,
        };
        return next();
    }

    if (decodedRefresh && userRefresh) {
        const newAccessToken = jwtSignToken(
            {
                id: userRefresh._id,
                role: userRefresh.role,
                email: userRefresh.email,
            },
            ACCESS_TOKEN_TTL
        );

        res.cookie("access_token", newAccessToken, {
            ...cookieOptions,
            maxAge: ACCESS_TOKEN_TTL,
        });

        req.user = {
            id: userRefresh._id,
            role: userRefresh.role,
            email: userRefresh.email,
            branchId: userRefresh.branchId
                ? String(userRefresh.branchId)
                : undefined,
        };

        return next();
    }

    return res.status(401).json({ error: "Invalid token" });
};
