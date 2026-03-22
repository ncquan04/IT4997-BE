import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { validate } from "../middlewares/validate";
import {
    createStockExportSchema,
    updateStockExportStatusSchema,
} from "../dto/stock-export.dto";
import { UserRole } from "../shared/models/user-model";
import {
    createStockExport,
    getStockExportById,
    getStockExportList,
    updateStockExportStatus,
} from "../services/stock-export.service";

const StockExportRouter = express.Router();

StockExportRouter.get(
    "/stock-exports",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    verifyBranchScope(),
    getStockExportList
);

StockExportRouter.get(
    "/stock-exports/:id",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    verifyBranchScope(),
    getStockExportById
);

StockExportRouter.post(
    "/stock-exports",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    verifyBranchScope(),
    validate(createStockExportSchema),
    createStockExport
);

StockExportRouter.patch(
    "/stock-exports/:id/status",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER]),
    verifyBranchScope(),
    validate(updateStockExportStatusSchema),
    updateStockExportStatus
);

export default StockExportRouter;
