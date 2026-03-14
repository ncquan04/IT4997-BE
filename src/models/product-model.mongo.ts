import { Document, Model, model, Schema } from "mongoose";
import { IProduct } from "../shared/models/product-model";
import { Contacts } from "../shared/contacts";
import { categoryTableName } from "./category-model.mongo";

const STATUS_EVALUATION = Contacts.Status.Evaluation;
const ObjectId = Schema.Types.ObjectId;

export const productTableName = "Product";

export interface ISpecItem {
    key: string;
    value: string;
}
const specItemSchema = new Schema<ISpecItem>(
    {
        key: { type: String, required: true },
        value: { type: String, required: true },
    },
    { _id: false }
);

export interface IProductVariant {
    version: string;
    colorName: string;
    hexcode: string;
    images: string[];
    quantity: number;
    price: number;
    salePrice?: number;
    sku: string;
}

const productVariantSchema = new Schema<IProductVariant>({
    version: { type: String, required: true },
    colorName: { type: String, required: true },
    hexcode: { type: String, required: true },
    images: [{ type: String }],
    quantity: { type: Number, default: 0 },
    price: { type: Number, required: true },
    salePrice: { type: Number },
    sku: { type: String, required: true, unique: true },
});
export interface ProductModelDocument extends IProduct, Document {
    _id: any;
}

export interface IProductModel extends Model<ProductModelDocument> {}

const productSchema = new Schema<ProductModelDocument>(
    {
        title: { type: String, required: true },
        brand: { type: String, required: true },
        description: { type: String, required: true },
        descriptionDetail: { type: String, required: true },
        specifications: {
            type: [specItemSchema],
            default: [],
        },
        variants: {
            type: [productVariantSchema],
            default: [],
        },
        categoryId: {
            type: ObjectId as any,
            ref: categoryTableName,
            required: true,
        },
        isHide: {
            type: Number,
            required: false,
            default: STATUS_EVALUATION.HIDE,
        },
        rating: { type: Number, default: null },
    },
    { versionKey: false, timestamps: true }
);

const ProductModel = model<ProductModelDocument, IProductModel>(
    productTableName,
    productSchema
);

export default ProductModel;
