import { Document, Model, model, Schema } from "mongoose";
import { IRepairLog } from "../shared/models/repair-log-model";
import { warrantyRequestTableName } from "./warranty-request-model.mongo";
import { userTableName } from "./user-model.mongo";

export const repairLogTableName = "RepairLog";
const ObjectId = Schema.Types.ObjectId;

export interface RepairLogDocument extends IRepairLog, Document {
    _id: any;
}
export interface IRepairLogModel extends Model<RepairLogDocument> {}

const repairLogSchema = new Schema<RepairLogDocument>(
    {
        warrantyRequestId: {
            type: ObjectId as any,
            ref: warrantyRequestTableName,
            required: true,
        },
        imeiOrSerial: { type: String, required: true, trim: true },
        action: { type: String, required: true, trim: true },
        replacedParts: { type: [String], default: [] },
        cost: { type: Number, required: true, min: 0, default: 0 },
        technicianId: {
            type: ObjectId as any,
            ref: userTableName,
            required: true,
        },
        note: { type: String, trim: true, default: "" },
    },
    { versionKey: false, timestamps: true }
);

repairLogSchema.index({ warrantyRequestId: 1, createdAt: -1 });
repairLogSchema.index({ imeiOrSerial: 1 });

const RepairLogModel = model<RepairLogDocument, IRepairLogModel>(
    repairLogTableName,
    repairLogSchema
);

export default RepairLogModel;
