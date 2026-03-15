import connectDatabase from "./connectDB";
import { readFileSync } from "fs";
import { resolve } from "path";

import CategoryModel from "../models/category-model.mongo";
import ProductModel from "../models/product-model.mongo";
import UserModel from "../models/user-model.mongo";
import BranchModel from "../models/branch-model.mongo";
import SupplierModel from "../models/supplier-model.mongo";
import BranchInventoryModel from "../models/branch-inventory-model.mongo";

const DATA_DIR = resolve(__dirname, "../../data");

function loadJSON(fileName: string) {
    const filePath = resolve(DATA_DIR, fileName);
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
}

async function insertBatch(model: any, data: any[], batchSize: number, label: string) {
    let inserted = 0;
    for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        await model.insertMany(batch, { ordered: false });
        inserted += batch.length;
        if (inserted % (batchSize * 10) === 0 || inserted === data.length) {
            console.log(`  [${label}] ${inserted}/${data.length} ...`);
        }
    }
    return inserted;
}

async function main() {
    try {
        await connectDatabase();
        console.log("=== BẮT ĐẦU IMPORT DỮ LIỆU ===\n");

        // 1. Categories
        console.log("1. Xoá & import Categories...");
        await CategoryModel.deleteMany({});
        const categories = loadJSON("categories.json");
        await CategoryModel.insertMany(categories);
        console.log(`   ✅ Đã import ${categories.length} categories\n`);

        // 2. Products
        console.log("2. Xoá & import Products...");
        await ProductModel.deleteMany({});
        const products = loadJSON("products.json");
        await ProductModel.insertMany(products);
        console.log(`   ✅ Đã import ${products.length} products\n`);

        // 3. Suppliers
        console.log("3. Xoá & import Suppliers...");
        await SupplierModel.deleteMany({});
        const suppliers = loadJSON("suppliers.json");
        await SupplierModel.insertMany(suppliers);
        console.log(`   ✅ Đã import ${suppliers.length} suppliers\n`);

        // 4. Users
        console.log("4. Xoá & import Users...");
        await UserModel.deleteMany({});
        const users = loadJSON("users.json");
        await UserModel.insertMany(users);
        console.log(`   ✅ Đã import ${users.length} users\n`);

        // 5. Branches
        console.log("5. Xoá & import Branches...");
        await BranchModel.deleteMany({});
        const branches = loadJSON("branches.json");
        await BranchModel.insertMany(branches);
        console.log(`   ✅ Đã import ${branches.length} branches\n`);

        // 6. Branch Inventory (lớn ~55MB, insert theo batch)
        console.log("6. Xoá & import Branch Inventory (batch mode)...");
        await BranchInventoryModel.deleteMany({});
        const inventory = loadJSON("branch-inventory.json");
        const inventoryCount = await insertBatch(BranchInventoryModel, inventory, 5000, "BranchInventory");
        console.log(`   ✅ Đã import ${inventoryCount} branch inventory records\n`);

        console.log("=== THÀNH CÔNG: Đã import xong toàn bộ dữ liệu ===");
        process.exit(0);
    } catch (error) {
        console.error("❌ Lỗi import:", error);
        process.exit(1);
    }
}

main();
