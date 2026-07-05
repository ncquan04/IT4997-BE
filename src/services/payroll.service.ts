import { Request, Response } from "express";
import mongoose from "mongoose";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const xl = require("excel4node");
import PayrollModel from "../models/payroll-model.mongo";
import AttendanceModel from "../models/attendance-model.mongo";
import UserModel from "../models/user-model.mongo";
import { AttendanceStatus } from "../shared/models/attendance-model";
import { PayrollStatus } from "../shared/models/payroll-model";
import { UserRole } from "../shared/models/user-model";

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

export const exportPayroll = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const { month, year, branchId, format = "xlsx" } = req.query as Record<string, string>;

    if (!month || !year) {
        return res.status(400).json({ message: "Cần truyền month và year." });
    }

    const filter: any = {
        month: parseInt(month),
        year: parseInt(year),
    };

    const targetBranch = req.targetBranchId ?? branchId;
    if (targetBranch) filter.branchId = new mongoose.Types.ObjectId(targetBranch);

    const records = await PayrollModel.find(filter)
        .populate("employeeId", "userName email phoneNumber role")
        .sort({ employeeId: 1 })
        .lean();

    const filename = `payroll-${year}-${String(month).padStart(2, "0")}`;

    if (format === "csv") {
        const headers = [
            "Nhân viên", "Email", "Vai trò",
            "Tháng", "Năm",
            "Ngày chuẩn", "Ngày công", "Ngày nghỉ",
            "Lương cơ bản", "Phụ cấp", "Khấu trừ", "Lương gộp",
            "Người phụ thuộc", "Căn cứ BH", "NV đóng BH", "DN đóng BH",
            "Thu nhập tính thuế", "Thuế TNCN",
            "Lương thực lĩnh", "Trạng thái",
        ];

        const escape = (v: any) => {
            const s = String(v ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n")
                ? `"${s.replace(/"/g, '""')}"`
                : s;
        };

        const rows = records.map((r) => {
            const emp = r.employeeId as any;
            return [
                emp?.userName ?? "",
                emp?.email ?? "",
                emp?.role ?? "",
                r.month, r.year,
                r.standardDays, r.workingDays, r.leaveDays,
                r.baseSalary, r.allowances, r.deductions, r.grossSalary,
                r.dependants, r.insuranceBase, r.employeeInsurance, r.employerInsurance,
                r.taxableIncome, r.personalIncomeTax,
                r.actualSalary, r.status,
            ].map(escape).join(",");
        });

        const csv = [headers.join(","), ...rows].join("\r\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
        // BOM for Excel UTF-8 recognition
        return res.end("\uFEFF" + csv);
    }

    const wb = new xl.Workbook();
    const ws = wb.addWorksheet(`Payroll ${month}-${year}`);

    const headerStyle = wb.createStyle({
        font: { bold: true, color: "#FFFFFF", size: 11 },
        fill: { type: "pattern", patternType: "solid", fgColor: "#2563EB" },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
            left: { style: "thin" }, right: { style: "thin" },
            top: { style: "thin" }, bottom: { style: "thin" },
        },
    });

    const cellStyle = wb.createStyle({
        border: {
            left: { style: "thin" }, right: { style: "thin" },
            top: { style: "thin" }, bottom: { style: "thin" },
        },
        alignment: { vertical: "center" },
    });

    const numStyle = wb.createStyle({
        numberFormat: "#,##0",
        border: {
            left: { style: "thin" }, right: { style: "thin" },
            top: { style: "thin" }, bottom: { style: "thin" },
        },
        alignment: { horizontal: "right", vertical: "center" },
    });

    const headers = [
        "Nhân viên", "Email", "Vai trò",
        "Tháng", "Năm",
        "Ngày chuẩn", "Ngày công", "Ngày nghỉ",
        "Lương cơ bản", "Phụ cấp", "Khấu trừ", "Lương gộp",
        "Người PT", "Căn cứ BH", "NV đóng BH", "DN đóng BH",
        "TN tính thuế", "Thuế TNCN",
        "Lương thực lĩnh", "Trạng thái",
    ];
    const colWidths = [20, 25, 12, 6, 6, 8, 8, 8, 15, 12, 12, 15, 8, 15, 14, 14, 15, 12, 18, 12];

    headers.forEach((h, i) => {
        ws.cell(1, i + 1).string(h).style(headerStyle);
        ws.column(i + 1).setWidth(colWidths[i]);
    });
    ws.row(1).setHeight(30);

    const numericCols = new Set([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

    records.forEach((r, idx) => {
        const row = idx + 2;
        const emp = r.employeeId as any;
        const values = [
            emp?.userName ?? "",
            emp?.email ?? "",
            emp?.role ?? "",
            r.month, r.year,
            r.standardDays, r.workingDays, r.leaveDays,
            r.baseSalary, r.allowances, r.deductions, r.grossSalary,
            r.dependants, r.insuranceBase, r.employeeInsurance, r.employerInsurance,
            r.taxableIncome, r.personalIncomeTax,
            r.actualSalary, r.status,
        ];

        values.forEach((v, i) => {
            const col = i + 1;
            if (numericCols.has(col) && typeof v === "number") {
                ws.cell(row, col).number(v).style(numStyle);
            } else {
                ws.cell(row, col).string(String(v ?? "")).style(cellStyle);
            }
        });
    });

    res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
    wb.write(`${filename}.xlsx`, res);
};
