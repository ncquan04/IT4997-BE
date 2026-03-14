import { Document, Model, Schema, model } from "mongoose";
import { IPayment } from "../shared/models/payment-model";
import { Contacts } from "../shared/contacts";
import { userTableName } from "./user-model.mongo";
import { orderTableName } from "./order-model.mongo";

const PAYMENT_METHOD = Contacts.PaymentMethod;
const DELIVERY = Contacts.Delivery;
const STATUS_PAYMENT = Contacts.Status.Payment;

export const paymentTableName = "Payment";
export interface PaymentDocument extends IPayment, Document {
    _id: any;
}

export interface IPaymentModel extends Model<PaymentDocument> {}

const paymentSchema = new Schema<PaymentDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId as any,
            required: true,
            ref: userTableName,
        },
        orderId: {
            type: Schema.Types.ObjectId as any,
            required: true,
            ref: orderTableName,
            unique: true,
        },
        method: {
            type: String,
            enum: Object.values(PAYMENT_METHOD),
            required: true,
        },
        totalMoney: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        delivery: {
            type: String,
            enum: Object.values(DELIVERY),
            required: true,
        },
        status: {
            type: Number,
            enum: Object.values(STATUS_PAYMENT),
            required: true,
            default: STATUS_PAYMENT.UNPAID,
        },
    },
    { timestamps: true, versionKey: false }
);

const PaymentModel = model<PaymentDocument, IPaymentModel>(
    paymentTableName,
    paymentSchema
);

export default PaymentModel;
