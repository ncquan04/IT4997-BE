import { Request, Response } from "express";
import mongoose from "mongoose";
import BranchInventoryModel from "../models/branch-inventory-model.mongo";
import ProductModel from "../models/product-model.mongo";
import BranchModel from "../models/branch-model.mongo";

const parsePositiveInt = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
};

const parseBooleanQuery = (value: unknown): boolean | null => {
    if (value === undefined) return null;
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
};

const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildZeroQuantitySearchRows = async (
    keyword: string,
    page: number,
    limit: number,
    branchId?: string
) => {
    const safeKeyword = escapeRegExp(keyword);
    const regex = new RegExp(safeKeyword, "i");
    const skip = (page - 1) * limit;

    const [productVariants, totalAgg, branch] = await Promise.all([
        ProductModel.aggregate([
            { $unwind: "$variants" },
            {
                $match: {
                    $or: [
                        { title: { $regex: regex } },
                        { "variants.sku": { $regex: regex } },
                    ],
                },
            },
            { $sort: { title: 1, "variants.sku": 1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    product: {
                        _id: "$_id",
                        title: "$title",
                        brand: "$brand",
                        isHide: "$isHide",
                    },
                    variant: {
                        _id: "$variants._id",
                        variantName: "$variants.variantName",
                        sku: "$variants.sku",
                        price: "$variants.price",
                        salePrice: "$variants.salePrice",
                    },
                },
            },
        ]),
        ProductModel.aggregate([
            { $unwind: "$variants" },
            {
                $match: {
                    $or: [
                        { title: { $regex: regex } },
                        { "variants.sku": { $regex: regex } },
                    ],
                },
            },
            { $count: "total" },
        ]),
        branchId && mongoose.isValidObjectId(branchId)
            ? BranchModel.findById(branchId).lean()
            : Promise.resolve(null),
    ]);

    const now = new Date().toISOString();
    const items = productVariants.map((entry: any) => ({
        _id: `virtual-${entry.product._id}-${entry.variant._id}${branchId ? `-${branchId}` : ""}`,
        branchId: branchId ?? "",
        productId: String(entry.product._id),
        variantId: String(entry.variant._id),
        quantity: 0,
        imeiList: [],
        createdAt: now,
        updatedAt: now,
        branch: branch
            ? {
                  _id: branch._id,
                  name: branch.name,
                  address: branch.address,
                  phone: branch.phone,
                  isActive: branch.isActive,
              }
            : undefined,
        product: entry.product,
        variant: entry.variant,
    }));

    return {
        items,
        total: totalAgg[0]?.total ?? 0,
    };
};

export const getInventoryList = async (req: Request, res: Response) => {
    try {
        const { branchId, productId, variantId, inStock, search } = req.query;

        const filter: Record<string, unknown> = {};

        if (typeof branchId === "string") {
            if (!mongoose.isValidObjectId(branchId)) {
                return res.status(400).json({ message: "Invalid branchId" });
            }
            filter.branchId = new mongoose.Types.ObjectId(branchId);
        }

        if (typeof productId === "string") {
            if (!mongoose.isValidObjectId(productId)) {
                return res.status(400).json({ message: "Invalid productId" });
            }
            filter.productId = new mongoose.Types.ObjectId(productId);
        }

        if (typeof variantId === "string") {
            if (!mongoose.isValidObjectId(variantId)) {
                return res.status(400).json({ message: "Invalid variantId" });
            }
            filter.variantId = new mongoose.Types.ObjectId(variantId);
        }

        const inStockValue = parseBooleanQuery(inStock);
        if (inStock !== undefined && inStockValue === null) {
            return res.status(400).json({
                message: "Invalid inStock query. Use true or false.",
            });
        }

        if (inStockValue === true) {
            filter.quantity = { $gt: 0 };
        }
        if (inStockValue === false) {
            filter.quantity = { $eq: 0 };
        }

        const page = parsePositiveInt(req.query.page, 1);
        const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
        const skip = (page - 1) * limit;

        const keyword = typeof search === "string" ? search.trim() : "";

        const basePipeline: any[] = [
            { $match: filter },
            {
                $lookup: {
                    from: "branches",
                    localField: "branchId",
                    foreignField: "_id",
                    as: "branch",
                },
            },
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "product",
                },
            },
            {
                $addFields: {
                    branch: { $arrayElemAt: ["$branch", 0] },
                    product: { $arrayElemAt: ["$product", 0] },
                },
            },
            {
                $addFields: {
                    variant: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: "$product.variants",
                                    as: "variant",
                                    cond: {
                                        $eq: [
                                            { $toString: "$$variant._id" },
                                            { $toString: "$variantId" },
                                        ],
                                    },
                                },
                            },
                            0,
                        ],
                    },
                },
            },
        ];

        if (keyword) {
            basePipeline.push({
                $match: {
                    $or: [
                        { "product.title": { $regex: keyword, $options: "i" } },
                        { "variant.sku": { $regex: keyword, $options: "i" } },
                    ],
                },
            });
        }

        const [items, totalAgg] = await Promise.all([
            BranchInventoryModel.aggregate([
                ...basePipeline,
                { $sort: { updatedAt: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $project: {
                        _id: 1,
                        branchId: 1,
                        productId: 1,
                        variantId: 1,
                        quantity: 1,
                        imeiList: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        branch: {
                            _id: "$branch._id",
                            name: "$branch.name",
                            address: "$branch.address",
                            phone: "$branch.phone",
                            isActive: "$branch.isActive",
                        },
                        product: {
                            _id: "$product._id",
                            title: "$product.title",
                            brand: "$product.brand",
                            isHide: "$product.isHide",
                        },
                        variant: {
                            _id: "$variant._id",
                            variantName: "$variant.variantName",
                            sku: "$variant.sku",
                            price: "$variant.price",
                            salePrice: "$variant.salePrice",
                        },
                    },
                },
            ]),
            BranchInventoryModel.aggregate([
                ...basePipeline,
                { $count: "total" },
            ]),
        ]);

        const total = totalAgg[0]?.total ?? 0;

        if (keyword && total === 0) {
            const fallback = await buildZeroQuantitySearchRows(
                keyword,
                page,
                limit,
                typeof branchId === "string" ? branchId : undefined
            );

            return res.status(200).json({
                items: fallback.items,
                pagination: {
                    page,
                    limit,
                    total: fallback.total,
                    totalPages: Math.ceil(fallback.total / limit),
                },
            });
        }

        return res.status(200).json({
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch inventory list",
            error,
        });
    }
};

export const getInventoryById = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id);

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid inventory id" });
        }

        const items = await BranchInventoryModel.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(id) } },
            {
                $lookup: {
                    from: "branches",
                    localField: "branchId",
                    foreignField: "_id",
                    as: "branch",
                },
            },
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "product",
                },
            },
            {
                $addFields: {
                    branch: { $arrayElemAt: ["$branch", 0] },
                    product: { $arrayElemAt: ["$product", 0] },
                },
            },
            {
                $addFields: {
                    variant: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: "$product.variants",
                                    as: "variant",
                                    cond: {
                                        $eq: [
                                            { $toString: "$$variant._id" },
                                            { $toString: "$variantId" },
                                        ],
                                    },
                                },
                            },
                            0,
                        ],
                    },
                },
            },
            {
                $project: {
                    _id: 1,
                    branchId: 1,
                    productId: 1,
                    variantId: 1,
                    quantity: 1,
                    imeiList: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    branch: {
                        _id: "$branch._id",
                        name: "$branch.name",
                        address: "$branch.address",
                        phone: "$branch.phone",
                        isActive: "$branch.isActive",
                    },
                    product: {
                        _id: "$product._id",
                        title: "$product.title",
                        brand: "$product.brand",
                        isHide: "$product.isHide",
                    },
                    variant: {
                        _id: "$variant._id",
                        variantName: "$variant.variantName",
                        sku: "$variant.sku",
                        price: "$variant.price",
                        salePrice: "$variant.salePrice",
                    },
                },
            },
        ]);

        const inventoryItem = items[0];

        if (!inventoryItem) {
            return res
                .status(404)
                .json({ message: "Inventory item not found" });
        }

        return res.status(200).json(inventoryItem);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch inventory item",
            error,
        });
    }
};
