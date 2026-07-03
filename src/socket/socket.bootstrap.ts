import { registerGateway } from "./socket.gateway";
import { jwtDecodeToken } from "../utils/jwt-token";
import UserModel from "../models/user-model.mongo";
import { UserRole } from "../shared/models/user-model";

const parseCookies = (raw?: string): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!raw) return out;
    for (const part of raw.split(";")) {
        const idx = part.indexOf("=");
        if (idx === -1) continue;
        out[part.slice(0, idx).trim()] = decodeURIComponent(
            part.slice(idx + 1).trim()
        );
    }
    return out;
};

export const registerSocketListeners = (io) => {
    //admin
    io.of("/admin").use(async (socket, next) => {
        try {
            const cookies = parseCookies(socket.handshake.headers.cookie);
            const decoded: any = jwtDecodeToken(
                cookies["access_token"] || cookies["refresh_token"] || ""
            );
            if (!decoded?.id) return next(new Error("Unauthorized"));
            const user = await UserModel.findById(decoded.id);
            if (!user || user.role === UserRole.USER) {
                return next(new Error("Forbidden"));
            }
            socket.user = { id: String(user._id), role: user.role };
            next();
        } catch {
            next(new Error("Unauthorized"));
        }
    });

    io.of("/admin").on("connection", (socket) => {
        console.log("🔌 Connected:", socket.id);

        registerGateway(socket);

        socket.on("disconnect", () => {
            console.log("❌ Disconnected:", socket.id);
        });
    });
};
