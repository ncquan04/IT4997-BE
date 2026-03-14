import { Document, Model, model, Schema } from "mongoose";
import { IUser, UserRole } from "../shared/models/user-model";

export const userTableName = "User";

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
    },
    { versionKey: false, timestamps: true }
);

const UserModel = model<UserModelDocument, IUserModel>(
    userTableName,
    userSchema
);

export default UserModel;
