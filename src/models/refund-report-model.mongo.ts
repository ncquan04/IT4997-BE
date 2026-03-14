import mongoose, { Document, Model, Schema, model } from "mongoose";
import { IRefundReport } from "../shared/models/refund-report-model";
import { Contacts } from "../shared/contacts";
import { userTableName } from "./user-model.mongo";
import { orderTableName } from "./order-model.mongo";

export const refundReportTableName = "refundReport";

export interface RefundReportDocument extends IRefundReport, Document {
    _id: any;
}
export interface IRefundReportModel extends Model<RefundReportDocument> {}

const refundReportSchema = new Schema<RefundReportDocument>(
    {
        orderId: { type: String, required: true },
        paymentId: { type: String, required: true },
        customerDetail: {
            name: { type: String, required: true },
            email: { type: String, required: true },
            phone: { type: String, required: true },
        },
        refundBy: {
            type: mongoose.Types.ObjectId as any,
            ref: userTableName,
            required: true,
        },
        reason: { type: String, required: true },
        amount: { type: Number, required: true },
        images: [{ type: String, required: true }],
    },
    { versionKey: false, timestamps: true }
);

const RefundReportModel = model<RefundReportDocument, IRefundReportModel>(
    refundReportTableName,
    refundReportSchema
);

export default RefundReportModel;
