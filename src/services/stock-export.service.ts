import { Request, Response } from "express";
import mongoose from "mongoose";
import BranchInventoryModel from "../models/branch-inventory-model.mongo";
import BranchModel from "../models/branch-model.mongo";
import ProductModel from "../models/product-model.mongo";
import StockExportModel, {
    StockExportModelDocument,
} from "../models/stock-export-model.mongo";
import { Contacts } from "../shared/contacts";
import { parsePositiveInt } from "../utils";

type AuthenticatedRequest = Request & {
    user?: { id: string; role: string; email: string };
};

const STATUS_STOCK = Contacts.Status.Stock;
const validStockStatuses = Object.values(STATUS_STOCK) as number[];
const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);

// Allowed manual transitions (for manually-created exports, Case 2)
const ALLOWED_TRANSITIONS: Record<number, number[]> = {
    [STATUS_STOCK.PENDING]: [STATUS_STOCK.COMPLETED, STATUS_STOCK.CANCELLED],
};

export type ImeiAssignment = {
    productId: string;
    variantId: string;
    imeiList: string[];
    branchId: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper — validate that every IMEI in the assignment exists in the
// BranchInventory record for that (branchId, productId, variantId).
// Throws with a descriptive message on failure.
// Must be called inside a session so the inventory read is consistent.
// ─────────────────────────────────────────────────────────────────────────────
const validateImeiAvailability = async (
    branchId: string,
    assignments: Omit<ImeiAssignment, "branchId">[],
    session: mongoose.ClientSession
) => {
    for (const assignment of assignments) {
        if (assignment.imeiList.length === 0) {
            throw new Error(
                `imeiList cannot be empty for productId=${assignment.productId} variantId=${assignment.variantId}`
            );
        }

        const inventory = await BranchInventoryModel.findOne(
            {
                branchId: toObjectId(branchId),
                productId: toObjectId(assignment.productId),
                variantId: toObjectId(assignment.variantId),
            },
            { quantity: 1, imeiList: 1 }
        ).session(session);

        if (!inventory) {
            throw new Error(
                `No inventory found for productId=${assignment.productId} variantId=${assignment.variantId} in branch ${branchId}`
            );
        }

        if (inventory.quantity < assignment.imeiList.length) {
            throw new Error(
                `Insufficient stock for productId=${assignment.productId} variantId=${assignment.variantId}. Available: ${inventory.quantity}, requested: ${assignment.imeiList.length}`
            );
        }

        const inventoryImeiSet = new Set(inventory.imeiList as string[]);
        for (const imei of assignment.imeiList) {
            if (!inventoryImeiSet.has(imei)) {
                throw new Error(
                    `IMEI ${imei} is not present in inventory for productId=${assignment.productId} variantId=${assignment.variantId}`
                );
            }
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper — deduct inventory for a completed export.
// Must be called inside an active session.
// ─────────────────────────────────────────────────────────────────────────────
const deductInventory = async (
    branchId: string,
    assignments: Omit<ImeiAssignment, "branchId">[],
    session: mongoose.ClientSession
) => {
    for (const assignment of assignments) {
        await BranchInventoryModel.findOneAndUpdate(
            {
                branchId: toObjectId(branchId),
                productId: toObjectId(assignment.productId),
                variantId: toObjectId(assignment.variantId),
            },
            {
                $inc: { quantity: -assignment.imeiList.length },
                $pull: { imeiList: { $in: assignment.imeiList } },
            },
            { session }
        );
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CASE 1 — Called internally from the order shipping endpoint.
// imeiAssignments each carry a branchId so items may span multiple branches.
// Creates one StockExport per branch (all linked to the same orderId) and
// deducts BranchInventory for each. Runs inside the caller-provided session.
// ─────────────────────────────────────────────────────────────────────────────
export const createStockExportFromOrder = async (
    orderId: string,
    createdBy: string,
    imeiAssignments: ImeiAssignment[],
    session: mongoose.ClientSession
) => {
    // Group assignments by branchId
    const byBranch = new Map<string, Omit<ImeiAssignment, "branchId">[]>();
    for (const a of imeiAssignments) {
        const list = byBranch.get(a.branchId) ?? [];
        list.push({
            productId: a.productId,
            variantId: a.variantId,
            imeiList: a.imeiList,
        });
        byBranch.set(a.branchId, list);
    }

    const stockExports: StockExportModelDocument[] = [];
    for (const [branchId, assignments] of byBranch) {
        await validateImeiAvailability(branchId, assignments, session);

        const items = assignments.map((a) => ({
            productId: toObjectId(a.productId),
            variantId: toObjectId(a.variantId),
            quantity: a.imeiList.length,
            imeiList: a.imeiList,
        }));

        const [stockExport] = await StockExportModel.create(
            [
                {
                    branchId: toObjectId(branchId),
                    items,
                    reason: Contacts.ExportReason.ONLINE_SALE,
                    orderId: toObjectId(orderId),
                    createdBy: toObjectId(createdBy),
                    note: "",
                    status: STATUS_STOCK.COMPLETED,
                },
            ],
            { session }
        );

        await deductInventory(branchId, assignments, session);
        stockExports.push(stockExport);
    }

    return stockExports;
};

// ─────────────────────────────────────────────────────────────────────────────
// CASE 2 — Manual export creation via API (creates a PENDING record).
// ─────────────────────────────────────────────────────────────────────────────
export const createStockExport = async (req: Request, res: Response) => {
    try {
        const request = req as AuthenticatedRequest;
        const userId = request.user?.id;

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { branchId, reason, note, items } = req.body as {
            branchId: string;
            reason: string;
            note?: string;
            items: ImeiAssignment[];
        };

        const effectiveBranchId: string =
            (req as any).targetBranchId ?? branchId;

        if (!effectiveBranchId) {
            return res.status(400).json({ message: "branchId is required" });
        }

        if (!Object.values(Contacts.ExportReason).includes(reason as any)) {
            return res.status(400).json({ message: "Invalid export reason" });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res
                .status(400)
                .json({ message: "items must be a non-empty array" });
        }

        const branch = await BranchModel.findById(effectiveBranchId).lean();
        if (!branch) {
            return res.status(400).json({ message: "Branch does not exist" });
        }

        // Validate products and variants exist
        const productIds = Array.from(new Set(items.map((i) => i.productId)));
        const products = await ProductModel.find({
            _id: { $in: productIds.map(toObjectId) },
        }).lean();
        const productMap = new Map(products.map((p) => [String(p._id), p]));

        for (const item of items) {
            const product = productMap.get(item.productId);
            if (!product) {
                return res.status(400).json({
                    message: `Product does not exist: ${item.productId}`,
                });
            }
            const hasVariant = product.variants.some(
                (v: any) => String(v._id) === item.variantId
            );
            if (!hasVariant) {
                return res.status(400).json({
                    message: `Variant does not belong to product: ${item.variantId}`,
                });
            }
        }

        const stockExportItems = items.map((i) => ({
            productId: toObjectId(i.productId),
            variantId: toObjectId(i.variantId),
            quantity: i.imeiList.length,
            imeiList: i.imeiList.map((s) => s.trim()).filter(Boolean),
        }));

        if (stockExportItems.some((i) => i.quantity === 0)) {
            return res.status(400).json({
                message: "Each item must have at least one IMEI",
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            await validateImeiAvailability(effectiveBranchId, items, session);

            const [stockExport] = await StockExportModel.create(
                [
                    {
                        branchId: toObjectId(effectiveBranchId),
                        items: stockExportItems,
                        reason,
                        note: note ?? "",
                        createdBy: toObjectId(userId),
                        status: STATUS_STOCK.COMPLETED,
                    },
                ],
                { session }
            );

            await deductInventory(effectiveBranchId, items, session);

            await session.commitTransaction();

            return res.status(201).json({
                message: "Stock export created successfully",
                data: stockExport,
            });
        } catch (txError: any) {
            await session.abortTransaction();
            const msg = txError?.message ?? "Failed to create stock export";
            const isValidationError =
                typeof msg === "string" &&
                (msg.includes("IMEI") ||
                    msg.includes("stock") ||
                    msg.includes("Insufficient"));
            return res
                .status(isValidationError ? 422 : 500)
                .json({ message: msg });
        } finally {
            session.endSession();
        }
    } catch (error) {
        return res.status(500).json({
            message: "Failed to create stock export",
            error,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// List with pagination and filters
// ─────────────────────────────────────────────────────────────────────────────
export const getStockExportList = async (req: Request, res: Response) => {
    try {
        const { status } = req.query;

        const effectiveBranchId: string | undefined =
            (req as any).targetBranchId ??
            (req.query.branchId as string | undefined);

        const filter: Record<string, unknown> = {};

        if (effectiveBranchId !== undefined) {
            if (!mongoose.isValidObjectId(effectiveBranchId)) {
                return res.status(400).json({ message: "Invalid branchId" });
            }
            filter.branchId = toObjectId(effectiveBranchId);
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
            StockExportModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("branchId", "name address phone isActive")
                .populate("createdBy", "userName email role")
                .lean(),
            StockExportModel.countDocuments(filter),
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
            message: "Failed to fetch stock exports",
            error,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Detail with full populate
// ─────────────────────────────────────────────────────────────────────────────
export const getStockExportById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid stock export id" });
        }

        const stockExport = await StockExportModel.findById(id)
            .populate("branchId", "name address phone isActive")
            .populate("createdBy", "userName email role")
            .populate(
                "items.productId",
                "title variants._id variants.variantName"
            )
            .lean();

        if (!stockExport) {
            return res.status(404).json({ message: "Stock export not found" });
        }

        const targetBranchId: string | undefined = (req as any).targetBranchId;
        if (
            targetBranchId &&
            String(
                (stockExport as any).branchId?._id ?? stockExport.branchId
            ) !== targetBranchId
        ) {
            return res.status(403).json({
                message:
                    "Access denied. This record does not belong to your branch.",
            });
        }

        return res.status(200).json(stockExport);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch stock export detail",
            error,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// RETURN — Called internally when an order transitions to RETURNED.
// Finds the COMPLETED StockExport linked to the order, restores BranchInventory,
// and marks the export as CANCELLED (indicating the goods came back).
// Runs entirely inside the caller-provided MongoDB session/transaction.
// ─────────────────────────────────────────────────────────────────────────────
export const reverseInventoryForOrder = async (
    orderId: string,
    session: mongoose.ClientSession
) => {
    const stockExports = await StockExportModel.find(
        { orderId: toObjectId(orderId), status: STATUS_STOCK.COMPLETED },
        null,
        { session }
    );

    if (stockExports.length === 0) {
        // No completed exports found — nothing to reverse (e.g. order was never shipped)
        return null;
    }

    for (const stockExport of stockExports) {
        for (const item of stockExport.items) {
            await BranchInventoryModel.findOneAndUpdate(
                {
                    branchId: stockExport.branchId,
                    productId: item.productId,
                    variantId: item.variantId,
                },
                {
                    $inc: { quantity: item.imeiList?.length ?? item.quantity },
                    $push: { imeiList: { $each: item.imeiList ?? [] } },
                },
                { session }
            );
        }
        stockExport.status = STATUS_STOCK.CANCELLED as any;
        await stockExport.save({ session });
    }

    return stockExports;
};

// ─────────────────────────────────────────────────────────────────────────────
// Status update for manually-created exports (Case 2).
// PENDING → COMPLETED: validates IMEIs then deducts inventory in a transaction.
// PENDING → CANCELLED: no inventory change.
// ─────────────────────────────────────────────────────────────────────────────
export const updateStockExportStatus = async (req: Request, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;
        const { status } = req.body as { status: number };

        if (!mongoose.isValidObjectId(id)) {
            await session.abortTransaction();
            return res.status(400).json({ message: "Invalid stock export id" });
        }

        if (!Number.isFinite(status) || !validStockStatuses.includes(status)) {
            await session.abortTransaction();
            return res.status(400).json({ message: "Invalid status" });
        }

        const stockExport =
            await StockExportModel.findById(id).session(session);

        if (!stockExport) {
            await session.abortTransaction();
            return res.status(404).json({ message: "Stock export not found" });
        }

        const targetBranchId: string | undefined = (req as any).targetBranchId;
        if (targetBranchId && String(stockExport.branchId) !== targetBranchId) {
            await session.abortTransaction();
            return res.status(403).json({
                message:
                    "Access denied. This record does not belong to your branch.",
            });
        }

        const currentStatus = stockExport.status as number;
        const allowedNext = ALLOWED_TRANSITIONS[currentStatus] ?? [];
        if (!allowedNext.includes(status)) {
            await session.abortTransaction();
            return res.status(400).json({
                message: `Cannot transition from status ${currentStatus} to ${status}`,
            });
        }

        if (status === STATUS_STOCK.COMPLETED) {
            const assignments: Omit<ImeiAssignment, "branchId">[] =
                stockExport.items.map((item: any) => ({
                    productId: String(item.productId),
                    variantId: String(item.variantId),
                    imeiList: item.imeiList ?? [],
                }));

            await validateImeiAvailability(
                String(stockExport.branchId),
                assignments,
                session
            );

            stockExport.status = status as any;
            await stockExport.save({ session });

            await deductInventory(
                String(stockExport.branchId),
                assignments,
                session
            );
        } else {
            // CANCELLED — just update status, no inventory change
            stockExport.status = status as any;
            await stockExport.save({ session });
        }

        await session.commitTransaction();
        return res
            .status(200)
            .json({ message: "Status updated successfully", status });
    } catch (error: any) {
        await session.abortTransaction();
        return res.status(500).json({
            message: error?.message ?? "Failed to update stock export status",
            error,
        });
    } finally {
        session.endSession();
    }
};
