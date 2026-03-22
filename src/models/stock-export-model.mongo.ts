import { Document, Model, model, Schema } from "mongoose";
import {
    IStockExport,
    IStockExportItem,
} from "../shared/models/stock-export-model";
import { Contacts } from "../shared/contacts";
import { branchTableName } from "./branch-model.mongo";
import { productTableName } from "./product-model.mongo";
import { userTableName } from "./user-model.mongo";
import { orderTableName } from "./order-model.mongo";

export const stockExportTableName = "StockExport";

const ObjectId = Schema.Types.ObjectId;
const STATUS_STOCK = Contacts.Status.Stock;

const stockExportItemSchema = new Schema<IStockExportItem>(
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

export interface StockExportModelDocument extends IStockExport, Document {
    _id: any;
}

export interface IStockExportModel extends Model<StockExportModelDocument> {}

const stockExportSchema = new Schema<StockExportModelDocument>(
    {
        branchId: {
            type: ObjectId as any,
            ref: branchTableName,
            required: true,
        },
        items: {
            type: [stockExportItemSchema],
            required: true,
            default: [],
        },
        reason: {
            type: String,
            enum: Object.values(Contacts.ExportReason),
            required: true,
        },
        // orderId is only set when reason = SALE and the export is triggered by an online order
        orderId: {
            type: ObjectId as any,
            ref: orderTableName,
            required: false,
            default: null,
        },
        createdBy: {
            type: ObjectId as any,
            ref: userTableName,
            required: true,
        },
        note: {
            type: String,
            default: "",
        },
        status: {
            type: Number,
            enum: Object.values(STATUS_STOCK),
            default: STATUS_STOCK.PENDING,
        },
    },
    { versionKey: false, timestamps: true }
);

stockExportSchema.index({ branchId: 1, createdAt: -1 });
stockExportSchema.index({ status: 1, createdAt: -1 });
stockExportSchema.index({ orderId: 1 }, { sparse: true });

const StockExportModel = model<StockExportModelDocument, IStockExportModel>(
    stockExportTableName,
    stockExportSchema
);

export default StockExportModel;
