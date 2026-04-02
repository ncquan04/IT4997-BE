import { Document, Model, model, Schema } from "mongoose";
import {
    IPointTransaction,
    PointTransactionType,
} from "../shared/models/point-transaction-model";
import { userTableName } from "./user-model.mongo";
import { orderTableName } from "./order-model.mongo";

export const pointTransactionTableName = "PointTransaction";

export interface PointTransactionDocument extends IPointTransaction, Document {
    _id: any;
}

export interface IPointTransactionModel extends Model<PointTransactionDocument> {}

const pointTransactionSchema = new Schema<PointTransactionDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId as any,
            required: true,
            ref: userTableName,
        },
        type: {
            type: String,
            enum: Object.values(PointTransactionType),
            required: true,
        },
        points: { type: Number, required: true },
        orderId: {
            type: Schema.Types.ObjectId as any,
            ref: orderTableName,
            default: null,
        },
        /** Unix timestamp (ms) — chỉ có ở EARN, null ở REDEEM/EXPIRE */
        expiresAt: { type: Number, default: null },
        /** Đánh dấu EARN batch đã bị EXPIRE chưa */
        expired: { type: Boolean, default: false },
        note: { type: String, default: "" },
    },
    { versionKey: false, timestamps: true }
);

// Index phục vụ query "điểm còn hạn của user"
pointTransactionSchema.index({ userId: 1, type: 1, expiresAt: 1 });

const PointTransactionModel = model<
    PointTransactionDocument,
    IPointTransactionModel
>(pointTransactionTableName, pointTransactionSchema);

export default PointTransactionModel;
