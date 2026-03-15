import { Request, Response } from "express";
import mongoose from "mongoose";
import BranchModel from "../models/branch-model.mongo";

export const getAllBranches = async (req: Request, res: Response) => {
    try {
        const { isActive } = req.query;
        const filter: Record<string, unknown> = {};

        if (typeof isActive === "string") {
            if (isActive === "true") {
                filter.isActive = true;
            } else if (isActive === "false") {
                filter.isActive = false;
            } else {
                return res.status(400).json({
                    message: "Invalid isActive query. Use true or false.",
                });
            }
        }

        const branches = await BranchModel.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json(branches);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch branches",
            error,
        });
    }
};

export const getBranchById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid branch id" });
        }

        const branch = await BranchModel.findById(id).lean();

        if (!branch) {
            return res.status(404).json({ message: "Branch not found" });
        }

        return res.status(200).json(branch);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch branch",
            error,
        });
    }
};

export const updateBranchStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid branch id" });
        }

        const updatedBranch = await BranchModel.findByIdAndUpdate(
            id,
            { isActive },
            { new: true, runValidators: true, context: "query" }
        ).lean();

        if (!updatedBranch) {
            return res.status(404).json({ message: "Branch not found" });
        }

        return res.status(200).json({
            message: "Branch status updated successfully",
            data: updatedBranch,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update branch status",
            error,
        });
    }
};
