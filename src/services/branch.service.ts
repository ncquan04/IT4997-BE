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
            .populate("managerId", "userName email")
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

        const branch = await BranchModel.findById(id).populate("managerId", "userName email").lean();

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

export const createBranch = async (req: Request, res: Response) => {
    try {
        const { name, address, phone, managerId, isActive, rentCost } = req.body;

        if (!mongoose.isValidObjectId(managerId)) {
            return res.status(400).json({ message: "Invalid managerId" });
        }

        const branch = await BranchModel.create({
            name,
            address,
            phone,
            managerId,
            isActive: isActive ?? true,
            rentCost: rentCost ?? 0,
        });

        return res.status(201).json(branch);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to create branch",
            error,
        });
    }
};

export const updateBranch = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, address, phone, managerId, isActive, rentCost } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid branch id" });
        }

        if (managerId !== undefined && !mongoose.isValidObjectId(managerId)) {
            return res.status(400).json({ message: "Invalid managerId" });
        }

        const update: Record<string, unknown> = {};
        if (name !== undefined) update.name = name;
        if (address !== undefined) update.address = address;
        if (phone !== undefined) update.phone = phone;
        if (managerId !== undefined) update.managerId = managerId;
        if (isActive !== undefined) update.isActive = isActive;
        if (rentCost !== undefined) update.rentCost = rentCost;

        const updated = await BranchModel.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
            context: "query",
        }).lean();

        if (!updated) {
            return res.status(404).json({ message: "Branch not found" });
        }

        return res.status(200).json(updated);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update branch",
            error,
        });
    }
};

export const deleteBranch = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid branch id" });
        }

        const deleted = await BranchModel.findByIdAndDelete(id).lean();

        if (!deleted) {
            return res.status(404).json({ message: "Branch not found" });
        }

        return res.status(200).json({ message: "Branch deleted successfully" });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to delete branch",
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

        return res.status(200).json({ message: "Branch status updated successfully" });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update branch status",
            error,
        });
    }
};
