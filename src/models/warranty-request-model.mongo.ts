import { Document, Model, model, Schema } from "mongoose";
import { IWarrantyRequest } from "../shared/models/warranty-request-model";
import { Contacts } from "../shared/contacts";
import { branchTableName } from "./branch-model.mongo";
import { userTableName } from "./user-model.mongo";
import { productTableName } from "./product-model.mongo";
import { orderTableName } from "./order-model.mongo";

export const warrantyRequestTableName = "WarrantyRequest";
const ObjectId = Schema.Types.ObjectId;
const STATUS_WARRANTY = Contacts.Status.Warranty;

export interface WarrantyRequestDocument extends IWarrantyRequest, Document {
    _id: any;
}
export interface IWarrantyRequestModel extends Model<WarrantyRequestDocument> {}

const warrantyRequestSchema = new Schema<WarrantyRequestDocument>(
    {
        customerId: {
            type: ObjectId as any,
            ref: userTableName,
            required: true,
        },
        orderId: {
            type: ObjectId as any,
            ref: orderTableName,
            required: false,
        },
        productId: {
            type: ObjectId as any,
            ref: productTableName,
            required: true,
        },
        variantId: { type: ObjectId as any, required: true },
        branchId: {
            type: ObjectId as any,
            ref: branchTableName,
            required: true,
        },
        imeiOrSerial: { type: String, required: true, trim: true },
        issueDescription: { type: String, required: true, trim: true },
        physicalCondition: { type: String, required: true, trim: true },
        images: { type: [String], default: [] },
        status: {
            type: Number,
            enum: Object.values(STATUS_WARRANTY),
            default: STATUS_WARRANTY.RECEIVED,
        },
        receivedBy: {
            type: ObjectId as any,
            ref: userTableName,
            required: true,
        },
        estimatedDate: { type: Number },
        completedDate: { type: Number },
    },
    { versionKey: false, timestamps: true }
);

warrantyRequestSchema.index({ branchId: 1, createdAt: -1 });
warrantyRequestSchema.index({ customerId: 1, createdAt: -1 });
warrantyRequestSchema.index({ imeiOrSerial: 1 });
warrantyRequestSchema.index({ status: 1 });

const WarrantyRequestModel = model<
    WarrantyRequestDocument,
    IWarrantyRequestModel
>(warrantyRequestTableName, warrantyRequestSchema);

export default WarrantyRequestModel;
