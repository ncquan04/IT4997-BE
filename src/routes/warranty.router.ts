import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { validate } from "../middlewares/validate";
import {
    createWarrantyRequestSchema,
    updateWarrantyStatusSchema,
    createRepairLogSchema,
} from "../dto/warranty.dto";
import { UserRole } from "../shared/models/user-model";
import {
    createWarrantyRequest,
    getWarrantyList,
    getWarrantyById,
    updateWarrantyStatus,
    lookupByImei,
    addRepairLog,
    getRepairLogs,
} from "../services/warranty.service";

const WarrantyRouter = express.Router();

// TECHNICIAN cũng thuộc branch scope (giống MANAGER)
const ALLOWED_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.TECHNICIAN];
const BRANCH_SCOPED_ROLES = [UserRole.MANAGER, UserRole.TECHNICIAN];

// Tra cứu lịch sử theo IMEI — đặt trước /:id để tránh conflict
WarrantyRouter.get(
    "/warranty/lookup",
    auth,
    verifyRole(ALLOWED_ROLES),
    verifyBranchScope(BRANCH_SCOPED_ROLES),
    lookupByImei
);

// Danh sách yêu cầu bảo hành
WarrantyRouter.get(
    "/warranty",
    auth,
    verifyRole(ALLOWED_ROLES),
    verifyBranchScope(BRANCH_SCOPED_ROLES),
    getWarrantyList
);

// Chi tiết yêu cầu bảo hành
WarrantyRouter.get(
    "/warranty/:id",
    auth,
    verifyRole(ALLOWED_ROLES),
    verifyBranchScope(BRANCH_SCOPED_ROLES),
    getWarrantyById
);

// Tiếp nhận bảo hành mới
WarrantyRouter.post(
    "/warranty",
    auth,
    verifyRole(ALLOWED_ROLES),
    verifyBranchScope(BRANCH_SCOPED_ROLES),
    validate(createWarrantyRequestSchema),
    createWarrantyRequest
);

// Cập nhật trạng thái
WarrantyRouter.patch(
    "/warranty/:id/status",
    auth,
    verifyRole(ALLOWED_ROLES),
    verifyBranchScope(BRANCH_SCOPED_ROLES),
    validate(updateWarrantyStatusSchema),
    updateWarrantyStatus
);

// Lịch sử sửa chữa — xem
WarrantyRouter.get(
    "/warranty/:id/repair-logs",
    auth,
    verifyRole(ALLOWED_ROLES),
    verifyBranchScope(BRANCH_SCOPED_ROLES),
    getRepairLogs
);

// Lịch sử sửa chữa — thêm mới
WarrantyRouter.post(
    "/warranty/:id/repair-logs",
    auth,
    verifyRole(ALLOWED_ROLES),
    verifyBranchScope(BRANCH_SCOPED_ROLES),
    validate(createRepairLogSchema),
    addRepairLog
);

export default WarrantyRouter;
