import { getIO } from "../utils/socket.config";

class SocketService {
    io(namespace) {
        const io = getIO();
        return namespace ? io.of(namespace) : io;
    }

    emit(event, payload, namespace) {
        this.io(namespace).emit(event, payload);
    }

    emitToRoom(event, payload, room, namespace) {
        this.io(namespace).to(room).emit(event, payload);
    }

    emitWithAck(event, payload, namespace, timeout = 3000) {
        return new Promise((resolve, reject) => {
            this.io(namespace)
                .timeout(timeout)
                .emit(event, payload, (err, responses) => {
                    if (err) return reject(err);
                    resolve(responses);
                });
        });
    }

    emitToRoomWithAck(event, payload, room, namespace, timeout = 3000) {
        return new Promise((resolve, reject) => {
            this.io(namespace)
                .to(room)
                .timeout(timeout)
                .emit(event, payload, (err, responses) => {
                    if (err) return reject(err);
                    resolve(responses);
                });
        });
    }
}

export const socket = new SocketService();
