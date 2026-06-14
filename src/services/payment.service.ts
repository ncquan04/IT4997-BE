import { IPayment } from "../shared/models/payment-model";
import PaymentModel from "../models/payment-model.mongo";
import { Contacts } from "../shared/contacts";
import { encryptObject } from "../utils";
import { IOrder } from "../shared/models/order-model";
import { stripeService } from "./stripe.services";
import { orderServices } from "./order.service";
import mongoose from "mongoose";
import { notificationService } from "./notification.service";
import { awardPoints, redeemPoints } from "./loyalty.service";

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
        order: IOrder,
        totalReduction: number = 0
    ) {
        const { _id: orderId, listProduct } = order;
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
                let stripeDiscounts:
                    | { coupon: string }[]
                    | undefined = undefined;
                if (totalReduction > 0) {
                    const coupon =
                        await stripeService.createAmountOffCoupon(
                            totalReduction
                        );
                    stripeDiscounts = [{ coupon: coupon.id }];
                }

                const stripeMethod = await stripeService.createCheckoutSession(
                    lineItem,
                    urlSuccess,
                    urlCancel,
                    stripeDiscounts
                );
                urlRedirect = stripeMethod.url;
                break;
            case PAYMENT_METHOD.MOMO:
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
        couponCode,
        couponDiscount,
        memberDiscount,
        pointsRedeemed,
        pointsDiscount,
    }: IPayment) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const paymentRes = await PaymentModel.findOne({ orderId }).session(
                session
            );

            if (paymentRes) {
                const oldRedeemed = paymentRes.pointsRedeemed ?? 0;
                const newRedeemed = pointsRedeemed ?? 0;
                const delta = newRedeemed - oldRedeemed;

                if (delta < 0) {
                    throw new Error("POINTS_REDUCE_NOT_SUPPORTED");
                }
                if (delta > 0) {
                    const redeemed = await redeemPoints(
                        userId.toString(),
                        delta,
                        orderId.toString(),
                        session
                    );
                    if (redeemed !== delta) {
                        throw new Error("POINTS_REDEEM_FAILED");
                    }
                }

                paymentRes.method = method;
                paymentRes.totalMoney = totalMoney;
                paymentRes.discount = discount;
                paymentRes.delivery = delivery;
                paymentRes.status = status;
                paymentRes.couponCode = couponCode ?? undefined;
                paymentRes.couponDiscount = couponDiscount ?? 0;
                paymentRes.memberDiscount = memberDiscount ?? 0;
                paymentRes.pointsRedeemed = newRedeemed;
                paymentRes.pointsDiscount = pointsDiscount ?? 0;

                const saved = await paymentRes.save({ session });
                await session.commitTransaction();
                return saved;
            }

            let actualPointsRedeemed = 0;
            if (pointsRedeemed && pointsRedeemed > 0) {
                actualPointsRedeemed = await redeemPoints(
                    userId.toString(),
                    pointsRedeemed,
                    orderId.toString(),
                    session
                );
                if (actualPointsRedeemed !== pointsRedeemed) {
                    throw new Error("POINTS_REDEEM_FAILED");
                }
            }

            const [created] = await PaymentModel.create(
                [
                    {
                        userId,
                        orderId,
                        method,
                        totalMoney,
                        discount,
                        delivery,
                        status,
                        couponCode: couponCode ?? null,
                        couponDiscount: couponDiscount ?? 0,
                        memberDiscount: memberDiscount ?? 0,
                        pointsRedeemed: actualPointsRedeemed,
                        pointsDiscount: pointsDiscount ?? 0,
                        pointsEarned: 0, // sẽ cập nhật khi payment xác nhận PAID
                    },
                ],
                { session }
            );

            await session.commitTransaction();
            return created;
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }
    }
    async updatePaymentRes(params: Partial<IPayment>, orderId: string) {
        await PaymentModel.findOneAndUpdate(
            { orderId: new mongoose.Types.ObjectId(orderId) },
            {
                ...params,
            }
        );
    }
    private async settlePaidPayment(
        payment: { _id: any; userId: any; totalMoney?: number },
        orderId: string,
        session: mongoose.ClientSession
    ) {
        await orderServices.updateOrder(
            { statusOrder: STATUS_ORDER.PROCESSING },
            orderId,
            session
        );

        const netPaid = payment.totalMoney ?? 0;
        if (netPaid > 0) {
            const earned = await awardPoints(
                payment.userId.toString(),
                netPaid,
                orderId,
                session
            );
            await PaymentModel.findByIdAndUpdate(
                payment._id,
                { $set: { pointsEarned: earned } },
                { session }
            );
        }
    }

    async paymentCheckUpdate(
        { orderId, orderType, status }: ISignatureTranscript,
        userId: string
    ) {
        switch (orderType) {
            case PAYMENT_METHOD.STRIPE: {
                if (status !== STATUS_PAYMENT_TRANSCRIPT.SUCCESS) {
                    await PaymentModel.findOneAndUpdate(
                        {
                            orderId: new mongoose.Types.ObjectId(orderId),
                            status: STATUS_PAYMENT.UNPAID,
                        },
                        { $set: { status: STATUS_PAYMENT.FAILED } }
                    );
                    return STATUS_PAYMENT_CHECKUPDATE.CANCEL;
                }

                const session = await mongoose.startSession();
                session.startTransaction();
                let paymentUpdated: any = null;
                try {
                    paymentUpdated = await PaymentModel.findOneAndUpdate(
                        {
                            orderId: new mongoose.Types.ObjectId(orderId),
                            status: STATUS_PAYMENT.UNPAID,
                        },
                        { $set: { status: STATUS_PAYMENT.PAID } },
                        { new: true, session }
                    );
                    if (paymentUpdated) {
                        await this.settlePaidPayment(
                            paymentUpdated,
                            orderId,
                            session
                        );
                    }
                    await session.commitTransaction();
                } catch (err) {
                    await session.abortTransaction();
                    throw err;
                } finally {
                    session.endSession();
                }

                if (paymentUpdated) {
                    notificationService.pushNotification(
                        "PAYMENT",
                        "Payment paid",
                        `Payment #${paymentUpdated._id.toString()} đã thanh toán thành công`,
                        orderId.toString(),
                        userId
                    );
                    notificationService.pushNotification(
                        "ORDER",
                        "Order updated",
                        `Đơn hàng #${orderId.toString()} đã được xác nhận thanh toán`,
                        orderId.toString(),
                        userId
                    );
                }
                return STATUS_PAYMENT_CHECKUPDATE.SUCCESS;
            }
            case PAYMENT_METHOD.MOMO:
                break;
            case PAYMENT_METHOD.COD: {
                const session = await mongoose.startSession();
                session.startTransaction();
                let codPayment: any = null;
                try {
                    codPayment = await PaymentModel.findOneAndUpdate(
                        {
                            orderId: new mongoose.Types.ObjectId(orderId),
                            status: STATUS_PAYMENT.UNPAID,
                        },
                        { $set: { status: STATUS_PAYMENT.PAID } },
                        { new: true, session }
                    );
                    if (codPayment) {
                        await this.settlePaidPayment(
                            codPayment,
                            orderId,
                            session
                        );
                    }
                    await session.commitTransaction();
                } catch (err) {
                    await session.abortTransaction();
                    throw err;
                } finally {
                    session.endSession();
                }

                if (codPayment) {
                    notificationService.pushNotification(
                        "ORDER",
                        "Order confirmed",
                        `Đơn hàng COD #${orderId.toString()} đã được xác nhận`,
                        orderId.toString(),
                        userId
                    );
                }
                return STATUS_PAYMENT_CHECKUPDATE.PROCESS;
            }
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
