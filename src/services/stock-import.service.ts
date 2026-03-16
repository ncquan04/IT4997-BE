import { Request, Response } from "express";
import mongoose from "mongoose";
import BranchModel from "../models/branch-model.mongo";
import ProductModel from "../models/product-model.mongo";
import StockImportModel from "../models/stock-import-model.mongo";
import SupplierModel from "../models/supplier-model.mongo";
import { Contacts } from "../shared/contacts";

type AuthenticatedRequest = Request & {
    user?: {
        id: string;
        role: string;
        email: string;
    };
};

const STATUS_STOCK = Contacts.Status.Stock;
const validStockStatuses = Object.values(STATUS_STOCK) as number[];

const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);

const parsePositiveInt = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
};

type StockImportRequestItem = {
    productId: string;
    variantId: string;
    unitCost: number;
    imeiList: string[];
};

type StockImportRequestBody = {
    branchId: string;
    supplierId: string;
    note?: string;
    items: StockImportRequestItem[];
};

const normalizeItemsByImei = (items: StockImportRequestItem[]) => {
    return items.map((item) => {
        const normalizedImeiList = (item.imeiList ?? [])
            .map((imei) => imei.trim())
            .filter(Boolean);

        return {
            ...item,
            imeiList: normalizedImeiList,
            quantity: normalizedImeiList.length,
        };
    });
};

export const createStockImport = async (req: Request, res: Response) => {
    try {
        const request = req as AuthenticatedRequest;
        const userId = request.user?.id;

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { branchId, supplierId, items, note } =
            req.body as StockImportRequestBody;

        const normalizedItems = normalizeItemsByImei(items);

        if (normalizedItems.some((item) => item.quantity <= 0)) {
            return res.status(400).json({
                message:
                    "Each stock import item must contain at least one IMEI",
            });
        }

        const [branch, supplier] = await Promise.all([
            BranchModel.findById(branchId).lean(),
            SupplierModel.findById(supplierId).lean(),
        ]);

        if (!branch) {
            return res.status(400).json({ message: "Branch does not exist" });
        }

        if (!supplier) {
            return res.status(400).json({ message: "Supplier does not exist" });
        }

        const productIds = Array.from(
            new Set(normalizedItems.map((item) => item.productId))
        );

        const products = await ProductModel.find({
            _id: { $in: productIds.map(toObjectId) },
        }).lean();

        const productMap = new Map(
            products.map((product) => [String(product._id), product])
        );

        for (const item of normalizedItems) {
            const product = productMap.get(item.productId);
            if (!product) {
                return res.status(400).json({
                    message: `Product does not exist: ${item.productId}`,
                });
            }

            const hasVariant = product.variants.some(
                (variant: any) => String(variant._id) === item.variantId
            );

            if (!hasVariant) {
                return res.status(400).json({
                    message: `Variant does not belong to product: ${item.variantId}`,
                });
            }
        }

        const totalCost = normalizedItems.reduce(
            (sum: number, item) => sum + item.quantity * item.unitCost,
            0
        );

        const stockImport = await StockImportModel.create({
            branchId,
            supplierId,
            items: normalizedItems,
            note: note ?? "",
            status: STATUS_STOCK.PENDING,
            createdBy: userId,
            totalCost,
        });

        return res.status(201).json({
            message: "Stock import created successfully",
            data: stockImport,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to create stock import",
            error,
        });
    }
};

export const getStockImportList = async (req: Request, res: Response) => {
    try {
        const { branchId, status } = req.query;

        const filter: Record<string, unknown> = {};

        if (typeof branchId === "string") {
            if (!mongoose.isValidObjectId(branchId)) {
                return res.status(400).json({ message: "Invalid branchId" });
            }
            filter.branchId = new mongoose.Types.ObjectId(branchId);
        }

        if (typeof status === "string") {
            const statusNum = Number(status);
            if (
                !Number.isFinite(statusNum) ||
                !validStockStatuses.includes(statusNum)
            ) {
                return res.status(400).json({ message: "Invalid status" });
            }
            filter.status = statusNum;
        }

        const page = parsePositiveInt(req.query.page, 1);
        const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            StockImportModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("branchId", "name address phone isActive")
                .populate("createdBy", "userName email role")
                .lean(),
            StockImportModel.countDocuments(filter),
        ]);

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
            message: "Failed to fetch stock imports",
            error,
        });
    }
};

export const getStockImportById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid stock import id" });
        }

        const stockImport = await StockImportModel.findById(id)
            .populate("branchId", "name address phone isActive")
            .populate("supplierId", "name contactPerson phone email address")
            .populate("createdBy", "userName email role")
            .lean();

        if (!stockImport) {
            return res.status(404).json({ message: "Stock import not found" });
        }

        return res.status(200).json(stockImport);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch stock import detail",
            error,
        });
    }
};
