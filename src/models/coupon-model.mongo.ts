import { Document, Model, model, Schema } from "mongoose";
import { ICoupon } from "../shared/models/coupon-model";

export const couponTableName = "Coupon";

export interface CouponModelDocument extends ICoupon, Document {
    _id: any;
}

export interface ICouponModel extends Model<CouponModelDocument> {}

const couponSchema = new Schema<CouponModelDocument>(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },
        type: { type: String, enum: ["percent", "fixed"], required: true },
        value: { type: Number, required: true, min: 0 },
        minOrderValue: { type: Number, required: true, min: 0, default: 0 },
        maxDiscount: { type: Number, required: true, min: 0, default: 0 },
        maxUsage: { type: Number, required: true, min: 0, default: 0 },
        usedCount: { type: Number, required: true, min: 0, default: 0 },
        expiredAt: { type: Number, required: true },
        isActive: { type: Boolean, required: true, default: true },
        applicableProducts: { type: [String], default: [] },
    },
    { versionKey: false, timestamps: true }
);

couponSchema.index({ code: 1 });

const CouponModel = model<CouponModelDocument, ICouponModel>(
    couponTableName,
    couponSchema
);

export default CouponModel;
