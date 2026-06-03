import { Request, Response } from "express";
import mongoose from "mongoose";
import BranchInventoryModel from "../models/branch-inventory-model.mongo";
import BranchModel from "../models/branch-model.mongo";
import ProductModel from "../models/product-model.mongo";
import StockTransferModel, { StockTransferModelDocument } from "../models/stock-transfer-model.mongo";
import { Contacts } from "../shared/contacts";
import { parsePositiveInt } from "../utils";
import UserSchema from "../models/user-model.mongo";

type AuthenticatedRequest = Request & {
    user?: { id: string; role: string; email: string };
};

const STATUS_TRANSFER = Contacts.Status.Transfer;
const validTransferStatuses = Object.values(STATUS_TRANSFER) as number[];
const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);

export type ImeiAssignment = {
    productId: string;
    variantId: string;
    imeiList: string[];
};

// Normalize an IMEI list: trim, drop empties, dedupe while preserving order.
const normalizeImeis = (raw: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of raw) {
        const v = (r ?? "").trim();
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
    }
    return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Validate that IMEI exists in branch inventory
// ─────────────────────────────────────────────────────────────────────────────
const validateImeiAvailability = async (
    branchId: string,
    assignments: ImeiAssignment[],
    session: mongoose.ClientSession
) => {
    for (const assignment of assignments) {
        if (assignment.imeiList.length === 0) {
            throw new Error(`imeiList cannot be empty for productId=${assignment.productId}`);
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
            throw new Error(`No inventory found for productId=${assignment.productId} in branch ${branchId}`);
        }

        if (inventory.quantity < assignment.imeiList.length) {
            throw new Error(`Insufficient stock for productId=${assignment.productId}. Available: ${inventory.quantity}, requested: ${assignment.imeiList.length}`);
        }

        const inventoryImeiSet = new Set(inventory.imeiList as string[]);
        for (const imei of assignment.imeiList) {
            if (!inventoryImeiSet.has(imei)) {
                throw new Error(`IMEI ${imei} is not present in inventory for branch ${branchId}`);
            }
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Deduct inventory from a branch
// ─────────────────────────────────────────────────────────────────────────────
const deductInventory = async (
    branchId: string,
    assignments: ImeiAssignment[],
    session: mongoose.ClientSession
) => {
    for (const assignment of assignments) {
        // Conditional decrement: the quantity guard makes the update match no
        // document (and return null) instead of driving stock negative — Mongoose
        // does not enforce schema min:0 on a $inc.
        const result = await BranchInventoryModel.findOneAndUpdate(
            {
                branchId: toObjectId(branchId),
                productId: toObjectId(assignment.productId),
                variantId: toObjectId(assignment.variantId),
                quantity: { $gte: assignment.imeiList.length },
            },
            {
                $inc: { quantity: -assignment.imeiList.length },
                $pull: { imeiList: { $in: assignment.imeiList } },
            },
            { new: true, session, runValidators: true }
        );
        if (!result) {
            throw new Error(
                `Insufficient stock for productId=${assignment.productId} in branch ${branchId}`
            );
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Add inventory to a branch
// ─────────────────────────────────────────────────────────────────────────────
const addInventory = async (
    branchId: string,
    assignments: ImeiAssignment[],
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
                $inc: { quantity: assignment.imeiList.length },
                $push: { imeiList: { $each: assignment.imeiList } },
            },
            { upsert: true, session, runValidators: true }
        );
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Manual transfer creation via API
// ─────────────────────────────────────────────────────────────────────────────
export const createStockTransfer = async (req: Request, res: Response) => {
    try {
        const request = req as AuthenticatedRequest;
        const userId = request.user?.id;

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { fromBranchId, toBranchId, note, items } = req.body as {
            fromBranchId: string;
            toBranchId: string;
            note?: string;
            items: ImeiAssignment[];
        };

        const effectiveBranchId: string = (req as any).targetBranchId ?? fromBranchId;

        if (!effectiveBranchId) {
            return res.status(400).json({ message: "fromBranchId is required" });
        }
        
        if (effectiveBranchId === toBranchId) {
            return res.status(400).json({ message: "fromBranchId and toBranchId must be different" });
        }

        const [fromBranch, toBranch] = await Promise.all([
            BranchModel.findById(effectiveBranchId).lean(),
            BranchModel.findById(toBranchId).lean()
        ]);

        if (!fromBranch || !toBranch) {
            return res.status(400).json({ message: "One or both branches do not exist" });
        }

        const productIds = Array.from(new Set(items.map((i) => i.productId)));
        const products = await ProductModel.find({
            _id: { $in: productIds.map(toObjectId) },
        }).lean();
        const productMap = new Map(products.map((p) => [String(p._id), p]));

        for (const item of items) {
            const product = productMap.get(item.productId);
            if (!product) {
                return res.status(400).json({ message: `Product does not exist: ${item.productId}` });
            }
            const hasVariant = product.variants.some((v: any) => String(v._id) === item.variantId);
            if (!hasVariant) {
                return res.status(400).json({ message: `Variant does not belong to product: ${item.variantId}` });
            }
        }

        const normalizedItems = items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            imeiList: normalizeImeis(i.imeiList ?? []),
        }));

        if (normalizedItems.some((i) => i.imeiList.length === 0)) {
            return res.status(400).json({ message: "Each item must have at least one IMEI" });
        }

        // Merge items that target the same (productId, variantId) so a payload
        // repeating a product/variant cannot over-reserve, and reject any IMEI
        // duplicated across items. Validation/deduction then run on the merged
        // totals (one entry per product/variant).
        const mergedMap = new Map<string, ImeiAssignment>();
        for (const it of normalizedItems) {
            const key = `${it.productId}|${it.variantId}`;
            const existing = mergedMap.get(key);
            if (!existing) {
                mergedMap.set(key, { ...it, imeiList: [...it.imeiList] });
                continue;
            }
            for (const imei of it.imeiList) {
                if (existing.imeiList.includes(imei)) {
                    return res.status(400).json({
                        message: `Duplicate IMEI across items: ${imei}`,
                    });
                }
                existing.imeiList.push(imei);
            }
        }
        const mergedItems = Array.from(mergedMap.values());

        const stockTransferItems = mergedItems.map((i) => ({
            productId: toObjectId(i.productId),
            variantId: toObjectId(i.variantId),
            quantity: i.imeiList.length,
            imeiList: i.imeiList,
        }));

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            // Validate then immediately reserve (deduct) so concurrent transfers can't
            // claim the same IMEIs. Reserved stock is restored if the transfer is cancelled.
            await validateImeiAvailability(effectiveBranchId, mergedItems, session);
            await deductInventory(effectiveBranchId, mergedItems, session);

            const [stockTransfer] = await StockTransferModel.create(
                [
                    {
                        fromBranchId: toObjectId(effectiveBranchId),
                        toBranchId: toObjectId(toBranchId),
                        items: stockTransferItems,
                        note: note ?? "",
                        createdBy: toObjectId(userId),
                        status: STATUS_TRANSFER.PENDING,
                    },
                ],
                { session }
            );

            await session.commitTransaction();

            return res.status(201).json({
                message: "Stock transfer created successfully",
                data: stockTransfer,
            });
        } catch (txError: any) {
            await session.abortTransaction();
            const msg = txError?.message ?? "Failed to create stock transfer";
            const isValidationError = typeof msg === "string" && (msg.includes("IMEI") || msg.includes("stock") || msg.includes("Insufficient"));
            return res.status(isValidationError ? 422 : 500).json({ message: msg });
        } finally {
            session.endSession();
        }
    } catch (error) {
        return res.status(500).json({ message: "Failed to create stock transfer", error });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get List
// ─────────────────────────────────────────────────────────────────────────────
export const getStockTransferList = async (req: Request, res: Response) => {
    try {
        const { status, viewOptions } = req.query;

        // viewOptions indicates whether to filter transfers where the target branch is the FROM branch, TO branch, or BOTH.
        const effectiveBranchId: string | undefined =
            (req as any).targetBranchId ?? (req.query.branchId as string | undefined);

        const filter: Record<string, unknown> = {};

        if (effectiveBranchId !== undefined) {
            if (!mongoose.isValidObjectId(effectiveBranchId)) {
                return res.status(400).json({ message: "Invalid branchId" });
            }
            if (viewOptions === "from") {
                filter.fromBranchId = toObjectId(effectiveBranchId);
            } else if (viewOptions === "to") {
                filter.toBranchId = toObjectId(effectiveBranchId);
            } else {
                filter.$or = [
                    { fromBranchId: toObjectId(effectiveBranchId) },
                    { toBranchId: toObjectId(effectiveBranchId) },
                ];
            }
        }

        if (typeof status === "string") {
            const statusNum = Number(status);
            if (!Number.isFinite(statusNum) || !validTransferStatuses.includes(statusNum)) {
                return res.status(400).json({ message: "Invalid status" });
            }
            filter.status = statusNum;
        }

        const page = parsePositiveInt(req.query.page, 1);
        const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            StockTransferModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("fromBranchId", "name address phone isActive")
                .populate("toBranchId", "name address phone isActive")
                .populate("createdBy", "userName email role")
                .populate("approvedBy", "userName email role")
                .lean(),
            StockTransferModel.countDocuments(filter),
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
        return res.status(500).json({ message: "Failed to fetch stock transfers", error });
    }
};

export const getStockTransferById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid stock transfer id" });
        }

        const stockTransfer = await StockTransferModel.findById(id)
            .populate("fromBranchId", "name address phone isActive")
            .populate("toBranchId", "name address phone isActive")
            .populate("createdBy", "userName email role")
            .populate("approvedBy", "userName email role")
            .populate("items.productId", "title variants._id variants.variantName")
            .lean();

        if (!stockTransfer) {
            return res.status(404).json({ message: "Stock transfer not found" });
        }

        const targetBranchId: string | undefined = (req as any).targetBranchId;
        if (targetBranchId) {
            const fromId = String((stockTransfer.fromBranchId as any)?._id ?? stockTransfer.fromBranchId);
            const toId = String((stockTransfer.toBranchId as any)?._id ?? stockTransfer.toBranchId);
            if (fromId !== targetBranchId && toId !== targetBranchId) {
                return res.status(403).json({ message: "Access denied." });
            }
        }

        return res.status(200).json(stockTransfer);
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch stock transfer detail", error });
    }
};

const ALLOWED_TRANSITIONS: Record<number, number[]> = {
    [STATUS_TRANSFER.PENDING]: [STATUS_TRANSFER.IN_TRANSIT, STATUS_TRANSFER.CANCELLED],
    [STATUS_TRANSFER.IN_TRANSIT]: [STATUS_TRANSFER.COMPLETED, STATUS_TRANSFER.CANCELLED],
};

export const updateStockTransferStatus = async (req: Request, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const request = req as AuthenticatedRequest;
        const userId = request.user?.id;
        const { id } = req.params;
        const { status } = req.body as { status: number };

        if (!mongoose.isValidObjectId(id)) {
            await session.abortTransaction();
            return res.status(400).json({ message: "Invalid stock transfer id" });
        }

        if (!Number.isFinite(status) || !validTransferStatuses.includes(status)) {
            await session.abortTransaction();
            return res.status(400).json({ message: "Invalid status" });
        }

        const stockTransfer = await StockTransferModel.findById(id).session(session);

        if (!stockTransfer) {
            await session.abortTransaction();
            return res.status(404).json({ message: "Stock transfer not found" });
        }

        const fromId = String(stockTransfer.fromBranchId);
        const toId = String(stockTransfer.toBranchId);

        // Branch-scoped roles (req.targetBranchId set by middleware) can only act on
        // transfers they're a party to, and only on the side that matters for the
        // action they're trying to perform.
        const targetBranchId: string | undefined = (req as any).targetBranchId;
        if (targetBranchId) {
            if (fromId !== targetBranchId && toId !== targetBranchId) {
                await session.abortTransaction();
                return res.status(403).json({ message: "Access denied." });
            }
            if (status === STATUS_TRANSFER.IN_TRANSIT && fromId !== targetBranchId) {
                await session.abortTransaction();
                return res.status(403).json({ message: "Only the sending branch can approve a transfer." });
            }
            if (status === STATUS_TRANSFER.COMPLETED && toId !== targetBranchId) {
                await session.abortTransaction();
                return res.status(403).json({ message: "Only the receiving branch can mark a transfer as completed." });
            }
            // Cancelling an in-transit transfer claws the goods back to the
            // sender, so only the sending branch (or admin) may do it.
            if (
                status === STATUS_TRANSFER.CANCELLED &&
                Number(stockTransfer.status) === STATUS_TRANSFER.IN_TRANSIT &&
                fromId !== targetBranchId
            ) {
                await session.abortTransaction();
                return res.status(403).json({ message: "Only the sending branch can cancel an in-transit transfer." });
            }
        }

        const currentStatus = stockTransfer.status as number;
        const allowedNext = ALLOWED_TRANSITIONS[currentStatus] ?? [];
        if (!allowedNext.includes(status)) {
            await session.abortTransaction();
            return res.status(400).json({ message: `Cannot transition from status ${currentStatus} to ${status}` });
        }

        const assignments: ImeiAssignment[] = stockTransfer.items.map((item: any) => ({
            productId: String(item.productId),
            variantId: String(item.variantId),
            imeiList: item.imeiList ?? [],
        }));

        if (status === STATUS_TRANSFER.IN_TRANSIT) {
            // Stock was already reserved (deducted) at PENDING creation, so approval
            // is just a state transition — no inventory change.
            stockTransfer.approvedBy = userId as string;
        } else if (status === STATUS_TRANSFER.COMPLETED) {
            // Receiving branch acknowledges arrival.
            await addInventory(toId, assignments, session);
        } else if (status === STATUS_TRANSFER.CANCELLED) {
            // Restore reserved/in-transit stock back to the sending branch.
            await addInventory(fromId, assignments, session);
        }

        stockTransfer.status = status as any;
        await stockTransfer.save({ session });

        await session.commitTransaction();
        return res.status(200).json({ message: "Status updated successfully", status });
    } catch (error: any) {
        await session.abortTransaction();
        return res.status(500).json({ message: error?.message ?? "Failed to update stock transfer status", error });
    } finally {
        session.endSession();
    }
};
