import express from "express";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";
import { auth } from "../middlewares/auth";
import { notificationService } from "../services/notification.service";

const NotificationRouter = express.Router();

NotificationRouter.get(
    "/notifications",
    auth,
    verifyRole([UserRole.ADMIN]),
    async (req, res) => {
        try {
            const userId = (req as any).user.id;
            const { page } = req.query;
            const listNoti =
                await notificationService.getAllNotificationsForAdmin({
                    adminId: userId,
                    page: Number(page) || 1,
                });
            return res.status(200).json(listNoti);
        } catch (err) {
            console.log("get all notification error: ", err);
            return res.status(500).json("Internal server error");
        }
    }
);
NotificationRouter.get(
    "/notifications/count-unread",
    auth,
    verifyRole([UserRole.ADMIN]),
    async (req, res) => {
        try {
            const userId = (req as any).user.id;
            const count = await notificationService.countUnreadForAdmin(userId);
            return res.status(200).json(count);
        } catch (err) {
            console.log("get all notification error: ", err);
            return res.status(500).json("Internal server error");
        }
    }
);
NotificationRouter.put(
    "/notifications/send",
    auth,
    verifyRole([UserRole.ADMIN]),
    async (req, res) => {
        try {
            const { notificationId } = req.body;
            const userId = (req as any).user.id;

            await notificationService.markAsRead(notificationId, userId);
            return res.status(200).json(true);
        } catch (err) {
            console.log("get all notification error: ", err);
            return res.status(500).json("Internal server error");
        }
    }
);

export default NotificationRouter;
