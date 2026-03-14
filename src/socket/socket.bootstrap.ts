import { registerGateway } from "./socket.gateway";

export const registerSocketListeners = (io) => {
    //admin
    io.of("/admin").on("connection", (socket) => {
        console.log("🔌 Connected:", socket.id);

        registerGateway(socket);

        socket.on("disconnect", () => {
            console.log("❌ Disconnected:", socket.id);
        });
    });
};
