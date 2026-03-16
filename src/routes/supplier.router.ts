import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";
import { getAllSuppliers } from "../services/supplier.service";

const SupplierRouter = express.Router();

SupplierRouter.get(
    "/suppliers",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.WAREHOUSE]),
    getAllSuppliers
);

export default SupplierRouter;
