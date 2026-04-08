import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { UserRole } from "../shared/models/user-model";
import {
    generatePayroll,
    getPayrollList,
    updatePayrollStatus,
    getMyPayroll,
} from "../services/payroll.service";

const PayrollRouter = express.Router();

const MANAGER_ROLES = [UserRole.ADMIN, UserRole.MANAGER];
const ALL_STAFF = [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.WAREHOUSE,
    UserRole.SALES,
    UserRole.TECHNICIAN,
];
const BRANCH_SCOPED = [UserRole.MANAGER];

// Nhân viên xem lương của chính mình
PayrollRouter.get("/payroll/my", auth, verifyRole(ALL_STAFF), getMyPayroll);

// Admin/Manager xem bảng lương toàn bộ
PayrollRouter.get(
    "/payroll",
    auth,
    verifyRole(MANAGER_ROLES),
    verifyBranchScope(BRANCH_SCOPED),
    getPayrollList
);

// Tạo / tính lại bảng lương theo tháng cho chi nhánh
PayrollRouter.post(
    "/payroll/generate",
    auth,
    verifyRole(MANAGER_ROLES),
    verifyBranchScope(BRANCH_SCOPED),
    generatePayroll
);

// Xác nhận hoặc đánh dấu đã thanh toán
PayrollRouter.patch(
    "/payroll/:id/status",
    auth,
    verifyRole(MANAGER_ROLES),
    verifyBranchScope(BRANCH_SCOPED),
    updatePayrollStatus
);

export default PayrollRouter;
