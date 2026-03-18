import { Request, Response } from "express";
import RefundReportModel from "../models/refund-report-model.mongo";
import mongoose from "mongoose";

export const creatReportRefund = async (req: Request, res: Response) => {
    try {
        const {
            orderId,
            paymentId,
            cusName,
            cusMail,
            cusPhone,
            reason,
            amount,
            images,
        } = req.body;

        const customerDetail = {
            name: cusName,
            email: cusMail,
            phone: cusPhone,
        };
        const userId = (req as any).user.id;
        const branchId =
            (req as any).targetBranchId ??
            (req as any).user.branchId ??
            undefined;
        // Validate required fields
        const createdReport = await RefundReportModel.create({
            orderId,
            paymentId,
            customerDetail,
            refundBy: new mongoose.Types.ObjectId(userId),
            reason,
            amount,
            images,
            branchId: branchId
                ? new mongoose.Types.ObjectId(branchId)
                : undefined,
        });
        return res.status(200).json(createdReport);
    } catch (error) {
        console.error("Error reporting refund:", error);
        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

export const getRefundReportById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const report = await RefundReportModel.findById(id);
        if (!report) {
            return res.status(404).json({
                message: "Refund report not found",
            });
        }

        const targetBranchId: string | undefined = (req as any).targetBranchId;
        if (targetBranchId && String(report.branchId) !== targetBranchId) {
            return res
                .status(403)
                .json({
                    message:
                        "Access denied. This report does not belong to your branch.",
                });
        }

        return res.status(200).json(report);
    } catch (error) {
        console.error("Error fetching refund report by ID:", error);
        return res.status(500).json({
            message: "Internal server error",
        });
    }
};

export const getRefundReports = async (req: Request, res: Response) => {
    try {
        const branchId: string | undefined = (req as any).targetBranchId;
        const filter: Record<string, unknown> = {};
        if (branchId) {
            filter.branchId = new mongoose.Types.ObjectId(branchId);
        }
        const reports = await RefundReportModel.find(filter).sort({
            createdAt: -1,
        });
        return res.status(200).json(reports);
    } catch (error) {
        console.error("Error fetching refund reports:", error);
        return res.status(500).json({
            message: "Internal server error",
        });
    }
};
