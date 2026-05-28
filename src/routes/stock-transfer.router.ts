import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { validate } from "../middlewares/validate";
import { UserRole } from "../shared/models/user-model";
import { createStockTransferSchema, updateStockTransferStatusSchema } from "../dto/stock-transfer.dto";
import {
    createStockTransfer,
    getStockTransferList,
    getStockTransferById,
    updateStockTransferStatus,
} from "../services/stock-transfer.service";

const StockTransferRouter = express.Router();

StockTransferRouter.get(
    "/stock-transfers",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    verifyBranchScope(),
    getStockTransferList
);

StockTransferRouter.get(
    "/stock-transfers/:id",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    verifyBranchScope(),
    getStockTransferById
);

StockTransferRouter.post(
    "/stock-transfers",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    verifyBranchScope(),
    validate(createStockTransferSchema),
    createStockTransfer
);

StockTransferRouter.patch(
    "/stock-transfers/:id/status",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER]),
    verifyBranchScope(),
    validate(updateStockTransferStatusSchema),
    updateStockTransferStatus
);

export default StockTransferRouter;
