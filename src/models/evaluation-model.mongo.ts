import { Document, Model, model, Schema } from "mongoose";
import { IEvaluation } from "../shared/models/evaluation-model";
import { userTableName } from "./user-model.mongo";
import { productTableName } from "./product-model.mongo";
import { Contacts } from "../shared/contacts";

const STATUS_EVALUATION = Contacts.Status.Evaluation;
const ObjectId = Schema.Types.ObjectId;

export const evaluationTableName = "Evaluation";

export interface EvaluationModelDocument extends Document, IEvaluation {
    _id: any;
}

export interface IEvaluationModel extends Model<EvaluationModelDocument> {}

const evaluationSchema = new Schema<EvaluationModelDocument>(
    {
        userId: { type: ObjectId as any, ref: userTableName, required: true },
        productId: {
            type: ObjectId as any,
            ref: productTableName,
            required: true,
        },
        parentEvaluationId: { type: ObjectId as any, required: false },
        content: { type: [String], required: true },
        rate: { type: Number, required: true },
        isHide: {
            type: Number,
            required: false,
            default: STATUS_EVALUATION.HIDE,
        },
        imageUrlFeedback: { type: [String], required: false },
    },
    { versionKey: false, timestamps: true }
);

const EvaluationModel = model<EvaluationModelDocument, IEvaluationModel>(
    evaluationTableName,
    evaluationSchema
);

export default EvaluationModel;
