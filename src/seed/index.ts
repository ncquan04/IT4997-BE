import connectDatabase from "../utils/connectDB";
import UserModel from "../models/user-model.mongo";
import bcrypt from "bcrypt";
import { UserRole } from "../shared/models/user-model";
import mongoose from "mongoose";

async function main() {
    try {
        await connectDatabase();

        const hashedPassword = await bcrypt.hash("admin123", 10);

        await UserModel.create({
            userName: "Admin",
            password: hashedPassword,
            role: UserRole.ADMIN,
            email: "admin@gmail.com",
            phoneNumber: "0123456789",
            dateOfBirth: new Date("1990-01-01"),
        });

        console.log("✅ Admin user created");
    } catch (error) {
        console.error("❌ Error creating admin:", error);
    } finally {
        await mongoose.disconnect();
    }
}

main();
