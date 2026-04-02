import { Document, Model, model, Schema } from "mongoose";
import {
    IMemberTierConfig,
    MemberTier,
} from "../shared/models/member-tier-config-model";

export const memberTierConfigTableName = "MemberTierConfig";

export interface MemberTierConfigDocument extends IMemberTierConfig, Document {
    _id: any;
}

export interface IMemberTierConfigModel extends Model<MemberTierConfigDocument> {}

const memberTierConfigSchema = new Schema<MemberTierConfigDocument>(
    {
        tier: {
            type: String,
            enum: Object.values(MemberTier),
            required: true,
            unique: true,
        },
        minSpent: { type: Number, required: true, min: 0 },
        discountPercent: { type: Number, required: true, min: 0, max: 100 },
        isActive: { type: Boolean, default: true },
    },
    { versionKey: false, timestamps: true }
);

const MemberTierConfigModel = model<
    MemberTierConfigDocument,
    IMemberTierConfigModel
>(memberTierConfigTableName, memberTierConfigSchema);

export default MemberTierConfigModel;
