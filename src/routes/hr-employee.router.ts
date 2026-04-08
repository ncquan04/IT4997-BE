import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { UserRole } from "../shared/models/user-model";
import {
    getEmployees,
    getEmployeeById,
    updateEmployee,
} from "../services/hr-employee.service";

const HrEmployeeRouter = express.Router();

const MANAGER_ROLES = [UserRole.ADMIN, UserRole.MANAGER];
const BRANCH_SCOPED = [UserRole.MANAGER];

HrEmployeeRouter.get(
    "/hr/employees",
    auth,
    verifyRole(MANAGER_ROLES),
    verifyBranchScope(BRANCH_SCOPED),
    getEmployees
);

HrEmployeeRouter.get(
    "/hr/employees/:id",
    auth,
    verifyRole(MANAGER_ROLES),
    verifyBranchScope(BRANCH_SCOPED),
    getEmployeeById
);

HrEmployeeRouter.put(
    "/hr/employees/:id",
    auth,
    verifyRole(MANAGER_ROLES),
    verifyBranchScope(BRANCH_SCOPED),
    updateEmployee
);

export default HrEmployeeRouter;
