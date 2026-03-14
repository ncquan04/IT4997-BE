import UserModel from "../models/user-model.mongo";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { jwtSignToken } from "../utils/jwt-token";
import { isProd } from "../utils";
// 14 days in milliseconds

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
    const cookieOptions = {
        httpOnly: true,
        secure: isProd(),
        sameSite: (isProd() ? "none" : "lax") as "none" | "lax",
        domain: process.env.COOKIE_DOMAIN || undefined,
        path: "/",
    };
    try {
        const body = req.body;
        const { email, password } = body;

        // Find user by email (pseudo code)
        const user = await UserModel.findOne({ email });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password",
            });
        }
        // Compare password (pseudo code)
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                message: "Invalid email or password",
            });
        }

        const userSam = {
            id: crypto.randomUUID(),
            role: user.role,
            email: user.email,
        };

        // Generate tokens (pseudo code)
        const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;
        const ACCESS_TOKEN_TTL = 24 * 60 * 60 * 1000;

        const accessToken = jwtSignToken(
            { ...userSam, id: user._id },
            ACCESS_TOKEN_TTL
        );

        const refreshToken = jwtSignToken(
            { ...userSam, id: user._id },
            REFRESH_TOKEN_TTL
        );

        res.cookie("access_token", accessToken, {
            ...cookieOptions,
            maxAge: ACCESS_TOKEN_TTL,
        });
        res.cookie("refresh_token", refreshToken, {
            ...cookieOptions,
            maxAge: REFRESH_TOKEN_TTL,
        });

        return res
            .status(200)
            .json({ message: "Login successful", user: userSam });
    } catch (error) {
        console.error("Error in signIn:", error);
        res.status(500).json({ message: "Internal server error" });
    }
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
