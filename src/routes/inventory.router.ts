import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";
import {
    getInventoryById,
    getInventoryList,
} from "../services/inventory.service";

const InventoryRouter = express.Router();

InventoryRouter.get(
    "/inventory",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.WAREHOUSE]),
    getInventoryList
);

InventoryRouter.get(
    "/inventory/:id",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.WAREHOUSE]),
    getInventoryById
);

export default InventoryRouter;
