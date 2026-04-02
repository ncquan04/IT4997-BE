import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";
import {
    getMyMemberInfo,
    getMyPointHistory,
    postRedeemPreview,
    getTierList,
    updateTierConfig,
    getAdminMemberList,
} from "../services/loyalty.service";

const LoyaltyRouter = express.Router();

// ── User routes ────────────────────────────────────────────────────────────────
/** Xem thông tin hạng thành viên + điểm của bản thân */
LoyaltyRouter.get("/loyalty/me", auth, getMyMemberInfo);

/** Xem lịch sử tích/đổi/hết hạn điểm */
LoyaltyRouter.get("/loyalty/me/history", auth, getMyPointHistory);

/** Pre-check đổi điểm trước khi checkout */
LoyaltyRouter.post("/loyalty/me/redeem-preview", auth, postRedeemPreview);

// ── Public routes ──────────────────────────────────────────────────────────────
/** Xem cấu hình các hạng thành viên */
LoyaltyRouter.get("/loyalty/tiers", getTierList);

// ── Admin routes ────────────────────────────────────────────────────────────────
/** Cập nhật cấu hình một hạng */
LoyaltyRouter.put(
    "/loyalty/tiers/:tier",
    auth,
    verifyRole([UserRole.ADMIN]),
    updateTierConfig
);

/** Danh sách thành viên kèm hạng */
LoyaltyRouter.get(
    "/loyalty/admin/users",
    auth,
    verifyRole([UserRole.ADMIN]),
    getAdminMemberList
);

export default LoyaltyRouter;
