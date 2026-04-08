import { Document, Model, model, Schema } from "mongoose";
import { IPayroll, PayrollStatus } from "../shared/models/payroll-model";
import { userTableName } from "./user-model.mongo";
import { branchTableName } from "./branch-model.mongo";

export const payrollTableName = "Payroll";

const ObjectId = Schema.Types.ObjectId;

export interface PayrollModelDocument extends IPayroll, Document {
    _id: any;
}

export interface IPayrollModel extends Model<PayrollModelDocument> {}

const payrollSchema = new Schema<PayrollModelDocument>(
    {
        employeeId: {
            type: ObjectId as any,
            ref: userTableName,
            required: true,
        },
        branchId: {
            type: ObjectId as any,
            ref: branchTableName,
            required: true,
        },
        month: { type: Number, required: true, min: 1, max: 12 },
        year: { type: Number, required: true },
        standardDays: { type: Number, required: true },
        workingDays: { type: Number, required: true, min: 0 },
        leaveDays: { type: Number, default: 0, min: 0 },
        baseSalary: { type: Number, required: true, min: 0 },
        allowances: { type: Number, default: 0, min: 0 },
        deductions: { type: Number, default: 0, min: 0 },
        actualSalary: { type: Number, required: true, min: 0 },
        status: {
            type: String,
            enum: Object.values(PayrollStatus),
            default: PayrollStatus.DRAFT,
        },
        note: { type: String },
        confirmedBy: { type: ObjectId as any, ref: userTableName },
    },
    { versionKey: false, timestamps: true }
);

// Mỗi nhân viên chỉ có 1 bảng lương mỗi tháng/năm
payrollSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

const PayrollModel = model<PayrollModelDocument, IPayrollModel>(
    payrollTableName,
    payrollSchema
);

export default PayrollModel;
