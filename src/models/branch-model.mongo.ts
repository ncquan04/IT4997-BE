import { Document, Model, model, Schema } from "mongoose";
import { IBranch } from "../shared/models/branch-model";

export const branchTableName = "Branch";

const ObjectId = Schema.Types.ObjectId;

export interface BranchModelDocument extends IBranch, Document {
    _id: any;
}

export interface IBranchModel extends Model<BranchModelDocument> {}

const branchSchema = new Schema<BranchModelDocument>(
    {
        name: { type: String, required: true },
        address: { type: String, required: true },
        phone: { type: String, required: true },
        managerId: { type: ObjectId as any, ref: "User", required: true },
        isActive: { type: Boolean, default: true },
        rentCost: { type: Number, default: 0 },
        rentCostHistory: {
            type: [
                {
                    amount: { type: Number, required: true, min: 0 },
                    effectiveFrom: { type: Date, required: true },
                    note: { type: String },
                },
            ],
            default: [],
        },
    },
    { versionKey: false, timestamps: true }
);

const BranchModel = model<BranchModelDocument, IBranchModel>(
    branchTableName,
    branchSchema
);

export default BranchModel;
