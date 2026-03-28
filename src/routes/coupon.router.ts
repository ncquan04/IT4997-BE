import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { validate } from "../middlewares/validate";
import { UserRole } from "../shared/models/user-model";
import { createCouponSchema, updateCouponSchema } from "../dto/coupon.dto";
import { couponService } from "../services/coupon.service";

const CouponRouter = express.Router();

// ── Admin: list all coupons ──────────────────────────────────────────────────
CouponRouter.get(
    "/coupons",
    auth,
    verifyRole([UserRole.ADMIN]),
    async (req, res) => {
        try {
            const coupons = await couponService.getAllCoupons();
            return res.status(200).json(coupons);
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    }
);

// ── Admin: create coupon ─────────────────────────────────────────────────────
CouponRouter.post(
    "/coupons",
    auth,
    verifyRole([UserRole.ADMIN]),
    validate(createCouponSchema),
    async (req, res) => {
        try {
            const coupon = await couponService.createCoupon(req.body);
            return res.status(201).json(coupon);
        } catch (err: any) {
            if (err.message === "COUPON_CODE_EXISTS") {
                return res
                    .status(409)
                    .json({ message: "Coupon code already exists" });
            }
            return res.status(500).json({ message: err.message });
        }
    }
);

// ── Admin: update coupon ─────────────────────────────────────────────────────
CouponRouter.put(
    "/coupons/:id",
    auth,
    verifyRole([UserRole.ADMIN]),
    validate(updateCouponSchema),
    async (req, res) => {
        try {
            const coupon = await couponService.updateCoupon(
                String(req.params.id),
                req.body
            );
            if (!coupon) {
                return res.status(404).json({ message: "Coupon not found" });
            }
            return res.status(200).json(coupon);
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    }
);

// ── Admin: delete coupon ─────────────────────────────────────────────────────
CouponRouter.delete(
    "/coupons/:id",
    auth,
    verifyRole([UserRole.ADMIN]),
    async (req, res) => {
        try {
            const deleted = await couponService.deleteCoupon(req.params.id);
            if (!deleted) {
                return res.status(404).json({ message: "Coupon not found" });
            }
            return res.status(200).json({ message: "Coupon deleted" });
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    }
);

// ── User: validate coupon (does NOT consume it) ──────────────────────────────
CouponRouter.post("/coupons/validate", auth, async (req, res) => {
    try {
        const { code, orderTotal } = req.body;
        if (!code || typeof orderTotal !== "number") {
            return res
                .status(400)
                .json({ message: "code and orderTotal are required" });
        }
        const result = await couponService.validateCoupon(code, orderTotal);
        return res.status(200).json(result);
    } catch (err: any) {
        const msg: string = err.message ?? "Unknown error";
        if (
            msg === "COUPON_NOT_FOUND" ||
            msg === "COUPON_EXPIRED" ||
            msg === "COUPON_USAGE_EXCEEDED" ||
            msg.startsWith("COUPON_MIN_ORDER")
        ) {
            return res.status(400).json({ message: msg });
        }
        return res.status(500).json({ message: msg });
    }
});

export default CouponRouter;
