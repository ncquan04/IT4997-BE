import { model, Schema, Document, Model } from "mongoose";
import { INotification } from "../shared/models/notification-model";
import { userTableName } from "./user-model.mongo";

const notificationTableName = "Notification";

export interface NotificationDocument extends INotification, Document {
    _id: any;
}

export interface INotificationModel extends Model<NotificationDocument> {}

const NotificationSchema = new Schema<NotificationDocument>(
    {
        notificationType: { type: String, required: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        referenceId: { type: String, required: true },
        userId: {
            type: Schema.Types.ObjectId as any,
            ref: userTableName,
            required: true,
        },
        readBy: [
            {
                type: Schema.Types.ObjectId as any,
                ref: userTableName,
                default: [],
            },
        ],
    },
    { timestamps: true, versionKey: false }
);

const NotificationModel =  model<NotificationDocument, INotificationModel>(
    notificationTableName,
    NotificationSchema
);

export default NotificationModel;
