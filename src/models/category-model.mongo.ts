import { Document, Model, model, Schema } from "mongoose";
import { ICategory } from "../shared/models/category-model";

export const categoryTableName = "Category";

const ObjectId = Schema.Types.ObjectId;

export interface CategoryModelDocument extends ICategory, Document {
    _id: any;
}

export interface ICategoryModel extends Model<CategoryModelDocument> {}

const categorySchema = new Schema<CategoryModelDocument>(
    {
        name: { type: String, required: true },
        description: { type: String },
        imageUrl: { type: String },
        parentCategoryId: { type: ObjectId as any, ref: categoryTableName },
    },
    { versionKey: false, timestamps: true }
);
const CategoryModel = model<CategoryModelDocument, ICategoryModel>(
    categoryTableName,
    categorySchema
);

export default CategoryModel;
