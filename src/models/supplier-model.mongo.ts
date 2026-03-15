import { Document, Model, model, Schema } from "mongoose";
import { ISupplier } from "../shared/models/supplier-model";

export const supplierTableName = "Supplier";

export interface SupplierModelDocument extends ISupplier, Document {
    _id: any;
}

export interface ISupplierModel extends Model<SupplierModelDocument> {}

const supplierSchema = new Schema<SupplierModelDocument>(
    {
        name: { type: String, required: true },
        contactPerson: { type: String, required: true },
        phone: { type: String, required: true },
        email: { type: String, required: true },
        address: { type: String, required: true },
    },
    { versionKey: false, timestamps: true }
);

const SupplierModel = model<SupplierModelDocument, ISupplierModel>(
    supplierTableName,
    supplierSchema
);

export default SupplierModel;
