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
    },
    { versionKey: false, timestamps: true }
);

const BranchModel = model<BranchModelDocument, IBranchModel>(
    branchTableName,
    branchSchema
);

export default BranchModel;
