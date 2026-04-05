import { Request, Response } from "express";
import mongoose from "mongoose";
import OrderModel, { orderTableName } from "../models/order-model.mongo";
import PaymentModel, { paymentTableName } from "../models/payment-model.mongo";
import BranchInventoryModel from "../models/branch-inventory-model.mongo";
import StockImportModel from "../models/stock-import-model.mongo";
import RefundReportModel from "../models/refund-report-model.mongo";
import PointTransactionModel from "../models/point-transaction-model.mongo";
import MemberTierConfigModel from "../models/member-tier-config-model.mongo";
import UserModel from "../models/user-model.mongo";
import { Contacts } from "../shared/contacts";

const STATUS_ORDER = Contacts.Status.Order;
const STATUS_PAYMENT = Contacts.Status.Payment;
const STATUS_STOCK = Contacts.Status.Stock;

// Payment statuses that mean the order is effectively cancelled / invalid
const EXCLUDED_PAYMENT_STATUSES = [
    STATUS_PAYMENT.CANCELLED,
    STATUS_PAYMENT.REFUNDED,
    STATUS_PAYMENT.FAILED,
    STATUS_PAYMENT.EXPIRED,
];
// Order statuses to exclude
const EXCLUDED_ORDER_STATUSES = [STATUS_ORDER.CANCELLED, STATUS_ORDER.RETURNED];

// ─── helpers ────────────────────────────────────────────────────────────────

function parseTimeRange(req: Request): { from?: Date; to?: Date } {
    const from = req.query.from ? new Date(Number(req.query.from)) : undefined;
    const to = req.query.to ? new Date(Number(req.query.to)) : undefined;
    return { from, to };
}

function buildDateFilter(field: string, from?: Date, to?: Date) {
    const f: Record<string, unknown> = {};
    if (from) f.$gte = from;
    if (to) f.$lte = to;
    return Object.keys(f).length ? { [field]: f } : {};
}

function parseBranchId(req: Request): mongoose.Types.ObjectId | undefined {
    const id: string | undefined =
        (req as any).targetBranchId ??
        (req.query.branchId as string | undefined);
    return id ? new mongoose.Types.ObjectId(id) : undefined;
}

// ─── 1. Top sản phẩm kinh doanh tốt ────────────────────────────────────────

export const getTopProducts = async (req: Request, res: Response) => {
    try {
        const { from, to } = parseTimeRange(req);
        const branchId = parseBranchId(req);
        const limit = Math.min(Number(req.query.limit) || 10, 50);

        const dateFilter = buildDateFilter("createdAt", from, to);
        const branchFilter = branchId ? { branchId } : {};

        const pipeline: mongoose.PipelineStage[] = [
            // 1. Filter orders
            {
                $match: {
                    statusOrder: { $nin: EXCLUDED_ORDER_STATUSES },
                    ...branchFilter,
                    ...dateFilter,
                },
            },
            // 2. Join payment to verify payment is not cancelled
            {
                $lookup: {
                    from: "payments",
                    localField: "_id",
                    foreignField: "orderId",
                    as: "payment",
                },
            },
            {
                $unwind: {
                    path: "$payment",
                    preserveNullAndEmptyArrays: false,
                },
            },
            {
                $match: {
                    "payment.status": { $nin: EXCLUDED_PAYMENT_STATUSES },
                },
            },
            // 3. Unwind product list
            { $unwind: "$listProduct" },
            // 4. Group by product
            {
                $group: {
                    _id: "$listProduct.productId",
                    title: { $first: "$listProduct.title" },
                    totalRevenue: { $sum: "$listProduct.totalMoney" },
                    totalCost: {
                        $sum: {
                            $multiply: [
                                "$listProduct.costPrice",
                                "$listProduct.quantity",
                            ],
                        },
                    },
                    totalQuantity: { $sum: "$listProduct.quantity" },
                    orderCount: { $sum: 1 },
                },
            },
            // 5. Compute gross profit
            {
                $addFields: {
                    grossProfit: { $subtract: ["$totalRevenue", "$totalCost"] },
                    grossMarginPct: {
                        $cond: [
                            { $gt: ["$totalRevenue", 0] },
                            {
                                $multiply: [
                                    {
                                        $divide: [
                                            {
                                                $subtract: [
                                                    "$totalRevenue",
                                                    "$totalCost",
                                                ],
                                            },
                                            "$totalRevenue",
                                        ],
                                    },
                                    100,
                                ],
                            },
                            0,
                        ],
                    },
                },
            },
            // 6. Sort & limit
            { $sort: { totalRevenue: -1 } },
            { $limit: limit },
        ];

        const data = await OrderModel.aggregate(pipeline);
        return res.status(200).json({ data });
    } catch (error) {
        console.error("getTopProducts error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── 2. Báo cáo giá trị kho hàng ────────────────────────────────────────────

export const getInventoryValue = async (req: Request, res: Response) => {
    try {
        const branchId = parseBranchId(req);
        const matchFilter: Record<string, unknown> = {};
        if (branchId) matchFilter.branchId = branchId;

        const pipeline: mongoose.PipelineStage[] = [
            { $match: matchFilter },
            // Join product để lấy thông tin variant
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "product",
                },
            },
            {
                $unwind: {
                    path: "$product",
                    preserveNullAndEmptyArrays: false,
                },
            },
            // Tìm variant khớp variantId
            {
                $addFields: {
                    variant: {
                        $first: {
                            $filter: {
                                input: "$product.variants",
                                as: "v",
                                cond: { $eq: ["$$v._id", "$variantId"] },
                            },
                        },
                    },
                },
            },
            { $match: { variant: { $ne: null } } },
            // Tính giá trị từng dòng
            {
                $addFields: {
                    costValue: {
                        $multiply: ["$quantity", "$variant.costPrice"],
                    },
                    saleValue: {
                        $multiply: ["$quantity", "$variant.price"],
                    },
                },
            },
            // Group by branch
            {
                $group: {
                    _id: "$branchId",
                    totalCostValue: { $sum: "$costValue" },
                    totalSaleValue: { $sum: "$saleValue" },
                    totalItems: { $sum: "$quantity" },
                    uniqueVariants: { $sum: 1 },
                },
            },
            // Join branch name
            {
                $lookup: {
                    from: "branches",
                    localField: "_id",
                    foreignField: "_id",
                    as: "branch",
                },
            },
            {
                $addFields: {
                    branchName: { $first: "$branch.name" },
                },
            },
            { $project: { branch: 0 } },
            { $sort: { totalCostValue: -1 } },
        ];

        const data = await BranchInventoryModel.aggregate(pipeline);
        const summary = data.reduce(
            (acc, row) => ({
                totalCostValue: acc.totalCostValue + row.totalCostValue,
                totalSaleValue: acc.totalSaleValue + row.totalSaleValue,
                totalItems: acc.totalItems + row.totalItems,
            }),
            { totalCostValue: 0, totalSaleValue: 0, totalItems: 0 }
        );

        return res.status(200).json({ summary, byBranch: data });
    } catch (error) {
        console.error("getInventoryValue error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── 3. Doanh thu & lợi nhuận theo thời gian ────────────────────────────────

export const getRevenueOverTime = async (req: Request, res: Response) => {
    try {
        const { from, to } = parseTimeRange(req);
        const branchId = parseBranchId(req);
        const granularity = (req.query.granularity as string) || "month";

        const dateFormat =
            granularity === "day"
                ? "%Y-%m-%d"
                : granularity === "year"
                  ? "%Y"
                  : "%Y-%m";

        const orderMatch: Record<string, unknown> = {
            statusOrder: { $nin: EXCLUDED_ORDER_STATUSES },
        };
        if (branchId) orderMatch.branchId = branchId;
        if (from || to) {
            const df = buildDateFilter("createdAt", from, to);
            Object.assign(orderMatch, df);
        }

        // Aggregate orders with matching payments
        const pipeline: mongoose.PipelineStage[] = [
            { $match: orderMatch },
            {
                $lookup: {
                    from: "payments",
                    localField: "_id",
                    foreignField: "orderId",
                    as: "payment",
                },
            },
            {
                $unwind: {
                    path: "$payment",
                    preserveNullAndEmptyArrays: false,
                },
            },
            {
                $match: {
                    "payment.status": { $nin: EXCLUDED_PAYMENT_STATUSES },
                },
            },
            // Compute gross profit from line items (revenue after discounts minus cost)
            {
                $addFields: {
                    grossProfit: {
                        $subtract: [
                            "$payment.totalMoney",
                            {
                                $sum: {
                                    $map: {
                                        input: "$listProduct",
                                        as: "item",
                                        in: {
                                            $multiply: [
                                                "$$item.costPrice",
                                                "$$item.quantity",
                                            ],
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
            },
            // Group by time bucket
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: dateFormat,
                            date: "$payment.createdAt",
                        },
                    },
                    totalRevenue: { $sum: "$payment.totalMoney" },
                    totalDiscount: {
                        $sum: {
                            $add: [
                                { $ifNull: ["$payment.couponDiscount", 0] },
                                { $ifNull: ["$payment.memberDiscount", 0] },
                                { $ifNull: ["$payment.pointsDiscount", 0] },
                            ],
                        },
                    },
                    grossProfit: { $sum: "$grossProfit" },
                    orderCount: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ];

        const data = await OrderModel.aggregate(pipeline);
        return res.status(200).json({ granularity, data });
    } catch (error) {
        console.error("getRevenueOverTime error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── 4. Doanh thu theo chi nhánh ─────────────────────────────────────────────

export const getRevenueByBranch = async (req: Request, res: Response) => {
    try {
        const { from, to } = parseTimeRange(req);
        const branchId = parseBranchId(req);

        const orderMatch: Record<string, unknown> = {
            statusOrder: { $nin: EXCLUDED_ORDER_STATUSES },
        };
        if (branchId) orderMatch.branchId = branchId;
        if (from || to)
            Object.assign(orderMatch, buildDateFilter("createdAt", from, to));

        const pipeline: mongoose.PipelineStage[] = [
            { $match: orderMatch },
            {
                $lookup: {
                    from: "payments",
                    localField: "_id",
                    foreignField: "orderId",
                    as: "payment",
                },
            },
            {
                $unwind: {
                    path: "$payment",
                    preserveNullAndEmptyArrays: false,
                },
            },
            {
                $match: {
                    "payment.status": { $nin: EXCLUDED_PAYMENT_STATUSES },
                },
            },
            {
                $addFields: {
                    grossProfit: {
                        $subtract: [
                            "$sumPrice",
                            {
                                $sum: {
                                    $map: {
                                        input: "$listProduct",
                                        as: "item",
                                        in: {
                                            $multiply: [
                                                "$$item.costPrice",
                                                "$$item.quantity",
                                            ],
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: { $ifNull: ["$branchId", null] },
                    totalRevenue: { $sum: "$payment.totalMoney" },
                    grossProfit: { $sum: "$grossProfit" },
                    orderCount: { $sum: 1 },
                    totalDiscount: {
                        $sum: {
                            $add: [
                                { $ifNull: ["$payment.couponDiscount", 0] },
                                { $ifNull: ["$payment.memberDiscount", 0] },
                                { $ifNull: ["$payment.pointsDiscount", 0] },
                            ],
                        },
                    },
                },
            },
            {
                $lookup: {
                    from: "branches",
                    localField: "_id",
                    foreignField: "_id",
                    as: "branch",
                },
            },
            {
                $addFields: {
                    branchName: {
                        $ifNull: [
                            { $first: "$branch.name" },
                            "Online / Unknown",
                        ],
                    },
                },
            },
            { $project: { branch: 0 } },
            { $sort: { totalRevenue: -1 } },
        ];

        const data = await OrderModel.aggregate(pipeline);
        return res.status(200).json({ data });
    } catch (error) {
        console.error("getRevenueByBranch error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── 5. Phân tích tác động khuyến mãi ────────────────────────────────────────

export const getCouponImpact = async (req: Request, res: Response) => {
    try {
        const { from, to } = parseTimeRange(req);
        const branchId = parseBranchId(req);

        const paymentMatch: Record<string, unknown> = {
            status: { $nin: EXCLUDED_PAYMENT_STATUSES },
        };
        if (from || to)
            Object.assign(paymentMatch, buildDateFilter("createdAt", from, to));

        // We need branchId from order — join if needed
        const pipeline: mongoose.PipelineStage[] = [
            { $match: paymentMatch },
            // Join order for statusOrder and branchId
            {
                $lookup: {
                    from: "orders",
                    localField: "orderId",
                    foreignField: "_id",
                    as: "order",
                },
            },
            { $unwind: { path: "$order", preserveNullAndEmptyArrays: false } },
            {
                $match: {
                    "order.statusOrder": { $nin: EXCLUDED_ORDER_STATUSES },
                    ...(branchId ? { "order.branchId": branchId } : {}),
                },
            },
            // Overall summary
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalMoney" },
                    totalCouponDiscount: {
                        $sum: { $ifNull: ["$couponDiscount", 0] },
                    },
                    totalMemberDiscount: {
                        $sum: { $ifNull: ["$memberDiscount", 0] },
                    },
                    totalPointsDiscount: {
                        $sum: { $ifNull: ["$pointsDiscount", 0] },
                    },
                    ordersWithCoupon: {
                        $sum: {
                            $cond: [
                                {
                                    $gt: [
                                        { $ifNull: ["$couponDiscount", 0] },
                                        0,
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    ordersWithMemberDiscount: {
                        $sum: {
                            $cond: [
                                {
                                    $gt: [
                                        { $ifNull: ["$memberDiscount", 0] },
                                        0,
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    ordersWithPointsDiscount: {
                        $sum: {
                            $cond: [
                                {
                                    $gt: [
                                        { $ifNull: ["$pointsDiscount", 0] },
                                        0,
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    orderCount: { $sum: 1 },
                },
            },
            { $project: { _id: 0 } },
        ];

        // Per-coupon breakdown
        const couponPipeline: mongoose.PipelineStage[] = [
            {
                $match: {
                    ...paymentMatch,
                    couponCode: { $nin: [null, ""] },
                    couponDiscount: { $gt: 0 },
                },
            },
            {
                $lookup: {
                    from: "orders",
                    localField: "orderId",
                    foreignField: "_id",
                    as: "order",
                },
            },
            { $unwind: { path: "$order", preserveNullAndEmptyArrays: false } },
            {
                $match: {
                    "order.statusOrder": { $nin: EXCLUDED_ORDER_STATUSES },
                    ...(branchId ? { "order.branchId": branchId } : {}),
                },
            },
            {
                $group: {
                    _id: "$couponCode",
                    usedCount: { $sum: 1 },
                    totalDiscount: {
                        $sum: { $ifNull: ["$couponDiscount", 0] },
                    },
                    totalRevenue: { $sum: "$totalMoney" },
                },
            },
            { $sort: { totalDiscount: -1 } },
            { $limit: 20 },
        ];

        const [summaryArr, byCoupon] = await Promise.all([
            PaymentModel.aggregate(pipeline),
            PaymentModel.aggregate(couponPipeline),
        ]);

        return res.status(200).json({ summary: summaryArr[0] ?? {}, byCoupon });
    } catch (error) {
        console.error("getCouponImpact error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── 6. Chi phí nhập hàng ────────────────────────────────────────────────────

export const getImportCost = async (req: Request, res: Response) => {
    try {
        const { from, to } = parseTimeRange(req);
        const branchId = parseBranchId(req);
        const groupBy = (req.query.groupBy as string) || "supplier"; // "supplier" | "branch"

        const matchFilter: Record<string, unknown> = {
            status: STATUS_STOCK.COMPLETED,
        };
        if (branchId) matchFilter.branchId = branchId;
        if (from || to)
            Object.assign(matchFilter, buildDateFilter("createdAt", from, to));

        const groupField = groupBy === "branch" ? "$branchId" : "$supplierId";
        const lookupCollection =
            groupBy === "branch" ? "branches" : "suppliers";

        const pipeline: mongoose.PipelineStage[] = [
            { $match: matchFilter },
            {
                $group: {
                    _id: groupField,
                    totalCost: { $sum: "$totalCost" },
                    importCount: { $sum: 1 },
                    totalItems: { $sum: { $sum: "$items.quantity" } },
                },
            },
            {
                $lookup: {
                    from: lookupCollection,
                    localField: "_id",
                    foreignField: "_id",
                    as: "info",
                },
            },
            {
                $addFields: {
                    name: { $first: "$info.name" },
                },
            },
            { $project: { info: 0 } },
            { $sort: { totalCost: -1 } },
        ];

        // Also get total
        const totalPipeline: mongoose.PipelineStage[] = [
            { $match: matchFilter },
            {
                $group: {
                    _id: null,
                    totalCost: { $sum: "$totalCost" },
                    importCount: { $sum: 1 },
                },
            },
            { $project: { _id: 0 } },
        ];

        const [data, totalArr] = await Promise.all([
            StockImportModel.aggregate(pipeline),
            StockImportModel.aggregate(totalPipeline),
        ]);

        return res
            .status(200)
            .json({ groupBy, summary: totalArr[0] ?? {}, data });
    } catch (error) {
        console.error("getImportCost error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── 7. Báo cáo hoàn tiền & tổn thất ────────────────────────────────────────

export const getRefundSummary = async (req: Request, res: Response) => {
    try {
        const { from, to } = parseTimeRange(req);
        const branchId = parseBranchId(req);

        const matchFilter: Record<string, unknown> = {};
        if (branchId) matchFilter.branchId = branchId;
        if (from || to)
            Object.assign(matchFilter, buildDateFilter("createdAt", from, to));

        // Overall summary
        const summaryPipeline: mongoose.PipelineStage[] = [
            { $match: matchFilter },
            {
                $group: {
                    _id: null,
                    totalRefundAmount: { $sum: "$amount" },
                    refundCount: { $sum: 1 },
                },
            },
            { $project: { _id: 0 } },
        ];

        // By reason
        const byReasonPipeline: mongoose.PipelineStage[] = [
            { $match: matchFilter },
            {
                $group: {
                    _id: "$reason",
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
            { $sort: { totalAmount: -1 } },
        ];

        // By branch (admin only)
        const byBranchPipeline: mongoose.PipelineStage[] = [
            { $match: matchFilter },
            {
                $group: {
                    _id: "$branchId",
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
            {
                $lookup: {
                    from: "branches",
                    localField: "_id",
                    foreignField: "_id",
                    as: "branch",
                },
            },
            {
                $addFields: {
                    branchName: {
                        $ifNull: [{ $first: "$branch.name" }, "Unknown"],
                    },
                },
            },
            { $project: { branch: 0 } },
            { $sort: { totalAmount: -1 } },
        ];

        // Over time (monthly)
        const overTimePipeline: mongoose.PipelineStage[] = [
            { $match: matchFilter },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m",
                            date: "$createdAt",
                        },
                    },
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ];

        const [summaryArr, byReason, byBranch, overTime] = await Promise.all([
            RefundReportModel.aggregate(summaryPipeline),
            RefundReportModel.aggregate(byReasonPipeline),
            RefundReportModel.aggregate(byBranchPipeline),
            RefundReportModel.aggregate(overTimePipeline),
        ]);

        return res.status(200).json({
            summary: summaryArr[0] ?? { totalRefundAmount: 0, refundCount: 0 },
            byReason,
            byBranch,
            overTime,
        });
    } catch (error) {
        console.error("getRefundSummary error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── 8. Báo cáo chương trình Loyalty ────────────────────────────────────────

export const getLoyaltySummary = async (req: Request, res: Response) => {
    try {
        const { from, to } = parseTimeRange(req);

        const matchFilter: Record<string, unknown> = {};
        if (from || to)
            Object.assign(matchFilter, buildDateFilter("createdAt", from, to));

        // Points by transaction type
        const byTypePipeline: mongoose.PipelineStage[] = [
            { $match: matchFilter },
            {
                $group: {
                    _id: "$type",
                    totalPoints: { $sum: "$points" },
                    transactionCount: { $sum: 1 },
                },
            },
        ];

        // Points over time (monthly)
        const overTimePipeline: mongoose.PipelineStage[] = [
            { $match: { ...matchFilter, type: "EARN" } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m", date: "$createdAt" },
                    },
                    pointsEarned: { $sum: "$points" },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ];

        // User distribution by memberTier
        const tierDistPipeline: mongoose.PipelineStage[] = [
            {
                $group: {
                    _id: "$memberTier",
                    userCount: { $sum: 1 },
                    totalLoyaltyPoints: { $sum: "$loyaltyPoints" },
                    avgTotalSpent: { $avg: "$totalSpent" },
                },
            },
        ];

        const [byType, overTime, tierDist, tierConfigs] = await Promise.all([
            PointTransactionModel.aggregate(byTypePipeline),
            PointTransactionModel.aggregate(overTimePipeline),
            UserModel.aggregate(tierDistPipeline),
            MemberTierConfigModel.find({ isActive: true }).lean(),
        ]);

        return res
            .status(200)
            .json({ byType, overTime, tierDist, tierConfigs });
    } catch (error) {
        console.error("getLoyaltySummary error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
