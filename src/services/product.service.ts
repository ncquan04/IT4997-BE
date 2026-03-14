import { Request, Response } from "express";
import mongoose from "mongoose";
import CategoryModel from "../models/category-model.mongo";
import ProductModel from "../models/product-model.mongo";
import { Contacts } from "../shared/contacts";
import { getArray, setArray, deleteKeysByPattern } from "../cache/redisUtils";
import { notificationService } from "./notification.service";

const STATUS_EVALUATION = Contacts.Status.Evaluation;
const LIMIT = 20;

export const addProduct = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const {
            title,
            brand,
            description,
            descriptionDetail,
            specifications,
            variants,
            categoryId,
            isHide,
            rating,
        } = req.body;

        const category = await CategoryModel.findById(categoryId);
        if (!category) {
            res.status(400).json({
                success: false,
                message: "Category does not exist",
            });
        }
        // 3. Tạo một instance mới của ProductModel
        const newProduct = new ProductModel({
            title,
            brand,
            description,
            descriptionDetail,
            specifications,
            variants,
            categoryId,
            isHide,
            rating,
        });

        // 4. Lưu vào database
        const savedProduct = await newProduct.save();

        await deleteKeysByPattern('products:base_mapped:*');

        notificationService.pushNotification(
            "PRODUCT",
            "Product created",
            `ProductId #${savedProduct._id.toString()} created successfully`,
            savedProduct._id.toString(),
            userId
        );

        return res.status(201).json({
            success: true,
            message: "Add product successfully",
            data: savedProduct,
        });
    } catch (error: any) {
        if (error.keyPattern && error.keyPattern["variants.sku"]) {
            return res.status(409).json({
                // 409 Conflict
                success: false,
                message: "SKU already exists in another product variant.",
            });
        }
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

export const getAllProducts = async (req: Request, res: Response) => {
    try {
        const { page, sort, idCategory, minPrice, maxPrice } = req.query;
        if (page && isNaN(Number(page))) {
            return res.status(400).json({ message: "Invalid page number" });
        }
        if (!mongoose.isValidObjectId(idCategory) && idCategory) {
            return res.status(400).json({ message: "Invalid category id" });
        }

        let limitNum = LIMIT;
        const pageNum = Math.max(Number(page) || 1, 1);
        const skip = (Number(pageNum) - 1) * Number(limitNum);

        const cacheKey = `products:base_mapped:${idCategory || "all"}:sort:${
            sort || "default"
        }`;
        let processProduct = await getArray<any>(cacheKey);

        if (!processProduct) {
            const filter: any = { isHide: STATUS_EVALUATION.PUBLIC };
            if (idCategory) {
                // const listCategory = Array.isArray(idCategory) ? idCategory : [idCategory];
                filter.categoryId = idCategory;
            }

            const products = await ProductModel.find(filter).lean();

            processProduct = products.map((e) => e);

            if (sort === Contacts.Sort.PRICE_ASC) {
                processProduct.sort(
                    (a, b) => (a.salePricePre || 0) - (b.salePricePre || 0)
                );
            } else if (sort === Contacts.Sort.PRICE_DESC) {
                processProduct.sort(
                    (a, b) => (b.salePricePre || 0) - (a.salePricePre || 0)
                );
            }
            await setArray<any>(cacheKey, processProduct, 3600);
        } else {
            console.log("CACHE HIT - products base mapped");
        }

        if (minPrice) {
            processProduct = processProduct.filter(
                (p) =>
                    p.salePricePre !== null &&
                    p.salePricePre >= Number(minPrice)
            );
        }
        if (maxPrice) {
            processProduct = processProduct.filter(
                (p) =>
                    p.salePricePre !== null &&
                    p.salePricePre <= Number(maxPrice)
            );
        }

        const total = processProduct.length;
        const pageData = processProduct.slice(skip, skip + limitNum);
        res.status(200).json({
            data: pageData,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch products", error });
    }
};

export const getProductById = async (req: Request, res: Response) => {
    try {
        const productId = req.params.id;

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({ message: "Invalid product id" });
        }
        const product = await ProductModel.findOne({
            _id: productId,
            isHide: STATUS_EVALUATION.PUBLIC,
        }).lean();

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        res.status(200).json(product);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch product", error });
    }
};

export const updateProduct = async (req: Request, res: Response) => {
    try {
        const productId = req.params.id;
        const userId = (req as any).user.id;

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({ message: "Invalid product id" });
        }

        const updateData = req.body;
        const updatedProduct = await ProductModel.findByIdAndUpdate(
            productId,
            updateData,
            {
                new: true,
                runValidators: true,
                context: "query",
            }
        ).lean();

        if (!updatedProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        await deleteKeysByPattern('products:base_mapped:*');
        notificationService.pushNotification(
            "PRODUCT",
            "Product Update",
            `ProductId #${updatedProduct._id.toString()} updated successfully`,
            updatedProduct._id.toString(),
            userId
        );
        res.status(200).json(updatedProduct);
    } catch (error) {
        res.status(500).json({ message: "Failed to update product", error });
    }
};

export const changeProductStatus = async (req: Request, res: Response) => {
    try {
        const productId = req.params.id;
        const userId = (req as any).user.id;

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({ message: "Invalid product id" });
        }

        const { to } = req.body;

        const allowedStatuses = [
            Contacts.Status.Evaluation.CREATE,
            Contacts.Status.Evaluation.PUBLIC,
            Contacts.Status.Evaluation.HIDE,
        ];
        const reverseStatus = (statusGroup: Record<string, number>) =>
            Object.fromEntries(
                Object.entries(statusGroup).map(([k, v]) => [v, k])
            );

        const EvaluationStatusName = reverseStatus(Contacts.Status.Evaluation);
        // Kiểm tra "to" có hợp lệ không
        if (!allowedStatuses.includes(to)) {
            return res.status(400).json({
                message: "Invalid status value",
                allowed: allowedStatuses,
            });
        }

        const status = EvaluationStatusName[to];

        // Cập nhật trực tiếp
        const updatedProduct = await ProductModel.findByIdAndUpdate(
            productId,
            { isHide: to },
            { new: true, runValidators: true, context: "query" }
        ).lean();
        if (!updatedProduct) {
            return res.status(404).json({ message: "Product not found" });
        }
        await deleteKeysByPattern('products:base_mapped:*');
        notificationService.pushNotification(
            "PRODUCT",
            "Product Update",
            `ProductId #${updatedProduct._id.toString()} updated successfully`,
            updatedProduct._id.toString(),
            userId
        );

        res.status(200).json({
            message: `Change status to ${status} successfully`,
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to change status", error });
    }
};
