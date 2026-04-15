import { Request, Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import UserModel from "../models/user-model.mongo";
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

// ─── Danh sách nhân viên ─────────────────────────────────────────────────────
export const getEmployees = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const { role, isActive, search } = req.query as Record<string, string>;

    const filter: any = {
        role: { $in: STAFF_ROLES },
    };

    const targetBranch = req.targetBranchId ?? (req.query.branchId as string);
    if (targetBranch)
        filter.branchId = new mongoose.Types.ObjectId(targetBranch);
    if (role && STAFF_ROLES.includes(role as UserRole)) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (search) {
        filter.$or = [
            { userName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { phoneNumber: { $regex: search, $options: "i" } },
        ];
    }

    const employees = await UserModel.find(filter)
        .select(
            "-password -verifyCode -memberTier -loyaltyPoints -totalSpent -spentInWindow -windowStartAt -address"
        )
        .populate("branchId", "name address")
        .sort({ userName: 1 })
        .lean();

    return res.json(employees);
};

// ─── Chi tiết nhân viên ───────────────────────────────────────────────────────
export const getEmployeeById = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const { id } = req.params;

    const employee = await UserModel.findById(id)
        .select("-password -verifyCode")
        .populate("branchId", "name address")
        .lean();

    if (!employee)
        return res.status(404).json({ message: "Không tìm thấy nhân viên." });
    if (!STAFF_ROLES.includes(employee.role as UserRole)) {
        return res.status(404).json({ message: "Không tìm thấy nhân viên." });
    }

    // Branch scope
    if (
        req.targetBranchId &&
        employee.branchId?.toString() !== req.targetBranchId
    ) {
        return res.status(403).json({ message: "Không có quyền truy cập." });
    }

    return res.json(employee);
};

// ─── Cập nhật thông tin nhân viên (role, branchId, baseSalary, isActive) ─────
export const updateEmployee = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const { id } = req.params;
    const {
        role,
        branchId,
        baseSalary,
        startDate,
        isActive,
        userName,
        phoneNumber,
        dependants,
    } = req.body;

    const employee = await UserModel.findById(id);
    if (!employee)
        return res.status(404).json({ message: "Không tìm thấy nhân viên." });
    if (!STAFF_ROLES.includes(employee.role as UserRole)) {
        return res.status(404).json({ message: "Không tìm thấy nhân viên." });
    }

    // Branch scope: manager chỉ được sửa nhân viên chi nhánh mình
    if (
        req.targetBranchId &&
        employee.branchId?.toString() !== req.targetBranchId
    ) {
        return res.status(403).json({ message: "Không có quyền truy cập." });
    }

    // Admin mới được chuyển role / branch
    if (req.user?.role === UserRole.ADMIN) {
        if (role && STAFF_ROLES.includes(role)) employee.role = role;
        if (branchId) employee.branchId = branchId;
    }

    if (typeof baseSalary === "number" && baseSalary >= 0)
        employee.baseSalary = baseSalary;
    if (typeof startDate === "number") employee.startDate = startDate;
    if (typeof isActive === "boolean") employee.isActive = isActive;
    if (userName) employee.userName = userName;
    if (phoneNumber) employee.phoneNumber = phoneNumber;
    if (typeof dependants === "number" && dependants >= 0)
        (employee as any).dependants = dependants;

    await employee.save();

    const updated = await UserModel.findById(employee._id)
        .select(
            "-password -verifyCode -memberTier -loyaltyPoints -totalSpent -spentInWindow -windowStartAt -address"
        )
        .populate("branchId", "name address")
        .lean();
    return res.json(updated);
};

// ─── Tạo nhân viên mới ───────────────────────────────────────────────────────
export const createEmployee = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    const {
        userName,
        email,
        phoneNumber,
        password,
        role,
        branchId,
        baseSalary,
        startDate,
        dependants,
    } = req.body;

    if (!userName || !email || !phoneNumber || !password) {
        return res.status(400).json({ message: "Missing required fields." });
    }
    if (role && !STAFF_ROLES.includes(role as UserRole)) {
        return res.status(400).json({ message: "Invalid role." });
    }

    const existing = await UserModel.findOne({ email });
    if (existing) {
        return res.status(409).json({ message: "Email already in use." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const employee = new UserModel({
        userName,
        email,
        phoneNumber,
        password: hashedPassword,
        role:
            role && STAFF_ROLES.includes(role as UserRole)
                ? role
                : UserRole.SALES,
        branchId: branchId || undefined,
        baseSalary: typeof baseSalary === "number" ? baseSalary : 0,
        startDate: typeof startDate === "number" ? startDate : Date.now(),
        isActive: true,
        dependants:
            typeof dependants === "number" && dependants >= 0 ? dependants : 0,
    });

    await employee.save();

    const result = employee.toObject() as any;
    delete result.password;
    delete result.verifyCode;
    return res.status(201).json(result);
};
