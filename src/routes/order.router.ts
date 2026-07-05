import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { UserRole } from "../shared/models/user-model";
import {
    orderServices,
    planBranchConsolidation,
    applyBranchConsolidation,
} from "../services/order.service";
import { validate } from "../middlewares/validate";
import { changeOrderSchema, createOrderSchema } from "../dto/order.dto";
import {
    createStockExportFromOrder,
    reverseInventoryForOrder,
    ImeiAssignment,
} from "../services/stock-export.service";
import OrderModel from "../models/order-model.mongo";
import mongoose from "mongoose";
import { Contacts } from "../shared/contacts";
import {
    IProductItem,
    IOrderImeiAssignment,
} from "../shared/models/order-model";
import { notificationService } from "../services/notification.service";

const STATUS_ORDER = Contacts.Status.Order;
const PAYMENT_STATUS = Contacts.Status.Payment;

const OrderRouter = express.Router();

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
            if (
                error.message &&
                error.message.startsWith("NOT_ENOUGH_STOCK:")
            ) {
                // Format: NOT_ENOUGH_STOCK:<title>:available=<n>:requested=<m>
                const [, title, avail, req] = error.message.split(":");
                const available = avail?.split("=")[1];
                const requested = req?.split("=")[1];
                return res.status(400).json({
                    message: `Not enough stock for "${title}". Available: ${available}, requested: ${requested}`,
                });
            }
            if (error.message === "NO_ACTIVE_BRANCH") {
                return res.status(400).json({
                    message: "No active branch is available to fulfill this order",
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
        const session = await mongoose.startSession();
        session.startTransaction();
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

            const { mainBranchId, imeiAssignments, pendingTransfers } =
                await planBranchConsolidation(
                    listProduct as IProductItem[],
                    session
                );

            const [newOrder] = await OrderModel.create(
                [
                    {
                        userId: new mongoose.Types.ObjectId(userId),
                        listProduct: listProduct as IProductItem[],
                        sumPrice,
                        note: note ?? "",
                        toAddress,
                        numberPhone,
                        userName,
                        statusOrder: STATUS_ORDER.ORDERED,
                        branchId: mainBranchId,
                        imeiAssignments,
                    },
                ],
                { session }
            );

            await applyBranchConsolidation(
                String(newOrder._id),
                mainBranchId,
                pendingTransfers,
                session
            );

            await createStockExportFromOrder(
                String(newOrder._id),
                userId,
                imeiAssignments.map((a) => ({
                    productId: String(a.productId),
                    variantId: String(a.variantId),
                    branchId: String(a.branchId),
                    imeiList: a.imeiList,
                })),
                session
            );

            await session.commitTransaction();
            return res.status(200).json(newOrder);
        } catch (err: any) {
            await session.abortTransaction();
            console.log("create order error:", err);
            if (err.message && err.message.startsWith("NOT_ENOUGH_STOCK:")) {
                const [, title, avail, reqPart] = err.message.split(":");
                const available = avail?.split("=")[1];
                const requested = reqPart?.split("=")[1];
                return res.status(400).json({
                    message: `Not enough stock for "${title}". Available: ${available}, requested: ${requested}`,
                });
            }
            return res.status(500).json({ message: "Internal server error" });
        } finally {
            session.endSession();
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

OrderRouter.post(
    "/orders/:id/ship",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    async (req: any, res: any) => {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const orderId = req.params.id;
            const userId: string = req.user.id;

            if (!mongoose.isValidObjectId(orderId)) {
                await session.abortTransaction();
                return res.status(400).json({ message: "Invalid order id" });
            }

            const order = await OrderModel.findById(orderId).session(session);

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
            const userRole = (req as any).user.role;
            const { statusOrder, orderId } = req.body;

            const STAFF_ROLES: string[] = [
                UserRole.ADMIN,
                UserRole.MANAGER,
                UserRole.WAREHOUSE,
                UserRole.SALES,
            ];
            const isStaff = STAFF_ROLES.includes(userRole);

            const TRANSITIONS: Record<
                number,
                { from: number[]; staffOnly: boolean }
            > = {
                [STATUS_ORDER.PROCESSING]: {
                    from: [STATUS_ORDER.ORDERED],
                    staffOnly: true,
                },
                [STATUS_ORDER.DELIVERED]: {
                    from: [STATUS_ORDER.SHIPPING],
                    staffOnly: true,
                },
                [STATUS_ORDER.CANCELLED]: {
                    from: [STATUS_ORDER.ORDERED, STATUS_ORDER.PROCESSING],
                    staffOnly: false, // khách được tự hủy đơn của chính mình
                },
                [STATUS_ORDER.RETURNED]: {
                    from: [STATUS_ORDER.SHIPPING, STATUS_ORDER.DELIVERED],
                    staffOnly: true,
                },
            };

            const rule = TRANSITIONS[statusOrder];
            if (!rule) {
                return res.status(400).json({
                    message: `Không thể đổi sang trạng thái ${statusOrder} qua chức năng này.`,
                });
            }
            if (rule.staffOnly && !isStaff) {
                return res.status(403).json({
                    message: "Bạn không có quyền thực hiện thao tác này.",
                });
            }

            if (!mongoose.isValidObjectId(orderId)) {
                return res.status(400).json({ message: "Invalid order id" });
            }

            const targetOrder = await OrderModel.findById(orderId);
            if (!targetOrder) {
                return res.status(404).json({ message: "Order not found" });
            }
            if (!isStaff && String(targetOrder.userId) !== String(userId)) {
                return res.status(403).json({
                    message: "Bạn không có quyền thao tác trên đơn hàng này.",
                });
            }
            if (!rule.from.includes(targetOrder.statusOrder)) {
                return res.status(400).json({
                    message: `Không thể chuyển đơn từ trạng thái ${targetOrder.statusOrder} sang ${statusOrder}.`,
                });
            }

            if (
                statusOrder === STATUS_ORDER.RETURNED ||
                statusOrder === STATUS_ORDER.CANCELLED
            ) {
                const session = await mongoose.startSession();
                session.startTransaction();
                try {
                    const order =
                        await OrderModel.findById(orderId).session(session);
                    if (!order) {
                        await session.abortTransaction();
                        return res
                            .status(404)
                            .json({ message: "Order not found" });
                    }
                    // Kiểm tra lại trạng thái nguồn trong transaction để chống race.
                    if (!rule.from.includes(order.statusOrder)) {
                        await session.abortTransaction();
                        return res.status(400).json({
                            message: `Không thể chuyển đơn từ trạng thái ${order.statusOrder} sang ${statusOrder}.`,
                        });
                    }

                    await reverseInventoryForOrder(orderId, session);

                    order.statusOrder = statusOrder;
                    await order.save({ session });

                    await session.commitTransaction();
                } catch (err: any) {
                    await session.abortTransaction();
                    throw err;
                } finally {
                    session.endSession();
                }
            } else {
                // PROCESSING / DELIVERED — chỉ đổi trạng thái, không đụng tồn kho.
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
