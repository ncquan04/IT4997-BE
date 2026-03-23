import { Request, Response } from "express";
import mongoose from "mongoose";
import WarrantyRequestModel from "../models/warranty-request-model.mongo";
import RepairLogModel from "../models/repair-log-model.mongo";
import UserModel from "../models/user-model.mongo";
import { Contacts } from "../shared/contacts";
import { notificationService } from "./notification.service";
import { parsePositiveInt } from "../utils";

type AuthenticatedRequest = Request & {
    user?: { id: string; role: string; branchId?: string };
    targetBranchId?: string;
};

const STATUS_WARRANTY = Contacts.Status.Warranty;
const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);

// ─── State machine ────────────────────────────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<number, number[]> = {
    [STATUS_WARRANTY.RECEIVED]: [STATUS_WARRANTY.DIAGNOSING],
    [STATUS_WARRANTY.DIAGNOSING]: [
        STATUS_WARRANTY.REPAIRING,
        STATUS_WARRANTY.WAITING_PARTS,
        STATUS_WARRANTY.COMPLETED,
    ],
    [STATUS_WARRANTY.REPAIRING]: [
        STATUS_WARRANTY.WAITING_PARTS,
        STATUS_WARRANTY.COMPLETED,
    ],
    [STATUS_WARRANTY.WAITING_PARTS]: [
        STATUS_WARRANTY.REPAIRING,
        STATUS_WARRANTY.COMPLETED,
    ],
    [STATUS_WARRANTY.COMPLETED]: [STATUS_WARRANTY.RETURNED],
    [STATUS_WARRANTY.RETURNED]: [],
};

const STATUS_LABELS: Record<number, string> = {
    [STATUS_WARRANTY.RECEIVED]: "Đã tiếp nhận",
    [STATUS_WARRANTY.DIAGNOSING]: "Đang chẩn đoán",
    [STATUS_WARRANTY.REPAIRING]: "Đang sửa chữa",
    [STATUS_WARRANTY.WAITING_PARTS]: "Chờ linh kiện",
    [STATUS_WARRANTY.COMPLETED]: "Hoàn tất sửa chữa",
    [STATUS_WARRANTY.RETURNED]: "Đã trả máy",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getBranchFilter = (req: any): string | undefined =>
    req.targetBranchId ?? (req.query.branchId as string | undefined);

// Handles both raw ObjectId and populated document (after .populate())
const isBranchAllowed = (req: any, docBranchId: any): boolean => {
    const target = req.targetBranchId;
    if (!target) return true; // ADMIN – full access
    const id = docBranchId?._id ?? docBranchId;
    return id?.toString() === target.toString();
};

// ─── Tiếp nhận bảo hành ──────────────────────────────────────────────────────
export const createWarrantyRequest = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const userId = req.user!.id;
        const {
            customerId,
            orderId,
            productId,
            variantId,
            branchId: bodyBranchId,
            imeiOrSerial,
            issueDescription,
            physicalCondition,
            images,
            estimatedDate,
        } = req.body;

        // MANAGER/TECHNICIAN: enforce their assigned branch, ignore body branchId
        const effectiveBranchId: string = req.targetBranchId ?? bodyBranchId;
        if (!effectiveBranchId) {
            return res.status(400).json({ message: "branchId is required" });
        }
        // Prevent MANAGER/TECHNICIAN from creating for another branch
        if (
            req.targetBranchId &&
            bodyBranchId &&
            bodyBranchId !== req.targetBranchId
        ) {
            return res
                .status(403)
                .json({
                    message:
                        "You can only create warranty requests for your assigned branch",
                });
        }

        const customer = await UserModel.findById(customerId).lean();
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        const data: Record<string, any> = {
            customerId: toObjectId(customerId),
            productId: toObjectId(productId),
            variantId: toObjectId(variantId),
            branchId: toObjectId(effectiveBranchId),
            imeiOrSerial: imeiOrSerial.trim(),
            issueDescription,
            physicalCondition,
            images: images ?? [],
            status: STATUS_WARRANTY.RECEIVED,
            receivedBy: toObjectId(userId),
            estimatedDate,
        };
        if (orderId) data.orderId = toObjectId(orderId);

        const warrantyRequest = await WarrantyRequestModel.create(data);

        notificationService.pushNotification(
            "WARRANTY",
            "Yêu cầu bảo hành mới",
            `Tiếp nhận thiết bị IMEI/Serial: ${imeiOrSerial}`,
            warrantyRequest._id.toString(),
            customerId
        );

        return res.status(201).json({
            data: warrantyRequest,
            message: "Warranty request created successfully",
        });
    } catch (error) {
        console.error("createWarrantyRequest error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── Danh sách yêu cầu bảo hành ───────────────────────────────────────────────
export const getWarrantyList = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const branchId = getBranchFilter(req);
        const status =
            req.query.status !== undefined
                ? Number(req.query.status)
                : undefined;
        const imei = req.query.imei as string | undefined;
        const page = parsePositiveInt(req.query.page as string, 1);
        const limit = parsePositiveInt(req.query.limit as string, 10);
        const skip = (page - 1) * limit;

        const filter: Record<string, any> = {};
        if (branchId) filter.branchId = toObjectId(branchId);
        if (status !== undefined && !isNaN(status)) filter.status = status;
        if (imei?.trim()) filter.imeiOrSerial = imei.trim();

        const [items, total] = await Promise.all([
            WarrantyRequestModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("customerId", "userName email phoneNumber")
                .populate("productId", "title")
                .populate("branchId", "name")
                .populate("receivedBy", "userName")
                .lean(),
            WarrantyRequestModel.countDocuments(filter),
        ]);

        return res.status(200).json({
            data: items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("getWarrantyList error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── Chi tiết yêu cầu bảo hành ────────────────────────────────────────────────
export const getWarrantyById = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const { id } = req.params;
        const warranty = await WarrantyRequestModel.findById(id)
            .populate("customerId", "userName email phoneNumber")
            .populate("productId", "title variants")
            .populate("branchId", "name address")
            .populate("receivedBy", "userName")
            .lean();

        if (!warranty) {
            return res
                .status(404)
                .json({ message: "Warranty request not found" });
        }
        if (!isBranchAllowed(req, warranty.branchId)) {
            return res
                .status(403)
                .json({ message: "Access denied to this branch's data" });
        }

        return res.status(200).json({ data: warranty });
    } catch (error) {
        console.error("getWarrantyById error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── Cập nhật trạng thái ──────────────────────────────────────────────────────
export const updateWarrantyStatus = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const { id } = req.params;
        const { status: newStatus } = req.body;

        const warranty = await WarrantyRequestModel.findById(id);
        if (!warranty) {
            return res
                .status(404)
                .json({ message: "Warranty request not found" });
        }
        if (!isBranchAllowed(req, warranty.branchId)) {
            return res
                .status(403)
                .json({ message: "Access denied to this branch's data" });
        }

        const currentStatus = warranty.status as number;
        const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
        if (!allowed.includes(newStatus)) {
            return res.status(400).json({
                message: `Không thể chuyển từ trạng thái ${currentStatus} sang ${newStatus}`,
            });
        }

        warranty.status = newStatus;
        if (newStatus === STATUS_WARRANTY.COMPLETED) {
            warranty.completedDate = Date.now();
        }
        await warranty.save();

        notificationService.pushNotification(
            "WARRANTY",
            "Cập nhật bảo hành",
            `Thiết bị IMEI/Serial: ${warranty.imeiOrSerial} — ${STATUS_LABELS[newStatus] ?? newStatus}`,
            warranty._id.toString(),
            warranty.customerId.toString()
        );

        return res
            .status(200)
            .json({ data: warranty, message: "Status updated successfully" });
    } catch (error) {
        console.error("updateWarrantyStatus error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── Tra cứu lịch sử theo IMEI/Serial ────────────────────────────────────────
export const lookupByImei = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const imei = (req.query.imei as string)?.trim();
        if (!imei) {
            return res
                .status(400)
                .json({ message: "Query param 'imei' is required" });
        }

        const filter: Record<string, any> = { imeiOrSerial: imei };
        // MANAGER/TECHNICIAN: restrict to their own branch's records
        if (req.targetBranchId) {
            filter.branchId = toObjectId(req.targetBranchId);
        }

        const history = await WarrantyRequestModel.find(filter)
            .sort({ createdAt: -1 })
            .populate("customerId", "userName email phoneNumber")
            .populate("productId", "title")
            .populate("branchId", "name")
            .populate("receivedBy", "userName")
            .lean();

        return res.status(200).json({ data: history });
    } catch (error) {
        console.error("lookupByImei error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── Thêm nhật ký sửa chữa ────────────────────────────────────────────────────
export const addRepairLog = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const id = req.params.id as string;
        const technicianId = req.user!.id;
        const { action, replacedParts, cost, note } = req.body;

        const warranty = await WarrantyRequestModel.findById(id).lean();
        if (!warranty) {
            return res
                .status(404)
                .json({ message: "Warranty request not found" });
        }
        if (!isBranchAllowed(req, warranty.branchId)) {
            return res
                .status(403)
                .json({ message: "Access denied to this branch's data" });
        }
        if (warranty.status === STATUS_WARRANTY.RETURNED) {
            return res
                .status(400)
                .json({
                    message:
                        "Cannot add repair log: device has already been returned to customer",
                });
        }

        const repairLog = await RepairLogModel.create({
            warrantyRequestId: toObjectId(id),
            imeiOrSerial: warranty.imeiOrSerial,
            action,
            replacedParts: replacedParts ?? [],
            cost: cost ?? 0,
            technicianId: toObjectId(technicianId),
            note: note ?? "",
        });

        return res.status(201).json({
            data: repairLog,
            message: "Repair log added successfully",
        });
    } catch (error) {
        console.error("addRepairLog error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── Lịch sử sửa chữa theo warranty request ───────────────────────────────────
export const getRepairLogs = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const id = req.params.id as string;

        const warranty = await WarrantyRequestModel.findById(id).lean();
        if (!warranty) {
            return res
                .status(404)
                .json({ message: "Warranty request not found" });
        }
        if (!isBranchAllowed(req, warranty.branchId)) {
            return res
                .status(403)
                .json({ message: "Access denied to this branch's data" });
        }

        const logs = await RepairLogModel.find({
            warrantyRequestId: toObjectId(id),
        })
            .sort({ createdAt: 1 })
            .populate("technicianId", "userName email")
            .lean();

        return res.status(200).json({ data: logs });
    } catch (error) {
        console.error("getRepairLogs error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
