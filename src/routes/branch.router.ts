import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { validate } from "../middlewares/validate";
import { UserRole } from "../shared/models/user-model";
import {
    getAllBranches,
    getBranchById,
    updateBranchStatus,
} from "../services/branch.service";
import { updateBranchStatusSchema } from "../dto/branch.dto";

const BranchRouter = express.Router();

// Admin only
BranchRouter.patch(
    "/branches/:id/status",
    auth,
    verifyRole([UserRole.ADMIN]),
    validate(updateBranchStatusSchema),
    updateBranchStatus
);

// Public routes
BranchRouter.get("/branches", getAllBranches);
BranchRouter.get("/branches/:id", getBranchById);

export default BranchRouter;
