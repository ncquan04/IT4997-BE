import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";
import { orderServices } from "../services/order.service";
import { validate } from "../middlewares/validate";
import { changeOrderSchema, createOrderSchema } from "../dto/order.dto";
import { Contacts } from "../shared/contacts";
import { IProductItem } from "../shared/models/order-model";
import { notificationService } from "../services/notification.service";

const STATUS_ORDER = Contacts.Status.Order;
const PAYMENT_STATUS = Contacts.Status.Payment;

const OrderRouter = express.Router();

/**
 * POST /api/orders
 * Tạo đơn hàng từ giỏ hàng hiện tại
 */

/**
 * POST /api/orders
 * Tạo đơn hàng mới từ giỏ hàng hiện tại của người dùng
 *
 * Yêu cầu:
 *  - Người dùng đã đăng nhập (auth middleware)
 *  - Role: USER
 *  - Body phải có toAddress (địa chỉ giao hàng)
 */
OrderRouter.post(
    "/orders",
    auth,
    verifyRole([UserRole.USER]),
    async (req: any, res: any) => {
        try {
            const userId = req.user.id;
            const { toAddress, note } = req.body;

            if (!toAddress) {
                return res.status(400).json({
                    message: "Shipping address (toAddress) is required",
                });
            }

            // 3. Gọi Service xử lý
            const newOrder = await orderServices.createOrderFromCart(
                userId,
                toAddress,
                note
            );

            // 4. Trả về kết quả thành công
            return res.status(201).json({
                message: "Order placed successfully",
                data: newOrder,
            });
        } catch (error: any) {
            console.error("Order Error:", error.message);

            // 5. Xử lý lỗi từ Service ném ra
            if (error.message === "CART_EMPTY") {
                return res.status(400).json({ message: "Your cart is empty" });
            }
            if (
                error.message &&
                error.message.startsWith("PRODUCT_NOT_FOUND")
            ) {
                return res.status(404).json({
                    message:
                        "One of the products in your cart no longer exists",
                });
            }

            // Lỗi server không xác định
            return res.status(500).json({
                message: "Failed to create order",
                error: error.message,
            });
        }
    }
);

OrderRouter.post(
    "/orders/creator",
    auth,
    validate(createOrderSchema),
    async (req, res) => {
        try {
            const {
                listProduct,
                sumPrice,
                note,
                toAddress,
                numberPhone,
                userName,
            } = req.body;
            const userId = (req as any).user.id;
            if (!userId) {
                console.log("userId not found");
            }

            const newOrder = await orderServices.createOrder({
                _id: "",
                userId,
                listProduct: listProduct as IProductItem[],
                sumPrice,
                note,
                toAddress,
                numberPhone,
                userName,
                statusOrder: STATUS_ORDER.ORDERED,
            });
            return res.status(200).json(newOrder);
        } catch (err: any) {
            console.log("create order error:", err);
            return res.status(500).json("Internal server error");
        }
    }
);

OrderRouter.get("/orders/visible", auth, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const listOrder = await orderServices.userVisibleOrders(userId);
        return res.status(200).json(listOrder);
    } catch (err) {
        console.log("visible order error: ", err);
        return res.status(500).json("Internal server error");
    }
});

OrderRouter.get("/orders/order-cancel", auth, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const listOrder = await orderServices.getUserCancelledOrders(userId);
        return res.status(200).json(listOrder);
    } catch (err) {
        console.log("get order cancel error: : ", err);
        return res.status(500).json("Internal server error");
    }
});
OrderRouter.get("/orders/order-return", auth, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const listOrder = await orderServices.getUserReturnOrder(userId);
        return res.status(200).json(listOrder);
    } catch (err) {
        console.log("get order return error: : ", err);
        return res.status(500).json("Internal server error");
    }
});
OrderRouter.get("/orders/order-delivery", auth, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const listOrder = await orderServices.getUserDeliveryOrder(userId);
        return res.status(200).json(listOrder);
    } catch (err) {
        console.log("get order return error: : ", err);
        return res.status(500).json("Internal server error");
    }
});

OrderRouter.get(
    "/orders/all",
    auth,
    verifyRole([UserRole.ADMIN]), // Chỉ Admin mới được vào
    async (req: any, res: any) => {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;
            const search = req.query.search as string;
            const status = req.query.status as string;

            const result = await orderServices.getAllOrders(
                page,
                limit,
                search,
                status
            );

            return res.status(200).json({
                message: "Get all orders successfully",
                data: result,
            });
        } catch (error: any) {
            console.error("Get All Orders Error:", error);
            return res.status(500).json({
                message: "Internal server error",
                error: error.message,
            });
        }
    }
);

OrderRouter.get(
    "/orders/admin/payment",
    auth,
    verifyRole([UserRole.ADMIN]),
    async (req, res) => {
        try {
            const { page, paymentStatus, search, limit } = req.query;
            const response = await orderServices.getOrdersByPaymentStatus({
                paymentStatus: Number(
                    paymentStatus
                ) as (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS],
                page: Number(page),
                search: search as string,
            });
            return res.status(200).json(response);
        } catch (err) {
            console.log("get order-payment error: ", err);
            return res.status(500).json("Internal server error");
        }
    }
);

OrderRouter.put(
    "/orders/change",
    auth,
    validate(changeOrderSchema),
    async (req, res) => {
        try {
            const userId = (req as any).user.id;
            const { statusOrder, orderId } = req.body;

            await orderServices.updateOrder(
                {
                    statusOrder,
                },
                orderId
            );

            notificationService.pushNotification(
                "ORDER",
                "Order update",
                `OrderId #${orderId.toString()} updated successfully`,
                orderId.toString(),
                userId
            );
            return res.status(200).json(true);
        } catch (err) {
            console.log("chage status order error: ", err);
            return res.status(500).json("Internal server error");
        }
    }
);
export default OrderRouter;
