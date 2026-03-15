import { Document, Model, model, Schema } from "mongoose";
import { IUser, UserRole } from "../shared/models/user-model";
import { branchTableName } from "./branch-model.mongo";

export const userTableName = "User";

const ObjectId = Schema.Types.ObjectId;

export interface UserModelDocument extends IUser, Document {
    _id: any;
}

export interface IUserModel extends Model<UserModelDocument> {}

const userSchema = new Schema<UserModelDocument>(
    {
        role: {
            type: String,
            enum: Object.values(UserRole),
            default: UserRole.USER,
        },
        userName: { type: String, required: true },
        password: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        phoneNumber: { type: String, required: true },
        address: { type: [String], default: [] },
        dateOfBirth: { type: Number },
        verifyCode: { type: String },
        branchId: { type: ObjectId as any, ref: branchTableName },
    },
    { versionKey: false, timestamps: true }
);

const UserModel = model<UserModelDocument, IUserModel>(
    userTableName,
    userSchema
);

export default UserModel;
