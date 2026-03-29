import { Document, Model, model, Schema } from "mongoose";
import { IDiscountProgram } from "../shared/models/discount-program-model";

export const discountProgramTableName = "DiscountProgram";

export interface DiscountProgramDocument extends IDiscountProgram, Document {
    _id: any;
}

export interface IDiscountProgramModel extends Model<DiscountProgramDocument> {}

const discountProgramSchema = new Schema<DiscountProgramDocument>(
    {
        name: { type: String, required: true, trim: true },
        type: { type: String, enum: ["percent", "fixed"], required: true },
        value: { type: Number, required: true, min: 0 },
        maxDiscount: { type: Number, required: true, min: 0, default: 0 },
        scope: {
            type: String,
            enum: ["product", "category", "all"],
            required: true,
        },
        applicableIds: { type: [String], default: [] },
        startAt: { type: Number, required: true },
        endAt: { type: Number, required: true },
        isActive: { type: Boolean, required: true, default: true },
    },
    { versionKey: false, timestamps: true }
);

discountProgramSchema.index({ isActive: 1, startAt: 1, endAt: 1 });

const DiscountProgramModel = model<
    DiscountProgramDocument,
    IDiscountProgramModel
>(discountProgramTableName, discountProgramSchema);

export default DiscountProgramModel;
