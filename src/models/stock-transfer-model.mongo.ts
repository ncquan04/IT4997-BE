import { Document, Model, model, Schema } from "mongoose";
import { Contacts } from "../shared/contacts";
import { branchTableName } from "./branch-model.mongo";
import { productTableName } from "./product-model.mongo";
import { userTableName } from "./user-model.mongo";
import { orderTableName } from "./order-model.mongo";
import { IStockTransfer, IStockTransferItem } from "../shared/models/stock-transfer-model";

export const stockTransferTableName = "StockTransfer";

const ObjectId = Schema.Types.ObjectId;
const STATUS_TRANSFER = Contacts.Status.Transfer;

const stockTransferItemSchema = new Schema<IStockTransferItem>(
    {
        productId: {
            type: ObjectId as any,
            ref: productTableName,
            required: true,
        },
        variantId: {
            type: ObjectId as any,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        imeiList: {
            type: [String],
            default: [],
        },
    },
    { _id: false }
);

export interface StockTransferModelDocument extends IStockTransfer, Document {
    _id: any;
}

export interface IStockTransferModel extends Model<StockTransferModelDocument> {}

const stockTransferSchema = new Schema<StockTransferModelDocument>(
    {
        fromBranchId: {
            type: ObjectId as any,
            ref: branchTableName,
            required: true,
        },
        toBranchId: {
            type: ObjectId as any,
            ref: branchTableName,
            required: true,
        },
        items: {
            type: [stockTransferItemSchema],
            required: true,
            default: [],
        },
        status: {
            type: Number,
            enum: Object.values(STATUS_TRANSFER),
            default: STATUS_TRANSFER.PENDING,
        },
        createdBy: {
            type: ObjectId as any,
            ref: userTableName,
            required: false,
            default: null,
        },
        approvedBy: {
            type: ObjectId as any,
            ref: userTableName,
            required: false,
        },
        note: {
            type: String,
            default: "",
        },
        // orderId allows linking an auto-generated internal stock transfer to an order
        orderId: {
            type: ObjectId as any,
            ref: orderTableName,
            required: false,
            default: null,
        },
    },
    { versionKey: false, timestamps: true }
);

stockTransferSchema.index({ fromBranchId: 1, createdAt: -1 });
stockTransferSchema.index({ toBranchId: 1, createdAt: -1 });
stockTransferSchema.index({ status: 1, createdAt: -1 });
stockTransferSchema.index({ orderId: 1 }, { sparse: true });

const StockTransferModel = model<StockTransferModelDocument, IStockTransferModel>(
    stockTransferTableName,
    stockTransferSchema
);

export default StockTransferModel;
