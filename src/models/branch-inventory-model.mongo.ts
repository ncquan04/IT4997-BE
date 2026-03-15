import { Document, Model, model, Schema } from "mongoose";
import { IBranchInventory } from "../shared/models/branch-inventory-model";
import { branchTableName } from "./branch-model.mongo";
import { productTableName } from "./product-model.mongo";

export const branchInventoryTableName = "BranchInventory";

const ObjectId = Schema.Types.ObjectId;

export interface BranchInventoryModelDocument
    extends IBranchInventory, Document {
    _id: any;
}

export interface IBranchInventoryModel extends Model<BranchInventoryModelDocument> {}

const branchInventorySchema = new Schema<BranchInventoryModelDocument>(
    {
        branchId: {
            type: ObjectId as any,
            ref: branchTableName,
            required: true,
        },
        productId: {
            type: ObjectId as any,
            ref: productTableName,
            required: true,
        },
        variantId: { type: ObjectId as any, required: true },
        quantity: { type: Number, required: true, default: 0, min: 0 },
        imeiList: { type: [String], default: [] },
    },
    { versionKey: false, timestamps: true }
);

branchInventorySchema.index(
    { branchId: 1, productId: 1, variantId: 1 },
    { unique: true }
);

const BranchInventoryModel = model<
    BranchInventoryModelDocument,
    IBranchInventoryModel
>(branchInventoryTableName, branchInventorySchema);

export default BranchInventoryModel;
