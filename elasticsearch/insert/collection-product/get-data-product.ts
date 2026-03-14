import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import connectDatabase from "../../../src/utils/connectDB";
import ProductModel from "../../../src/models/product-model.mongo";

async function getAllProducts() {
    try {
        // 1️⃣ Kết nối MongoDB
        await connectDatabase();
        console.log("Connected to MongoDB");

        // 2️⃣ Lấy tất cả document từ collection "products"
        const products = await ProductModel.find({}).lean(); // .lean() để có plain JS object

        console.log(`Found ${products.length} products`);

        // 3️⃣ Ghi ra file products.json
        const filePath = path.join(
            process.cwd(),
            "elasticsearch",
            "insert",
            "collection-product",
            "products.json"
        );
        fs.writeFileSync(filePath, JSON.stringify(products, null, 2), "utf-8");

        console.log(`Products exported to ${filePath}`);
    } catch (err) {
        console.error("Error exporting products:", err);
    } finally {
        // 4️⃣ Disconnect
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    }
}

getAllProducts();
