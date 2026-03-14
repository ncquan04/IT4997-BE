import { sign } from "crypto";
import express from "express";
import { register, login } from "../services/auth.service";
import { validate } from "../middlewares/validate";
import { registerSchema, loginSchema } from "../dto/auth.dto";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";

const AuthRouter = express.Router();

AuthRouter.post("/auth/register", validate(registerSchema), register);
AuthRouter.post("/auth/login", validate(loginSchema), login);
// AuthRouter.post("/auth/refresh-token", refreshToken);
// AuthRouter.post("/auth/logout", logout);

AuthRouter.get(
    "/auth/admin-protected",
    auth,
    verifyRole([UserRole.ADMIN]),
    async (req, res) => {
        return res.status(200).json(true);
    }
);

export default AuthRouter;
