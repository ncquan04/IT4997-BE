import { Document, Model, model, Schema } from "mongoose";
import { ICart } from "../shared/models/cart-model";
import { userTableName } from "./user-model.mongo";
import { productTableName } from "./product-model.mongo";

export const cartTableName = "Cart";

export interface CartModelDocument extends ICart, Document {
    _id: any;
}

export interface ICartModel extends Model<CartModelDocument> {}

const cartSchema = new Schema<CartModelDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId as any,
            required: true,
            ref: userTableName,
        },
        productId: {
            type: Schema.Types.ObjectId as any,
            required: true,
            ref: productTableName,
        },
        variantId: {
            type: Schema.Types.ObjectId as any, 
            required: true, 
        },
        quantity: { type: Number, required: true },
    },
    { timestamps: true, versionKey: false }
);
const CartModel = model<CartModelDocument, ICartModel>(
    cartTableName,
    cartSchema
);

export default CartModel;
