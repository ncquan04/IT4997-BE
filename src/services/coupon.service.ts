import CouponModel from "../models/coupon-model.mongo";
import { ICoupon } from "../shared/models/coupon-model";

class CouponService {
    async createCoupon(
        data: Omit<ICoupon, "_id" | "usedCount">
    ): Promise<ICoupon> {
        const existing = await CouponModel.findOne({
            code: data.code.toUpperCase(),
        });
        if (existing) {
            throw new Error("COUPON_CODE_EXISTS");
        }
        const coupon = await CouponModel.create({ ...data, usedCount: 0 });
        return coupon.toObject();
    }

    async getAllCoupons(): Promise<ICoupon[]> {
        const coupons = await CouponModel.find().sort({ createdAt: -1 });
        return coupons.map((c) => c.toObject());
    }

    async updateCoupon(
        id: string,
        data: Partial<ICoupon>
    ): Promise<ICoupon | null> {
        const coupon = await CouponModel.findByIdAndUpdate(id, data, {
            new: true,
            runValidators: true,
        });
        return coupon ? coupon.toObject() : null;
    }

    async deleteCoupon(id: string): Promise<boolean> {
        const result = await CouponModel.findByIdAndDelete(id);
        return !!result;
    }

    /**
     * Validate a coupon code against an order total.
     * Does NOT increment usedCount — that happens at payment time.
     * Returns the discount amount to apply.
     */
    async validateCoupon(
        code: string,
        orderTotal: number,
        items?: { productId: string; price: number; quantity: number }[]
    ): Promise<{ discountAmount: number; couponId: string }> {
        const coupon = await CouponModel.findOne({
            code: code.toUpperCase(),
            isActive: true,
        });

        if (!coupon) {
            throw new Error("COUPON_NOT_FOUND");
        }
        if (coupon.expiredAt < Date.now()) {
            throw new Error("COUPON_EXPIRED");
        }
        if (coupon.maxUsage > 0 && coupon.usedCount >= coupon.maxUsage) {
            throw new Error("COUPON_USAGE_EXCEEDED");
        }
        // minOrderValue always checked against the full order total
        if (coupon.minOrderValue > 0 && orderTotal < coupon.minOrderValue) {
            throw new Error(`COUPON_MIN_ORDER:${coupon.minOrderValue}`);
        }

        // Determine the base amount for discount calculation.
        // If coupon restricts to specific products, only sum those items.
        let discountBase = orderTotal;
        if (
            coupon.applicableProducts &&
            coupon.applicableProducts.length > 0 &&
            items &&
            items.length > 0
        ) {
            const applicableSet = new Set(
                coupon.applicableProducts.map((id) => id.toString())
            );
            const matchingItems = items.filter((item) =>
                applicableSet.has(item.productId)
            );
            if (matchingItems.length === 0) {
                throw new Error("COUPON_NO_APPLICABLE_PRODUCTS");
            }
            discountBase = matchingItems.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0
            );
        }

        let discountAmount = 0;
        if (coupon.type === "percent") {
            discountAmount = Math.floor((discountBase * coupon.value) / 100);
            if (coupon.maxDiscount > 0) {
                discountAmount = Math.min(discountAmount, coupon.maxDiscount);
            }
        } else {
            // fixed
            discountAmount = Math.min(coupon.value, discountBase);
        }

        return { discountAmount, couponId: String(coupon._id) };
    }

    /**
     * Atomically increment usedCount. Called at payment creation time.
     */
    async incrementUsedCount(code: string): Promise<void> {
        await CouponModel.findOneAndUpdate(
            { code: code.toUpperCase() },
            { $inc: { usedCount: 1 } }
        );
    }
}

export const couponService = new CouponService();
