import connectDatabase from "./connectDB";
import categoriesJson from "../../crawl/category.json";
import mobileJson from "../../crawl/mobile.json"
import tabletJson from "../../crawl/table.json"
import laptopJson from "../../crawl/mac.json"
import watchJson from "../../crawl/watch.json"

import CategoryModel from "../models/category-model.mongo"
import ProductModel from "../models/product-model.mongo"
import { ICategory } from "../shared/models/category-model";
import { IProduct } from "../shared/models/product-model";
import { writeFile } from "fs/promises";
import {Schema, Types} from "mongoose"



function transformcateID(data: IProduct[], categoryId: Types.ObjectId | string){
    if (!Array.isArray(data)) {
        console.warn(`⚠️ CẢNH BÁO: Data truyền vào không phải là mảng! (CategoryID: ${categoryId})`);
        return [];
    }
    const newData = data.map((item) => {
                return {
                    ...item,
                    categoryId: categoryId
                };
            });
    return newData;
}

async function processInsertData(cate: ICategory){
    switch(cate.name){
        case "Điện thoại":
            const mobile = mobileJson as IProduct[];
            const mobileData = transformcateID(mobile, cate._id);
            await ProductModel.insertMany(mobileData);
            // console.log(`  - Đã import ${mobileData.length} điện thoại`);   
            break;
        case "Tablet":
            const tablet = tabletJson as IProduct[];
            const tabletData = transformcateID(tablet, cate._id);
            await ProductModel.insertMany(tabletData);
            // console.log(`  - Đã import ${tabletData.length} tablet`);
            break;
        case "Đồng hồ":
            const watch = watchJson as IProduct[];
            const watchData = transformcateID(watch, cate._id);
            await ProductModel.insertMany(watchData);
            break;
        case "Laptop":
            const laptop = laptopJson as IProduct[];
            const laptopData = transformcateID(laptop, cate._id);
            await ProductModel.insertMany(laptopData);
            break;
    }
}

async function main() {
    try{
        // insert category data

        await connectDatabase();
        const categories = categoriesJson as ICategory[];
        await CategoryModel.deleteMany({});
    
        const categoriesRes = await CategoryModel.insertMany(categories);
        // console.log("insert successffuly with", categories)

        // await writeFile("data/categories", new Buffer([categoriesRes]))

        await ProductModel.deleteMany({});
        // await ProductModel.

        for (const cate of categoriesRes){
            await processInsertData(cate)
        }

        console.log("=== THÀNH CÔNG: Đã import xong toàn bộ dữ liệu ===");
        process.exit(0);
    
    }catch(error){
        console.log("Loi insert",error);
        process.exit(1)
    }
}

main();
