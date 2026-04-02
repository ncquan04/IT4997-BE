import express from "express";
import Stripe from "stripe";
import { Contacts } from "../shared/contacts";
import { auth } from "../middlewares/auth";
import { decryptObject, encryptObject } from "../utils";
import { orderServices } from "../services/order.service";
import {
    ISignatureTranscript,
    paymentService,
} from "../services/paymeny.service";
import { notificationService } from "../services/notification.service";
import { couponService } from "../services/coupon.service";
import {
    calculateMemberDiscount,
    previewRedemption,
} from "../services/loyalty.service";

const PAYMENT_METHOD = Contacts.PaymentMethod;
const DELIVERY = Contacts.Delivery;
const STATUS_PAYMENT = Contacts.Status.Payment;

const PaymentRouter = express.Router();

PaymentRouter.post("/payment/creator", auth, async (req, res) => {
    try {
        const method = String(req.query["method"] ?? "");
        const delivery = String(req.query["delivery"] ?? "");
        const orderId = String(req.query.order ?? "");
        const couponCode = req.query["coupon"]
            ? String(req.query["coupon"])
            : null;
        // Số điểm khách muốn đổi (tuỳ chọn, do frontend gửi lên)
        const pointsToRedeem = Math.max(
            0,
            parseInt(String(req.query["points"] ?? "0"), 10) || 0
        );

        if (!orderId) {
            return res.status(400).json("order_id is required");
        }
        if (!method) {
            return res.status(400).json("method is required");
        }

        const orderRes =
            await orderServices.orderInfoWidthListProductDetail(orderId);
        if (orderRes.length <= 0 || orderRes[0].listProduct.length === 0) {
            return res.status(400).json("Order not found");
        }

        const totalMoney = orderRes[0].sumPrice;
        const listProduct = orderRes[0].listProduct;
        const totalDiscount = listProduct.reduce(
            (sum: number, item: any) => sum + (item.discount ?? 0),
            0
        );

        // Build items array for product-specific coupon validation
        const orderItems = listProduct.map((item: any) => ({
            productId: item.productId,
            price: item.price,
            quantity: item.quantity,
        }));

        // Validate coupon server-side if provided
        let couponDiscount = 0;
        let validatedCouponCode: string | null = null;
        if (couponCode) {
            const couponResult = await couponService.validateCoupon(
                couponCode,
                totalMoney,
                orderItems
            );
            couponDiscount = couponResult.discountAmount;
            validatedCouponCode = couponCode.toUpperCase();
            await couponService.incrementUsedCount(couponCode);
        }

        const userId: string = (req as any).user.id;

        // Tính chiết khấu theo hạng thành viên (dựa trên giá sau coupon)
        const baseAfterCoupon = totalMoney - couponDiscount;
        const { discountAmount: memberDiscount } =
            await calculateMemberDiscount(userId, baseAfterCoupon);

        // Xác thực điểm đổi (dựa trên giá sau coupon + memberDiscount)
        let validatedPointsRedeemed = 0;
        let pointsDiscount = 0;
        if (pointsToRedeem > 0) {
            const baseAfterMember = baseAfterCoupon - memberDiscount;
            const preview = await previewRedemption(userId, pointsToRedeem);
            if (preview.valid) {
                // Không cho đổi điểm vượt quá số tiền còn lại
                const cappedPoints = Math.min(pointsToRedeem, baseAfterMember);
                validatedPointsRedeemed = cappedPoints;
                pointsDiscount = cappedPoints; // 1 điểm = 1 VND
            }
        }

        const finalTotal =
            totalMoney - couponDiscount - memberDiscount - pointsDiscount;

        const urlRedirect = await paymentService.paymentTransctip(
            method,
            orderRes[0]
        );

        await Promise.all([
            paymentService.CreatePayment({
                _id: "",
                userId,
                orderId: orderRes[0]._id,
                method: method ?? PAYMENT_METHOD.COD,
                totalMoney: finalTotal,
                discount: totalDiscount,
                delivery: delivery || DELIVERY.EXPRESS,
                status: STATUS_PAYMENT.UNPAID,
                couponCode: validatedCouponCode ?? undefined,
                couponDiscount,
                memberDiscount,
                pointsRedeemed: validatedPointsRedeemed,
                pointsDiscount,
            }),
            orderServices.updateOrder(
                { statusOrder: Contacts.Status.Order.PROCESSING },
                orderId
            ),
        ]);

        // return res.redirect(303, urlRedric);
        return res.status(200).json(urlRedirect);
    } catch (err: any) {
        // stripe
        if (err instanceof Stripe.errors.StripeCardError) {
            // Lỗi thanh toán do thẻ
            return res.status(400).json({
                message: err.message,
                type: "card_error",
            });
        }

        if (err instanceof Stripe.errors.StripeInvalidRequestError) {
            // Lỗi gọi API sai tham số
            return res.status(400).json({
                message: err.message,
                type: "invalid_request_error",
            });
        }

        if (err instanceof Stripe.errors.StripeAPIError) {
            return res.status(500).json({
                message: "Stripe API error",
            });
        }

        if (err instanceof Stripe.errors.StripeConnectionError) {
            return res.status(502).json({
                message: "Connection error to Stripe",
            });
        }

        if (err instanceof Stripe.errors.StripeAuthenticationError) {
            return res.status(401).json({
                message: "Invalid Stripe API key",
            });
        }

        if (err instanceof Stripe.errors.StripeRateLimitError) {
            return res.status(429).json({
                message: "Too many requests to Stripe",
            });
        }

        // === DEFAULT ERROR ===
        return res.status(500).json({
            message: "Unknown server error",
            error: err.message,
        });
    }
});
PaymentRouter.get("/payment/check-update/:id", auth, async (req, res) => {
    try {
        const id = req.params.id;
        const userId = (req as any).user.id;

        if (!id) {
            return res.status(400).json("Invalid error");
        }

        const data = decryptObject(id) as ISignatureTranscript;
        const { orderId, orderType, status } = data;
        if (!orderId || !orderType) {
            return res.status(400).json("Invalid error");
        }

        const statusPaymentCheckUpdate =
            await paymentService.paymentCheckUpdate(
                {
                    orderId,
                    orderType,
                    status,
                },
                userId
            );

        return res.status(200).json(statusPaymentCheckUpdate);
    } catch (err) {
        console.log("error: ", err);
        return res.status(500).json("Server error");
    }
});
//momo-weeb-hook
PaymentRouter.get("/payment/weeb-hook", (req, res) => {
    console.log("req, ", req?.body);
    return res.status(200).json("oke");
});

PaymentRouter.put("/payment/change", auth, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { status, paymentId } = req.body;
        await paymentService.updatePayment(
            {
                status,
            },
            paymentId
        );
        notificationService.pushNotification(
            "PAYMENT",
            "Payment update",
            `Payment #${paymentId.toString()} updated successfully`,
            paymentId.toString(),
            userId
        );
        return res.status(200).json(true);
    } catch (err) {
        console.log("Change status payment error: ", err);
        return res.status(500).json("Internal server error");
    }
});

export default PaymentRouter;
