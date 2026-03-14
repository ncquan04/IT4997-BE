import { getIO } from "../utils/socket.config";

export const registerGateway = (socket) => {
    socket.on("ping", (data, ack) => {
        console.log("hello: ", data);
        ack("ok");
    });

    socket.on("admin:join", (data) => {
        console.log("Admin joining room...");
        getIO()?.of("/admin").emit("admin:join_room", data);
    });
};
