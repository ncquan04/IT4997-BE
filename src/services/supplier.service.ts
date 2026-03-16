import { Request, Response } from "express";
import SupplierModel from "../models/supplier-model.mongo";

export const getAllSuppliers = async (_req: Request, res: Response) => {
    try {
        const suppliers = await SupplierModel.find()
            .sort({ createdAt: -1 })
            .lean();
        return res.status(200).json(suppliers);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch suppliers",
            error,
        });
    }
};
