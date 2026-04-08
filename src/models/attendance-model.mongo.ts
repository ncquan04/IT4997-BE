import { Document, Model, model, Schema } from "mongoose";
import {
    IAttendance,
    AttendanceStatus,
} from "../shared/models/attendance-model";
import { userTableName } from "./user-model.mongo";
import { branchTableName } from "./branch-model.mongo";

export const attendanceTableName = "Attendance";

const ObjectId = Schema.Types.ObjectId;

export interface AttendanceModelDocument extends IAttendance, Document {
    _id: any;
}

export interface IAttendanceModel extends Model<AttendanceModelDocument> {}

const attendanceSchema = new Schema<AttendanceModelDocument>(
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
        date: { type: String, required: true },
        checkInTime: { type: Number },
        checkOutTime: { type: Number },
        status: {
            type: String,
            enum: Object.values(AttendanceStatus),
            default: AttendanceStatus.PRESENT,
        },
        workingHours: { type: Number },
        note: { type: String },
        reviewedBy: { type: ObjectId as any, ref: userTableName },
    },
    { versionKey: false, timestamps: true }
);

// Mỗi nhân viên chỉ có 1 bản ghi chấm công mỗi ngày
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

const AttendanceModel = model<AttendanceModelDocument, IAttendanceModel>(
    attendanceTableName,
    attendanceSchema
);

export default AttendanceModel;
