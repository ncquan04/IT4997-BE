import { Response } from "express";
import UserModel from "../models/user-model.mongo";
import bcrypt from "bcrypt";
import { jwtDecodeToken, jwtSignToken } from "../utils/jwt-token";
import { isProd } from "../utils";
import { addToBlacklist } from "../cache/redisUtils";

const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type UserPayload = {
    id: string;
    role: string;
    email: string;
    branchId?: string;
};

const setAuthCookies = (res: Response, payload: UserPayload): UserPayload => {
    const cookieOptions = {
        httpOnly: true,
        secure: isProd(),
        sameSite: (isProd() ? "none" : "lax") as "none" | "lax",
        domain: process.env.COOKIE_DOMAIN || undefined,
        path: "/",
    };
    res.cookie("access_token", jwtSignToken(payload, "24h"), { ...cookieOptions, maxAge: ACCESS_TOKEN_TTL_MS });
    res.cookie("refresh_token", jwtSignToken(payload, "30d"), { ...cookieOptions, maxAge: REFRESH_TOKEN_TTL_MS });
    return payload;
};

export const register = async (req: any, res: any) => {
    try {
        const body = req.body;
        const { username, password, email, phoneNumber, dateOfBirth, address } =
            body;

        // Check if user already exists (pseudo code)
        const userExists = await UserModel.findOne({ email });
        if (userExists) {
            return res.status(403).json({
                message: "User already exists",
            });
        }
        // hash password (pseudo code)
        const hashedPassword = await bcrypt.hash(password, 10);
        // Create new user (pseudo code)
        await UserModel.create({
            userName: username,
            password: hashedPassword,
            email: email,
            phoneNumber: phoneNumber,
            dateOfBirth: dateOfBirth,
            address: address || [],
        });
        return res.status(201).json({
            message: "User registered successfully",
        });
    } catch (error) {
        console.error("Error in signUp:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const login = async (req: any, res: any) => {
    try {
        const { email, password } = req.body;

        const user = await UserModel.findOne({ email });

        if (!user || !user.password) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const payload: UserPayload = {
            id: String(user._id),
            role: user.role,
            email: user.email,
            branchId: user.branchId ? String(user.branchId) : undefined,
        };
        const userSam = setAuthCookies(res, payload);
        return res.status(200).json({ message: "Login successful", user: userSam });
    } catch (error) {
        console.error("Error in signIn:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const googleCallback = async (req: any, res: Response) => {
    try {
        const user = req.user as UserPayload | undefined;
        if (!user) {
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_auth_failed`);
        }
        setAuthCookies(res, user);
        return res.redirect(`${process.env.FRONTEND_URL}/auth/google/callback`);
    } catch (error) {
        console.error("Error in googleCallback:", error);
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
    }
};

export const getMe = async (req: any, res: any) => {
    return res.status(200).json({ user: req.user });
};

export const logout = async (req: any, res: any) => {
    const accessToken = req.cookies["access_token"];
    const refreshToken = req.cookies["refresh_token"];

    const cookieOptions = {
        httpOnly: true,
        secure: isProd(),
        sameSite: (isProd() ? "none" : "lax") as "none" | "lax",
        domain: process.env.COOKIE_DOMAIN || undefined,
        path: "/",
    };

    const now = Math.floor(Date.now() / 1000);

    for (const token of [accessToken, refreshToken]) {
        if (!token) continue;
        const decoded = jwtDecodeToken(token) as any;
        if (decoded?.jti && decoded?.exp) {
            const remaining = decoded.exp - now;
            if (remaining > 0) {
                await addToBlacklist(decoded.jti, remaining);
            }
        }
    }

    res.clearCookie("access_token", cookieOptions);
    res.clearCookie("refresh_token", cookieOptions);
    return res.status(200).json({ message: "Logged out successfully" });
};

// export const refreshToken = async (req: any, res: any) => {
//     try {
//         const refreshToken = req.cookies.refreshToken;
//         if (!refreshToken) {
//             return res
//                 .status(401)
//                 .json({ message: "No refresh token provided" });
//         }
//         const session = await SessionModel.findOne({
//             refreshToken: refreshToken,
//         });
//         if (!session) {
//             return res.status(401).json({ message: "Invalid refresh token" });
//         }
//         if (session.expireAt < new Date()) {
//             return res.status(401).json({ message: "Refresh token expired" });
//         }
//         const user = await UserModel.findById(session.userId);
//         if (!user) {
//             return res.status(401).json({ message: "User not found" });
//         }
//         const newAccessToken = jwt.sign({ userID: user._id }, TOKEN_SECRET, {
//             expiresIn: ACCESS_TOKEN_TTL,
//         });
//         return res.status(200).json({ accessToken: newAccessToken });
//     } catch (error) {
//         console.error("Error in refreshToken:", error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// };

// export const logout = async (req: any, res: any) => {
//     try {
//         const refreshToken = req.cookies.refreshToken;
//         if (refreshToken) {
//             await SessionModel.deleteOne({ refreshToken: refreshToken });
//             res.clearCookie("refreshToken");
//         }
//         return res.status(200).json({ message: "Logout successful" });
//     } catch (error) {
//         console.error("Error in logout:", error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// };
