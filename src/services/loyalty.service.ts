import { Request, Response } from "express";
import mongoose from "mongoose";
import UserModel from "../models/user-model.mongo";
import MemberTierConfigModel from "../models/member-tier-config-model.mongo";
import PointTransactionModel from "../models/point-transaction-model.mongo";
import { MemberTier } from "../shared/models/member-tier-config-model";
import { PointTransactionType } from "../shared/models/point-transaction-model";
import { parsePositiveInt } from "../utils";

// ─── Hằng số ─────────────────────────────────────────────────────────────────
/** 100 VND → 1 điểm khi tích */
const EARN_RATE = 100;
/** 1 điểm = 1 VND khi đổi */
const REDEEM_RATE = 1;
/** Điểm EARN hết hạn sau 6 tháng (ms) */
const POINTS_EXPIRY_MS = 6 * 30 * 24 * 60 * 60 * 1000;
/** Rolling window để review tier: 6 tháng (ms) */
const WINDOW_MS = 6 * 30 * 24 * 60 * 60 * 1000;

type AuthenticatedRequest = Request & {
    user?: { id: string; role: string; branchId?: string };
};

const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);

// ─── Helpers nội bộ ──────────────────────────────────────────────────────────

/**
 * Tải cấu hình các hạng (sắp xếp minSpent giảm dần).
 * Dùng lean để cache-friendly.
 */
const loadTierConfigs = async () =>
    MemberTierConfigModel.find({ isActive: true })
        .sort({ minSpent: -1 })
        .lean();

/**
 * Xác định hạng từ chi tiêu trong kỳ.
 * Trả về hạng cao nhất mà spentInWindow >= minSpent.
 */
const resolveTier = (
    spentInWindow: number,
    configs: Awaited<ReturnType<typeof loadTierConfigs>>
): MemberTier => {
    for (const cfg of configs) {
        if (spentInWindow >= cfg.minSpent) return cfg.tier as MemberTier;
    }
    return MemberTier.S_NEW;
};

/**
 * Thu hồi (expire) các batch điểm đã hết hạn của một user.
 * Trả về tổng số điểm đã bị thu hồi.
 */
const expireStaleForUser = async (userId: string): Promise<number> => {
    const now = Date.now();
    const stale = await PointTransactionModel.find({
        userId: toObjectId(userId),
        type: PointTransactionType.EARN,
        expired: false,
        expiresAt: { $lt: now },
    }).lean();

    if (stale.length === 0) return 0;

    const totalExpired = stale.reduce((sum, t) => sum + t.points, 0);
    const staleIds = stale.map((t) => t._id);

    await Promise.all([
        PointTransactionModel.updateMany(
            { _id: { $in: staleIds } },
            { $set: { expired: true } }
        ),
        PointTransactionModel.create({
            userId: toObjectId(userId),
            type: PointTransactionType.EXPIRE,
            points: -totalExpired,
            note: `${stale.length} batch(es) expired`,
        }),
        UserModel.findByIdAndUpdate(userId, {
            $inc: { loyaltyPoints: -totalExpired },
        }),
    ]);

    return totalExpired;
};

// ─── Tích điểm sau đơn hàng ──────────────────────────────────────────────────
/**
 * Gọi sau khi Payment chuyển sang PAID.
 * @param paidAmount - Giá trị đơn sau khi trừ coupon + memberDiscount + pointsDiscount (VND)
 * @param orderId    - ObjectId chuỗi của đơn hàng
 */
export const awardPoints = async (
    userId: string,
    paidAmount: number,
    orderId: string
): Promise<void> => {
    const user = await UserModel.findById(userId);
    if (!user) return;

    const configs = await loadTierConfigs();
    const now = Date.now();

    // ── Kiểm tra rolling window ──────────────────────────────────────────────
    let newSpentInWindow: number;
    let newWindowStartAt: number;

    if (now - user.windowStartAt >= WINDOW_MS) {
        // Kỳ cũ đã hết → bắt đầu kỳ mới với chỉ đơn hiện tại
        newSpentInWindow = paidAmount;
        newWindowStartAt = now;
    } else {
        newSpentInWindow = user.spentInWindow + paidAmount;
        newWindowStartAt = user.windowStartAt;
    }

    const newTier = resolveTier(newSpentInWindow, configs);
    const earnedPoints = Math.floor(paidAmount / EARN_RATE);

    await Promise.all([
        // Tạo EARN transaction nếu có điểm
        earnedPoints > 0
            ? PointTransactionModel.create({
                  userId: toObjectId(userId),
                  type: PointTransactionType.EARN,
                  points: earnedPoints,
                  orderId: toObjectId(orderId),
                  expiresAt: now + POINTS_EXPIRY_MS,
                  expired: false,
                  note: `Tích điểm từ đơn hàng #${orderId}`,
              })
            : null,
        // Cập nhật user
        UserModel.findByIdAndUpdate(userId, {
            $inc: {
                loyaltyPoints: earnedPoints,
                totalSpent: paidAmount,
            },
            $set: {
                memberTier: newTier,
                spentInWindow: newSpentInWindow,
                windowStartAt: newWindowStartAt,
            },
        }),
    ]);
};

/**
 * Tính số tiền chiết khấu thành viên dựa trên hạng hiện tại.
 * Dùng trong Payment khi tính tổng tiền.
 */
export const calculateMemberDiscount = async (
    userId: string,
    baseAmount: number
): Promise<{ discountPercent: number; discountAmount: number }> => {
    const user = await UserModel.findById(userId).lean();
    if (!user || !user.memberTier)
        return { discountPercent: 0, discountAmount: 0 };

    const config = await MemberTierConfigModel.findOne({
        tier: user.memberTier,
        isActive: true,
    }).lean();

    if (!config || config.discountPercent === 0)
        return { discountPercent: 0, discountAmount: 0 };

    const discountAmount = Math.floor(
        (baseAmount * config.discountPercent) / 100
    );
    return { discountPercent: config.discountPercent, discountAmount };
};

/**
 * Xác thực và trả về số tiền tương đương khi đổi điểm.
 * 1 điểm = 1 VND.
 */
export const previewRedemption = async (
    userId: string,
    pointsToRedeem: number
): Promise<{ valid: boolean; discountAmount: number; message?: string }> => {
    if (pointsToRedeem <= 0)
        return {
            valid: false,
            discountAmount: 0,
            message: "Số điểm không hợp lệ",
        };

    // Expire stale trước để số dư chính xác
    await expireStaleForUser(userId);

    const user = await UserModel.findById(userId).lean();
    if (!user)
        return { valid: false, discountAmount: 0, message: "User not found" };

    if (pointsToRedeem > user.loyaltyPoints) {
        return {
            valid: false,
            discountAmount: 0,
            message: `Không đủ điểm. Hiện có ${user.loyaltyPoints} điểm`,
        };
    }

    return {
        valid: true,
        discountAmount: pointsToRedeem * REDEEM_RATE,
    };
};

/**
 * Thực hiện đổi điểm (gọi khi Payment được tạo).
 * Trả về số tiền được giảm.
 */
export const redeemPoints = async (
    userId: string,
    pointsToRedeem: number,
    orderId: string
): Promise<number> => {
    if (pointsToRedeem <= 0) return 0;

    await expireStaleForUser(userId);

    const user = await UserModel.findById(userId);
    if (!user || user.loyaltyPoints < pointsToRedeem) return 0;

    await Promise.all([
        PointTransactionModel.create({
            userId: toObjectId(userId),
            type: PointTransactionType.REDEEM,
            points: -pointsToRedeem,
            orderId: toObjectId(orderId),
            note: `Đổi điểm cho đơn hàng #${orderId}`,
        }),
        UserModel.findByIdAndUpdate(userId, {
            $inc: { loyaltyPoints: -pointsToRedeem },
        }),
    ]);

    return pointsToRedeem * REDEEM_RATE;
};

// ─── API Handlers ─────────────────────────────────────────────────────────────

/** GET /loyalty/me — Thông tin thành viên của user hiện tại */
export const getMyMemberInfo = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const userId = req.user!.id;
        await expireStaleForUser(userId);

        const user = await UserModel.findById(userId)
            .select(
                "userName email memberTier loyaltyPoints totalSpent spentInWindow windowStartAt"
            )
            .lean();

        if (!user) return res.status(404).json({ message: "User not found" });

        const configs = await loadTierConfigs();
        const currentConfig = configs.find((c) => c.tier === user.memberTier);
        const nextConfig = configs
            .slice()
            .reverse()
            .find((c) => c.minSpent > (currentConfig?.minSpent ?? 0));

        const nextTierInfo = nextConfig
            ? {
                  tier: nextConfig.tier,
                  remaining: Math.max(
                      0,
                      nextConfig.minSpent - user.spentInWindow
                  ),
              }
            : null;

        return res.status(200).json({
            data: {
                memberTier: user.memberTier,
                loyaltyPoints: user.loyaltyPoints,
                totalSpent: user.totalSpent,
                spentInWindow: user.spentInWindow,
                windowStartAt: user.windowStartAt,
                windowEndsAt: user.windowStartAt + WINDOW_MS,
                discountPercent: currentConfig?.discountPercent ?? 0,
                nextTier: nextTierInfo,
            },
        });
    } catch (error) {
        console.error("getMyMemberInfo error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/** GET /loyalty/me/history — Lịch sử điểm của user */
export const getMyPointHistory = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const userId = req.user!.id;
        const page = parsePositiveInt(req.query.page as string, 1);
        const limit = parsePositiveInt(req.query.limit as string, 20);
        const skip = (page - 1) * limit;

        const filter: Record<string, any> = { userId: toObjectId(userId) };

        const [items, total] = await Promise.all([
            PointTransactionModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("orderId", "sumPrice")
                .lean(),
            PointTransactionModel.countDocuments(filter),
        ]);

        return res.status(200).json({
            data: items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("getMyPointHistory error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/** POST /loyalty/me/redeem-preview — Xác nhận đổi điểm trước checkout */
export const postRedeemPreview = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const userId = req.user!.id;
        const points = Number(req.body.points);
        if (!Number.isInteger(points) || points <= 0) {
            return res
                .status(400)
                .json({ message: "points phải là số nguyên dương" });
        }

        const result = await previewRedemption(userId, points);
        if (!result.valid) {
            return res.status(400).json({ message: result.message });
        }
        return res.status(200).json({ data: result });
    } catch (error) {
        console.error("postRedeemPreview error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/** GET /loyalty/tiers — Danh sách cấu hình hạng (public) */
export const getTierList = async (_req: Request, res: Response) => {
    try {
        const tiers = await MemberTierConfigModel.find()
            .sort({ minSpent: 1 })
            .lean();
        return res.status(200).json({ data: tiers });
    } catch (error) {
        console.error("getTierList error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/** PUT /loyalty/tiers/:tier — Admin cập nhật cấu hình 1 hạng */
export const updateTierConfig = async (req: Request, res: Response) => {
    try {
        const { tier } = req.params;
        if (!Object.values(MemberTier).includes(tier as MemberTier)) {
            return res.status(400).json({ message: "Hạng không hợp lệ" });
        }

        const { minSpent, discountPercent, isActive } = req.body;

        const updated = await MemberTierConfigModel.findOneAndUpdate(
            { tier },
            {
                ...(minSpent !== undefined && { minSpent }),
                ...(discountPercent !== undefined && { discountPercent }),
                ...(isActive !== undefined && { isActive }),
            },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: "Tier config not found" });
        }

        return res
            .status(200)
            .json({ data: updated, message: "Updated successfully" });
    } catch (error) {
        console.error("updateTierConfig error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/** GET /loyalty/admin/users — Admin: danh sách thành viên */
export const getAdminMemberList = async (req: Request, res: Response) => {
    try {
        const page = parsePositiveInt(req.query.page as string, 1);
        const limit = parsePositiveInt(req.query.limit as string, 20);
        const skip = (page - 1) * limit;
        const tierFilter = req.query.tier as string | undefined;

        const filter: Record<string, any> = { role: "USER" };
        if (
            tierFilter &&
            Object.values(MemberTier).includes(tierFilter as MemberTier)
        ) {
            filter.memberTier = tierFilter;
        }

        const [items, total] = await Promise.all([
            UserModel.find(filter)
                .select(
                    "userName email phoneNumber memberTier loyaltyPoints totalSpent spentInWindow windowStartAt"
                )
                .sort({ totalSpent: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            UserModel.countDocuments(filter),
        ]);

        return res.status(200).json({
            data: items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("getAdminMemberList error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
