import { Request, Response } from "express";
import mongoose from "mongoose";
import PayrollModel from "../models/payroll-model.mongo";
import AttendanceModel from "../models/attendance-model.mongo";
import UserModel from "../models/user-model.mongo";
import { AttendanceStatus } from "../shared/models/attendance-model";
import { PayrollStatus } from "../shared/models/payroll-model";
import { UserRole } from "../shared/models/user-model";

// ─── Hằng số BH & Thuế TNCN (Việt Nam 2024-2026) ────────────────────────────
/** Lương cơ sở 2024: 2.340.000 VNĐ → trần đóng BH = 20 × lương cơ sở */
const INSURANCE_SALARY_CAP = 46_800_000; // 20 × 2.340.000
const EMPLOYEE_INSURANCE_RATE = 0.105; // BHXH 8% + BHYT 1.5% + BHTN 1%
const EMPLOYER_INSURANCE_RATE = 0.215; // BHXH 17.5% + BHYT 3% + BHTN 1%
const PERSONAL_DEDUCTION = 11_000_000; // Giảm trừ bản thân
const DEPENDENT_DEDUCTION = 4_400_000; // Giảm trừ mỗi người phụ thuộc

/** Tính bảo hiểm nhân viên và doanh nghiệp đóng */
const calcInsurance = (grossSalary: number) => {
    const base = Math.min(grossSalary, INSURANCE_SALARY_CAP);
    return {
        insuranceBase: base,
        employeeInsurance: Math.round(base * EMPLOYEE_INSURANCE_RATE),
        employerInsurance: Math.round(base * EMPLOYER_INSURANCE_RATE),
    };
};

/** Tính thuế TNCN theo biểu lũy tiến bộ phận (Điều 22 Luật Thuế TNCN) */
const calcPIT = (taxableIncome: number): number => {
    if (taxableIncome <= 0) return 0;
    const brackets: [number, number][] = [
        [5_000_000, 0.05],
        [5_000_000, 0.1], // 5  – 10 triệu
        [8_000_000, 0.15], // 10 – 18 triệu
        [14_000_000, 0.2], // 18 – 32 triệu
        [20_000_000, 0.25], // 32 – 52 triệu
        [28_000_000, 0.3], // 52 – 80 triệu
        [Infinity, 0.35], // > 80 triệu
    ];
    let tax = 0;
    let remaining = taxableIncome;
    for (const [limit, rate] of brackets) {
        if (remaining <= 0) break;
        const taxed = Math.min(remaining, limit);
        tax += taxed * rate;
        remaining -= taxed;
    }
    return Math.round(tax);
};

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

// ─── Tạo / tính toán bảng lương tháng ────────────────────────────────────────
export const generatePayroll = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const {
        month,
        year,
        branchId,
        standardDays = 26,
        allowances = 0,
    } = req.body;

    if (!month || !year) {
        return res.status(400).json({ message: "Cần truyền month và year." });
    }

    const m = parseInt(month);
    const y = parseInt(year);
    if (isNaN(m) || isNaN(y) || m < 1 || m > 12) {
        return res.status(400).json({ message: "month/year không hợp lệ." });
    }

    const targetBranch = req.targetBranchId ?? branchId;
    if (!targetBranch) {
        return res.status(400).json({ message: "Cần truyền branchId." });
    }

    // Lấy danh sách nhân viên thuộc chi nhánh
    const employees = await UserModel.find({
        branchId: new mongoose.Types.ObjectId(targetBranch),
        role: { $in: STAFF_ROLES },
        isActive: { $ne: false },
    }).lean();

    if (!employees.length) {
        return res
            .status(404)
            .json({ message: "Không có nhân viên nào trong chi nhánh." });
    }

    // Range ngày trong tháng
    const pad = (n: number) => String(n).padStart(2, "0");
    const daysInMonth = new Date(y, m, 0).getDate();
    const dateFrom = `${y}-${pad(m)}-01`;
    const dateTo = `${y}-${pad(m)}-${pad(daysInMonth)}`;

    const results: any[] = [];

    for (const emp of employees) {
        const empId = emp._id.toString();

        // Lấy chấm công tháng
        const records = await AttendanceModel.find({
            employeeId: emp._id,
            date: { $gte: dateFrom, $lte: dateTo },
        }).lean();

        let workingDays = 0;
        let leaveDays = 0;
        let deductions = 0;

        for (const r of records) {
            if (r.status === AttendanceStatus.PRESENT) workingDays++;
            else if (r.status === AttendanceStatus.LATE) {
                workingDays++;
                deductions += 50000; // phạt 50k/lần đi muộn
            } else if (r.status === AttendanceStatus.HALF_DAY) {
                workingDays += 0.5;
            } else if (r.status === AttendanceStatus.LEAVE) {
                leaveDays++;
            }
        }

        const baseSalary = emp.baseSalary ?? 0;
        const dependants = (emp as any).dependants ?? 0;
        const paidDays = workingDays + leaveDays;

        // Lương gộp (trước BH + thuế)
        const grossSalary = Math.max(
            0,
            Math.round((baseSalary * paidDays) / standardDays) +
                (allowances ?? 0) -
                deductions
        );

        // Bảo hiểm
        const { insuranceBase, employeeInsurance, employerInsurance } =
            calcInsurance(grossSalary);

        // Thu nhập tính thuế TNCN
        const taxableIncome = Math.max(
            0,
            grossSalary -
                employeeInsurance -
                PERSONAL_DEDUCTION -
                dependants * DEPENDENT_DEDUCTION
        );

        const personalIncomeTax = calcPIT(taxableIncome);

        // Lương thực lĩnh
        const actualSalary = Math.max(
            0,
            grossSalary - employeeInsurance - personalIncomeTax
        );

        const payroll = await PayrollModel.findOneAndUpdate(
            { employeeId: emp._id, month: m, year: y },
            {
                $set: {
                    branchId: targetBranch,
                    standardDays,
                    workingDays,
                    leaveDays,
                    baseSalary,
                    allowances: allowances ?? 0,
                    deductions,
                    grossSalary,
                    dependants,
                    insuranceBase,
                    employeeInsurance,
                    employerInsurance,
                    taxableIncome,
                    personalIncomeTax,
                    actualSalary,
                    status: PayrollStatus.DRAFT,
                },
            },
            { upsert: true, new: true }
        );

        results.push(payroll);
    }

    return res.status(201).json(results);
};

// ─── Lấy danh sách bảng lương ─────────────────────────────────────────────────
export const getPayrollList = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const { month, year, branchId, employeeId } = req.query as Record<
        string,
        string
    >;

    if (!month || !year) {
        return res.status(400).json({ message: "Cần truyền month và year." });
    }

    const filter: any = {
        month: parseInt(month),
        year: parseInt(year),
    };

    const targetBranch = req.targetBranchId ?? branchId;
    if (targetBranch)
        filter.branchId = new mongoose.Types.ObjectId(targetBranch);
    if (employeeId) filter.employeeId = new mongoose.Types.ObjectId(employeeId);

    const records = await PayrollModel.find(filter)
        .populate(
            "employeeId",
            "userName email phoneNumber role branchId baseSalary dependants"
        )
        .populate("confirmedBy", "userName")
        .sort({ employeeId: 1 })
        .lean();

    return res.json(records);
};

// ─── Cập nhật trạng thái (confirmed / paid) ──────────────────────────────────
export const updatePayrollStatus = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const { id } = req.params;
    const { status, note } = req.body;

    if (!Object.values(PayrollStatus).includes(status)) {
        return res.status(400).json({ message: "status không hợp lệ." });
    }

    const payroll = await PayrollModel.findById(id);
    if (!payroll) {
        return res.status(404).json({ message: "Không tìm thấy bảng lương." });
    }

    // Branch scope check
    if (
        req.targetBranchId &&
        payroll.branchId.toString() !== req.targetBranchId
    ) {
        return res.status(403).json({ message: "Không có quyền truy cập." });
    }

    payroll.status = status;
    if (note) payroll.note = note;
    if (status === PayrollStatus.CONFIRMED || status === PayrollStatus.PAID) {
        payroll.confirmedBy = req.user!.id as any;
    }
    await payroll.save();

    return res.json(payroll);
};

// ─── Xem bảng lương của bản thân ─────────────────────────────────────────────
export const getMyPayroll = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const { month, year } = req.query as Record<string, string>;
    const filter: any = {
        employeeId: new mongoose.Types.ObjectId(req.user!.id),
    };
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);

    const records = await PayrollModel.find(filter)
        .sort({ year: -1, month: -1 })
        .lean();
    return res.json(records);
};
