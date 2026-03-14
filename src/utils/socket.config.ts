// socket/socket.server.js
const { Server } = require("socket.io");

let io;

export const createSocketServer = (httpServer) => {
    io = new Server(httpServer, {
        cors: { origin: "*" },
        path: "/socket",
    });

    console.log("✅ Socket server created");

    return io;
};

export const getIO = () => {
    if (!io) throw new Error("Socket server not initialized");
    return io;
};
