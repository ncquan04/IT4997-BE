import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { register, login, googleCallback, getMe } from "../services/auth.service";
import { validate } from "../middlewares/validate";
import { registerSchema, loginSchema } from "../dto/auth.dto";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";
import UserModel from "../models/user-model.mongo";

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            callbackURL: process.env.GOOGLE_CALLBACK_URL!,
        },
        async (_accessToken, _refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) return done(new Error("No email from Google"));

                let user = await UserModel.findOne({
                    $or: [{ googleId: profile.id }, { email }],
                });

                if (user) {
                    if (!user.googleId) {
                        user.googleId = profile.id;
                        await user.save();
                    }
                } else {
                    user = await UserModel.create({
                        googleId: profile.id,
                        email,
                        userName: profile.displayName || email.split("@")[0],
                    });
                }
                return done(null, user);
            } catch (err) {
                return done(err as Error);
            }
        }
    )
);

const AuthRouter = express.Router();

AuthRouter.post("/auth/register", validate(registerSchema), register);
AuthRouter.post("/auth/login", validate(loginSchema), login);
AuthRouter.get("/auth/me", auth, getMe);

AuthRouter.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"], session: false })
);
AuthRouter.get(
    "/auth/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed` }),
    googleCallback
);

// AuthRouter.post("/auth/refresh-token", refreshToken);
// AuthRouter.post("/auth/logout", logout);

AuthRouter.get(
    "/auth/admin-protected",
    auth,
    verifyRole([
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.WAREHOUSE,
        UserRole.SALES,
        UserRole.TECHNICIAN,
    ]),
    async (req, res) => {
        return res.status(200).json(true);
    }
);

export default AuthRouter;
