import { Document, Model, model, Schema } from "mongoose";
import {
    IStockImport,
    IStockImportItem,
} from "../shared/models/stock-import-model";
import { Contacts } from "../shared/contacts";
import { branchTableName } from "./branch-model.mongo";
import { supplierTableName } from "./supplier-model.mongo";
import { productTableName } from "./product-model.mongo";

export const stockImportTableName = "StockImport";

const ObjectId = Schema.Types.ObjectId;
const STATUS_STOCK = Contacts.Status.Stock;

const stockImportItemSchema = new Schema<IStockImportItem>(
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
        unitCost: {
            type: Number,
            required: true,
            min: 0,
        },
        imeiList: {
            type: [String],
            default: [],
        },
    },
    { _id: false }
);

export interface StockImportModelDocument extends IStockImport, Document {
    _id: any;
}

export interface IStockImportModel extends Model<StockImportModelDocument> {}

const stockImportSchema = new Schema<StockImportModelDocument>(
    {
        branchId: {
            type: ObjectId as any,
            ref: branchTableName,
            required: true,
        },
        items: {
            type: [stockImportItemSchema],
            required: true,
            default: [],
        },
        supplierId: {
            type: ObjectId as any,
            ref: supplierTableName,
            required: true,
        },
        createdBy: {
            type: ObjectId as any,
            ref: "User",
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
        totalCost: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
    },
    { versionKey: false, timestamps: true }
);

stockImportSchema.index({ branchId: 1, createdAt: -1 });
stockImportSchema.index({ supplierId: 1, createdAt: -1 });
stockImportSchema.index({ status: 1, createdAt: -1 });

const StockImportModel = model<StockImportModelDocument, IStockImportModel>(
    stockImportTableName,
    stockImportSchema
);

export default StockImportModel;
