import { Document, Model, Schema, model, Types } from "mongoose";
import { IOrder } from "../shared/models/order-model";
import { IProductItem } from "../shared/models/order-model";
import { productTableName } from "./product-model.mongo";
import { Contacts } from "../shared/contacts";
import { userTableName } from "./user-model.mongo";
import { branchTableName } from "./branch-model.mongo";

const STATUS_ORDER = Contacts.Status.Order;
export const orderTableName = "Order";
export interface OrderDocument extends IOrder, Document {
    _id: any;
}

export interface IOrderModel extends Model<OrderDocument> {}

const productItemSchema = new Schema<IProductItem>(
    {
        productId: {
            type: Schema.Types.ObjectId as any,
            required: true,
            ref: productTableName,
        },
        variantId: {
            type: Schema.Types.ObjectId as any,
            required: true,
        },
        variantName: { type: String, required: false, default: "" },
        image: { type: String, required: false, default: "" },
        title: { type: String, required: true },
        description: { type: String, required: true },
        price: { type: Number, required: true },
        costPrice: { type: Number, required: false, default: 0 },
        quantity: { type: Number, required: true },
        discount: { type: Number, required: false },
        totalMoney: { type: Number, required: true },
    },
    { _id: false }
);

const orderSchema = new Schema<OrderDocument>(
    {
        listProduct: { type: [productItemSchema], required: true },
        userId: {
            type: Schema.Types.ObjectId as any,
            required: true,
            ref: userTableName,
        },
        sumPrice: { type: Number, required: true },
        note: { type: String },
        toAddress: { type: String, required: true },
        //user info
        userName: { type: String },
        numberPhone: { type: String },
        statusOrder: {
            type: Number,
            enum: Object.values(STATUS_ORDER),
            default: STATUS_ORDER.ORDERED,
        },
        branchId: {
            type: Schema.Types.ObjectId,
            ref: branchTableName,
            required: false,
            default: null,
        },
    },
    { timestamps: true, versionKey: false }
);

const OrderModel = model<OrderDocument, IOrderModel>(
    orderTableName,
    orderSchema
);

export default OrderModel;
