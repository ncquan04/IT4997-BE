import * as yup from "yup";
import { Contacts } from "../shared/contacts";
import mongoose from "mongoose";
const STATUS_EVALUATION = Contacts.Status.Evaluation;

const isValidObjectId = (value: string) => {
    return mongoose.Types.ObjectId.isValid(value);
};

export const evaluationSchema = yup.object({
    parentEvaluationId: yup
        .string()
        .test(
            "valid-parent-evaluation-id",
            "Invalid parent evaluation ID format",
            function (value) {
                if (value === undefined || value === null || value === "") {
                    return true; // Allow null or undefined
                }
                return isValidObjectId(value);
            }
        )
        .nullable(),
    content: yup
        .array()
        .of(yup.string().required("Content item is required"))
        .default([]),

    isHide: yup.number().default(STATUS_EVALUATION.PUBLIC),
    rate: yup
        .number()
        .nullable()
        .min(1, "Rating must be >= 1")
        .max(5, "Rating must be <= 5"),
    imageUrlFeedback: yup
        .array()
        .of(yup.string().url("Invalid image URL"))
        .default([]),
});
