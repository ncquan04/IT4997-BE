import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { UserRole } from "../shared/models/user-model";
import { orderServices } from "../services/order.service";
import { validate } from "../middlewares/validate";
import {
    changeOrderSchema,
    createOrderSchema,
    shipOrderSchema,
} from "../dto/order.dto";
import {
    createStockExportFromOrder,
    reverseInventoryForOrder,
    ImeiAssignment,
} from "../services/stock-export.service";
import mongoose from "mongoose";
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
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES]),
    verifyBranchScope(),
    async (req: any, res: any) => {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;
            const search = req.query.search as string;
            const status = req.query.status as string;
            const branchId: string | undefined = req.targetBranchId;

            const result = await orderServices.getAllOrders(
                page,
                limit,
                search,
                status,
                branchId
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
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES]),
    verifyBranchScope(),
    async (req, res) => {
        try {
            const { page, paymentStatus, search, limit } = req.query;
            const branchId: string | undefined = (req as any).targetBranchId;
            const response = await orderServices.getOrdersByPaymentStatus({
                paymentStatus: Number(
                    paymentStatus
                ) as (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS],
                page: Number(page),
                search: search as string,
                branchId,
            });
            return res.status(200).json(response);
        } catch (err) {
            console.log("get order-payment error: ", err);
            return res.status(500).json("Internal server error");
        }
    }
);

/**
 * POST /api/orders/:id/ship
 * Admin chuyển order sang SHIPPING, cung cấp IMEI cụ thể cho từng sản phẩm.
 * Tạo StockExport COMPLETED + deduct BranchInventory trong cùng 1 transaction.
 */
OrderRouter.post(
    "/orders/:id/ship",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    validate(shipOrderSchema),
    async (req: any, res: any) => {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const orderId = req.params.id;
            const { imeiAssignments, branchId: bodyBranchId } = req.body as {
                imeiAssignments: ImeiAssignment[];
                branchId?: string;
            };
            const userId: string = req.user.id;

            if (!mongoose.isValidObjectId(orderId)) {
                await session.abortTransaction();
                return res.status(400).json({ message: "Invalid order id" });
            }

            const order = await (
                await import("../models/order-model.mongo")
            ).default
                .findById(orderId)
                .session(session);

            if (!order) {
                await session.abortTransaction();
                return res.status(404).json({ message: "Order not found" });
            }

            if (order.statusOrder !== STATUS_ORDER.PROCESSING) {
                await session.abortTransaction();
                return res.status(400).json({
                    message: `Order must be in PROCESSING status to ship. Current status: ${order.statusOrder}`,
                });
            }

            // Resolve branchId: order.branchId → body branchId → user's branchId
            const effectiveBranchId = order.branchId
                ? String(order.branchId)
                : (bodyBranchId ?? req.user.branchId ?? "");

            if (
                !effectiveBranchId ||
                !mongoose.isValidObjectId(effectiveBranchId)
            ) {
                await session.abortTransaction();
                return res.status(400).json({
                    message:
                        "Branch is required to ship. Please assign a branch to this order.",
                });
            }

            // Persist branchId on the order if it wasn't set yet
            if (!order.branchId) {
                order.branchId = new mongoose.Types.ObjectId(
                    effectiveBranchId
                ) as any;
            }

            // Validate that imeiAssignments cover all products in the order
            for (const item of order.listProduct) {
                const assignment = imeiAssignments.find(
                    (a) =>
                        a.productId === String(item.productId) &&
                        a.variantId === String(item.variantId)
                );
                if (!assignment) {
                    await session.abortTransaction();
                    return res.status(400).json({
                        message: `Missing IMEI assignment for productId=${item.productId} variantId=${item.variantId}`,
                    });
                }
                if (assignment.imeiList.length !== item.quantity) {
                    await session.abortTransaction();
                    return res.status(400).json({
                        message: `IMEI count (${assignment.imeiList.length}) does not match order quantity (${item.quantity}) for productId=${item.productId}`,
                    });
                }
            }

            // Create StockExport + deduct inventory inside the transaction
            await createStockExportFromOrder(
                orderId,
                effectiveBranchId,
                userId,
                imeiAssignments,
                session
            );

            // Update order status to SHIPPING
            order.statusOrder = STATUS_ORDER.SHIPPING;
            await order.save({ session });

            await session.commitTransaction();

            notificationService.pushNotification(
                "ORDER",
                "Order shipped",
                `Order #${orderId} is now being shipped`,
                orderId,
                userId
            );

            return res.status(200).json({
                message: "Order is now shipping",
                statusOrder: STATUS_ORDER.SHIPPING,
            });
        } catch (error: any) {
            await session.abortTransaction();
            console.error(
                "[Ship Order] Error for orderId=%s:",
                req.params.id,
                error?.stack ?? error
            );
            return res.status(500).json({
                message: error?.message ?? "Failed to ship order",
                error,
            });
        } finally {
            session.endSession();
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

            // When transitioning to RETURNED, restore inventory in a transaction
            if (statusOrder === STATUS_ORDER.RETURNED) {
                const session = await mongoose.startSession();
                session.startTransaction();
                try {
                    const OrderModel = (
                        await import("../models/order-model.mongo")
                    ).default;
                    const order =
                        await OrderModel.findById(orderId).session(session);

                    if (!order) {
                        await session.abortTransaction();
                        return res
                            .status(404)
                            .json({ message: "Order not found" });
                    }

                    const allowedFromStatuses: number[] = [
                        STATUS_ORDER.SHIPPING,
                        STATUS_ORDER.DELIVERED,
                    ];
                    if (!allowedFromStatuses.includes(order.statusOrder)) {
                        await session.abortTransaction();
                        return res.status(400).json({
                            message: `Cannot return an order with status ${order.statusOrder}. Order must be SHIPPING or DELIVERED.`,
                        });
                    }

                    // Restore inventory (reverses the StockExport created at shipping)
                    await reverseInventoryForOrder(orderId, session);

                    order.statusOrder = STATUS_ORDER.RETURNED;
                    await order.save({ session });

                    await session.commitTransaction();
                } catch (err: any) {
                    await session.abortTransaction();
                    throw err;
                } finally {
                    session.endSession();
                }
            } else {
                await orderServices.updateOrder({ statusOrder }, orderId);
            }

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
