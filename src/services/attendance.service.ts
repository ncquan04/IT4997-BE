import { Request, Response } from "express";
import mongoose from "mongoose";
import AttendanceModel from "../models/attendance-model.mongo";
import UserModel from "../models/user-model.mongo";
import { AttendanceStatus } from "../shared/models/attendance-model";
import { UserRole } from "../shared/models/user-model";

type AuthenticatedRequest = Request & {
    user?: { id: string; role: string; branchId?: string };
    targetBranchId?: string;
};

const STAFF_ROLES: UserRole[] = [
    UserRole.MANAGER,
    UserRole.WAREHOUSE,
    UserRole.SALES,
    UserRole.TECHNICIAN,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayString = () => new Date().toISOString().split("T")[0]; // YYYY-MM-DD

const calcWorkingHours = (checkIn?: number, checkOut?: number): number => {
    if (!checkIn || !checkOut) return 0;
    return Math.max(0, (checkOut - checkIn) / (1000 * 60 * 60));
};

// ─── Check-in ────────────────────────────────────────────────────────────────
export const checkIn = async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = req.user!.id;
    const branchId = req.user!.branchId;
    if (!branchId) {
        return res
            .status(400)
            .json({ message: "Nhân viên chưa được phân công chi nhánh." });
    }

    const date = todayString();
    const existing = await AttendanceModel.findOne({ employeeId, date });
    if (existing) {
        return res.status(409).json({ message: "Đã check-in hôm nay." });
    }

    // Xác định LATE nếu check-in sau 09:00
    const now = Date.now();
    const hour = new Date(now).getHours();
    const status = hour >= 9 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;

    const record = await AttendanceModel.create({
        employeeId,
        branchId,
        date,
        checkInTime: now,
        status,
    });

    return res.status(201).json(record);
};

// ─── Check-out ───────────────────────────────────────────────────────────────
export const checkOut = async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = req.user!.id;
    const date = todayString();

    const record = await AttendanceModel.findOne({ employeeId, date });
    if (!record) {
        return res.status(404).json({ message: "Chưa check-in hôm nay." });
    }
    if (record.checkOutTime) {
        return res.status(409).json({ message: "Đã check-out hôm nay." });
    }

    const now = Date.now();
    record.checkOutTime = now;
    record.workingHours = calcWorkingHours(record.checkInTime, now);
    await record.save();

    return res.json(record);
};

// ─── Lấy bảng công theo tháng ────────────────────────────────────────────────
export const getAttendanceList = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const { month, year, employeeId, branchId } = req.query as Record<
        string,
        string
    >;

    if (!month || !year) {
        return res.status(400).json({ message: "Cần truyền month và year." });
    }

    const m = parseInt(month);
    const y = parseInt(year);
    if (isNaN(m) || isNaN(y) || m < 1 || m > 12) {
        return res.status(400).json({ message: "month/year không hợp lệ." });
    }

    // Tạo range YYYY-MM-DD
    const pad = (n: number) => String(n).padStart(2, "0");
    const daysInMonth = new Date(y, m, 0).getDate();
    const dateFrom = `${y}-${pad(m)}-01`;
    const dateTo = `${y}-${pad(m)}-${pad(daysInMonth)}`;

    const filter: any = { date: { $gte: dateFrom, $lte: dateTo } };

    // Branch scope
    const targetBranch = req.targetBranchId ?? branchId;
    if (targetBranch)
        filter.branchId = new mongoose.Types.ObjectId(targetBranch);
    if (employeeId) filter.employeeId = new mongoose.Types.ObjectId(employeeId);

    const records = await AttendanceModel.find(filter)
        .populate("employeeId", "userName email phoneNumber role branchId")
        .sort({ date: 1, employeeId: 1 })
        .lean();

    return res.json(records);
};

// ─── Chỉnh sửa thủ công (admin/manager) ────────────────────────────────────
export const upsertAttendance = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const reviewedBy = req.user!.id;
    const {
        employeeId,
        branchId,
        date,
        checkInTime,
        checkOutTime,
        status,
        note,
    } = req.body;

    if (!employeeId || !branchId || !date || !status) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc." });
    }

    if (!Object.values(AttendanceStatus).includes(status)) {
        return res.status(400).json({ message: "status không hợp lệ." });
    }

    const workingHours = calcWorkingHours(checkInTime, checkOutTime);

    const record = await AttendanceModel.findOneAndUpdate(
        { employeeId, date },
        {
            $set: {
                branchId,
                checkInTime,
                checkOutTime,
                status,
                workingHours,
                note,
                reviewedBy,
            },
        },
        { upsert: true, new: true }
    );

    return res.json(record);
};

// ─── Thống kê ngày công của một nhân viên trong tháng ───────────────────────
export const getAttendanceSummary = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const { employeeId, month, year } = req.query as Record<string, string>;

    if (!employeeId || !month || !year) {
        return res
            .status(400)
            .json({ message: "Cần truyền employeeId, month, year." });
    }

    const m = parseInt(month);
    const y = parseInt(year);
    const pad = (n: number) => String(n).padStart(2, "0");
    const daysInMonth = new Date(y, m, 0).getDate();
    const dateFrom = `${y}-${pad(m)}-01`;
    const dateTo = `${y}-${pad(m)}-${pad(daysInMonth)}`;

    const records = await AttendanceModel.find({
        employeeId: new mongoose.Types.ObjectId(employeeId),
        date: { $gte: dateFrom, $lte: dateTo },
    }).lean();

    const summary = {
        present: 0,
        absent: 0,
        late: 0,
        halfDay: 0,
        leave: 0,
        totalWorkingHours: 0,
    };

    for (const r of records) {
        summary.totalWorkingHours += r.workingHours ?? 0;
        switch (r.status) {
            case AttendanceStatus.PRESENT:
                summary.present++;
                break;
            case AttendanceStatus.ABSENT:
                summary.absent++;
                break;
            case AttendanceStatus.LATE:
                summary.late++;
                break;
            case AttendanceStatus.HALF_DAY:
                summary.halfDay++;
                break;
            case AttendanceStatus.LEAVE:
                summary.leave++;
                break;
        }
    }

    return res.json({ employeeId, month: m, year: y, ...summary });
};
