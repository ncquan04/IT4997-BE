import { IPayment } from "../shared/models/payment-model";
import PaymentModel from "../models/payment-model.mongo";
import { Contacts } from "../shared/contacts";
import { encryptObject } from "../utils";
import { IOrder } from "../shared/models/order-model";
import { stripeService } from "./stripe.services";
import { momoService } from "./momo.service";
import { orderServices } from "./order.service";
import mongoose from "mongoose";
import { notificationService } from "./notification.service";

const PAYMENT_METHOD = Contacts.PaymentMethod;
const STATUS_PAYMENT_TRANSCRIPT = Contacts.Status.Payment_transcript;
const STATUS_ORDER = Contacts.Status.Order;
const STATUS_PAYMENT = Contacts.Status.Payment;
const STATUS_PAYMENT_CHECKUPDATE = Contacts.Status.Payment_check_update;

export interface ISignatureTranscript {
    orderId: string;
    orderType: (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];
    status: (typeof STATUS_PAYMENT_TRANSCRIPT)[keyof typeof STATUS_PAYMENT_TRANSCRIPT];
}

class PaymentService {
    async paymentTransctip(
        method: (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD],
        order: IOrder
    ) {
        const { _id: orderId, listProduct, sumPrice } = order;
        let urlRedirect = "";
        switch (method) {
            case PAYMENT_METHOD.STRIPE:
                const urlCancel =
                    process.env.WEB_URL +
                    "/checkout/" +
                    encryptObject({
                        orderId: orderId,
                        orderType: PAYMENT_METHOD.STRIPE,
                        status: STATUS_PAYMENT_TRANSCRIPT.CANCEL,
                    } as ISignatureTranscript);
                const urlSuccess =
                    process.env.WEB_URL +
                    "/checkout/" +
                    encryptObject({
                        orderId: orderId,
                        orderType: PAYMENT_METHOD.STRIPE,
                        status: STATUS_PAYMENT_TRANSCRIPT.SUCCESS,
                    } as ISignatureTranscript);

                const lineItem = listProduct.map((e) => {
                    return {
                        price_data: {
                            currency: "vnd",
                            product_data: {
                                name: e.title,
                                description: e.description,
                            },
                            unit_amount: e.price - e.discount,
                        },
                        quantity: e.quantity,
                    };
                });
                const stripeMethod = await stripeService.createCheckoutSession(
                    lineItem,
                    urlSuccess,
                    urlCancel
                );
                urlRedirect = stripeMethod.url;
                break;
            case PAYMENT_METHOD.MOMO:
                momoService.setConfig({
                    redirectUrl:
                        process.env.WEB_URL +
                        "/checkout/" +
                        encryptObject({
                            orderId: orderId,
                            orderType: PAYMENT_METHOD.MOMO,
                            status: STATUS_PAYMENT_TRANSCRIPT.CHECK_UPDATE,
                        } as ISignatureTranscript),
                });
                const momoMethod = await momoService.createPayment({
                    amount: (sumPrice * 1000) as number,
                    orderId: orderId + Date.now(),
                    orderInfo: "Payment transcript Momo",
                });
                console.log(momoMethod);
                urlRedirect = momoMethod.payUrl;
                break;
            case PAYMENT_METHOD.COD:
                urlRedirect =
                    process.env.WEB_URL +
                    "/checkout/" +
                    encryptObject({
                        orderId: orderId,
                        orderType: PAYMENT_METHOD.COD,
                        status: STATUS_PAYMENT_TRANSCRIPT.CHECK_UPDATE,
                    } as ISignatureTranscript);
                break;
            default:
                break;
        }
        return urlRedirect;
    }
    async CreatePayment({
        _id,
        userId,
        orderId,
        method,
        totalMoney,
        discount,
        delivery,
        status,
    }: IPayment) {
        const paymentRes = await PaymentModel.findOne({
            orderId,
        });

        if (paymentRes) {
            paymentRes.method = method;
            paymentRes.totalMoney = totalMoney;
            paymentRes.discount = discount;
            paymentRes.delivery = delivery;
            paymentRes.status = status;
            return await paymentRes.save();
        }

        return await PaymentModel.create({
            userId,
            orderId,
            method,
            totalMoney,
            discount,
            delivery,
            status,
        });
    }
    async updatePaymentRes(params: Partial<IPayment>, orderId: string) {
        await PaymentModel.findOneAndUpdate(
            { orderId: new mongoose.Types.ObjectId(orderId) },
            {
                ...params,
            }
        );
    }
    async paymentCheckUpdate(
        { orderId, orderType, status }: ISignatureTranscript,
        userId: string
    ) {
        switch (orderType) {
            case PAYMENT_METHOD.STRIPE:
                if (status === STATUS_PAYMENT_TRANSCRIPT.SUCCESS) {
                    const paymentUpdated = await PaymentModel.findOneAndUpdate(
                        {
                            orderId: new mongoose.Types.ObjectId(orderId),
                            status: STATUS_PAYMENT.UNPAID,
                        },
                        {
                            $set: {
                                status: STATUS_PAYMENT.PAID,
                            },
                        },
                        { new: true }
                    );

                    if (paymentUpdated) {
                        await orderServices.updateOrder(
                            { statusOrder: STATUS_ORDER.SHIPPING },
                            orderId
                        );
                        notificationService.pushNotification(
                            "PAYMENT",
                            "Payment paid",
                            `PaymentId #${paymentUpdated._id.toString()} created successfully`,
                            orderId.toString(),
                            userId
                        );
                        notificationService.pushNotification(
                            "ORDER",
                            "Order created",
                            `OrderId #${orderId.toString()} created successfully`,
                            orderId.toString(),
                            userId
                        );
                    }

                    return STATUS_PAYMENT_CHECKUPDATE.SUCCESS;
                } else {
                    const paymentUpdated = await PaymentModel.findOneAndUpdate(
                        {
                            orderId: new mongoose.Types.ObjectId(orderId),
                            status: STATUS_PAYMENT.UNPAID,
                        },
                        {
                            $set: {
                                status: STATUS_PAYMENT.FAILED,
                            },
                        },
                        { new: true }
                    );
                    return STATUS_PAYMENT_CHECKUPDATE.CANCEL;
                }
            case PAYMENT_METHOD.MOMO:
                break;
            case PAYMENT_METHOD.COD:
                await orderServices.updateOrder(
                    { statusOrder: STATUS_ORDER.PROCESSING },
                    orderId
                );
                notificationService.pushNotification(
                    "ORDER",
                    "Order created",
                    `OrderId #${orderId.toString()} created successfully`,
                    orderId.toString(),
                    userId
                );
                return STATUS_PAYMENT_CHECKUPDATE.PROCESS;
            default:
                return STATUS_PAYMENT_CHECKUPDATE.CANCEL;
        }
    }
    async updatePayment(params: Partial<IPayment>, paymentId: string) {
        await PaymentModel.findByIdAndUpdate(
            new mongoose.Types.ObjectId(paymentId),
            {
                ...params,
            }
        );
    }
}
export const paymentService = new PaymentService();
