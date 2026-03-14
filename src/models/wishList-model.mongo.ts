import { Document, Model, Schema, model } from "mongoose";
import { IWishlist, IWishlistItem } from "../shared/models/wishList-model";
import { productTableName } from "./product-model.mongo";

export const wishlistTableName = "Wishlist";

export interface WishlistDocument extends IWishlist, Document {
  _id: any;
}


export interface IWishlistModel extends Model<WishlistDocument> {}


const wishlistItemSchema = new Schema<IWishlistItem>(
  {
    productId: {
      type: Schema.Types.ObjectId as any,
      ref: productTableName,
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);



const wishlistSchema = new Schema<WishlistDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId as any,
      required: true,
      unique: true, // one wishlist per user
    },
    items: {
      type: [wishlistItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
wishlistSchema.index({ userId: 1 });

wishlistSchema.index({ "items.productId": 1 });


const WishlistModel = model<WishlistDocument, IWishlistModel>(
  wishlistTableName,
  wishlistSchema
);

export default WishlistModel;
