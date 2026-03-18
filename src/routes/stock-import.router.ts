import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { validate } from "../middlewares/validate";
import { createStockImportSchema } from "../dto/stock-import.dto";

import { UserRole } from "../shared/models/user-model";
import {
    createStockImport,
    getStockImportById,
    getStockImportList,
} from "../services/stock-import.service";

const StockImportRouter = express.Router();

StockImportRouter.get(
    "/stock-imports",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    verifyBranchScope(),
    getStockImportList
);

StockImportRouter.get(
    "/stock-imports/:id",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    verifyBranchScope(),
    getStockImportById
);

StockImportRouter.post(
    "/stock-imports",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE]),
    verifyBranchScope(),
    validate(createStockImportSchema),
    createStockImport
);

export default StockImportRouter;
