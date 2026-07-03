// socket/socket.server.js
const { Server } = require("socket.io");
import { isOriginAllowed } from "./index";

let io;

export const createSocketServer = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: (origin, cb) =>
                isOriginAllowed(origin)
                    ? cb(null, true)
                    : cb(new Error("Not allowed by CORS")),
            credentials: true,
        },
        path: "/socket",
    });

    console.log("✅ Socket server created");

    return io;
};

export const getIO = () => {
    if (!io) throw new Error("Socket server not initialized");
    return io;
};
