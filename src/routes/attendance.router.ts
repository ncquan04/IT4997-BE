import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { UserRole } from "../shared/models/user-model";
import {
    checkIn,
    checkOut,
    getAttendanceList,
    upsertAttendance,
    getAttendanceSummary,
} from "../services/attendance.service";

const AttendanceRouter = express.Router();

const MANAGER_ROLES = [UserRole.ADMIN, UserRole.MANAGER];
const ALL_STAFF = [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.WAREHOUSE,
    UserRole.SALES,
    UserRole.TECHNICIAN,
];
const BRANCH_SCOPED = [UserRole.MANAGER];

// Nhân viên tự check-in
AttendanceRouter.post(
    "/attendance/check-in",
    auth,
    verifyRole(ALL_STAFF),
    checkIn
);

// Nhân viên tự check-out
AttendanceRouter.post(
    "/attendance/check-out",
    auth,
    verifyRole(ALL_STAFF),
    checkOut
);

// Lấy bảng công theo tháng (admin xem tất, manager xem chi nhánh mình)
AttendanceRouter.get(
    "/attendance",
    auth,
    verifyRole(MANAGER_ROLES),
    verifyBranchScope(BRANCH_SCOPED),
    getAttendanceList
);

// Tổng hợp ngày công của 1 nhân viên trong tháng (dùng để tính lương)
AttendanceRouter.get(
    "/attendance/summary",
    auth,
    verifyRole(MANAGER_ROLES),
    verifyBranchScope(BRANCH_SCOPED),
    getAttendanceSummary
);

// Admin / Manager chỉnh sửa / tạo thủ công 1 bản ghi chấm công
AttendanceRouter.put(
    "/attendance",
    auth,
    verifyRole(MANAGER_ROLES),
    verifyBranchScope(BRANCH_SCOPED),
    upsertAttendance
);

export default AttendanceRouter;
