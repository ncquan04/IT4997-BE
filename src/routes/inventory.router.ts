import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { UserRole } from "../shared/models/user-model";
import {
    getInventoryById,
    getInventoryList,
    lookupImei,
} from "../services/inventory.service";

const InventoryRouter = express.Router();

InventoryRouter.get(
    "/inventory/lookup-imei",
    auth,
    verifyRole([
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.WAREHOUSE,
        UserRole.SALES,
    ]),
    lookupImei
);

InventoryRouter.get(
    "/inventory",
    auth,
    verifyRole([
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.WAREHOUSE,
        UserRole.SALES,
    ]),
    verifyBranchScope(),
    getInventoryList
);

InventoryRouter.get(
    "/inventory/:id",
    auth,
    verifyRole([
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.WAREHOUSE,
        UserRole.SALES,
    ]),
    verifyBranchScope(),
    getInventoryById
);

export default InventoryRouter;
