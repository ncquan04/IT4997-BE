import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { validate } from "../middlewares/validate";
import { UserRole } from "../shared/models/user-model";
import {
    getAllBranches,
    getBranchById,
    createBranch,
    updateBranch,
    deleteBranch,
    updateBranchStatus,
} from "../services/branch.service";
import {
    updateBranchStatusSchema,
    createBranchSchema,
    updateBranchSchema,
} from "../dto/branch.dto";

const BranchRouter = express.Router();

// Admin only
BranchRouter.post(
    "/branches",
    auth,
    verifyRole([UserRole.ADMIN]),
    validate(createBranchSchema),
    createBranch
);

BranchRouter.patch(
    "/branches/:id",
    auth,
    verifyRole([UserRole.ADMIN]),
    validate(updateBranchSchema),
    updateBranch
);

BranchRouter.delete(
    "/branches/:id",
    auth,
    verifyRole([UserRole.ADMIN]),
    deleteBranch
);

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
