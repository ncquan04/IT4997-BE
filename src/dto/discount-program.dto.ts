import * as yup from "yup";

export const createDiscountProgramSchema = yup.object({
    name: yup
        .string()
        .trim()
        .min(3, "Name must be at least 3 characters")
        .required("Name is required"),
    type: yup
        .string()
        .oneOf(["percent", "fixed"], "Type must be 'percent' or 'fixed'")
        .required("Type is required"),
    value: yup
        .number()
        .typeError("Value must be a number")
        .min(0, "Value must be >= 0")
        .required("Value is required"),
    maxDiscount: yup
        .number()
        .typeError("maxDiscount must be a number")
        .min(0, "maxDiscount must be >= 0")
        .default(0),
    scope: yup
        .string()
        .oneOf(
            ["product", "category", "all"],
            "Scope must be 'product', 'category', or 'all'"
        )
        .required("Scope is required"),
    applicableIds: yup.array().of(yup.string()).default([]),
    startAt: yup
        .number()
        .typeError("startAt must be a timestamp")
        .required("startAt is required"),
    endAt: yup
        .number()
        .typeError("endAt must be a timestamp")
        .required("endAt is required"),
    isActive: yup.boolean().default(true),
});

export const updateDiscountProgramSchema = yup.object({
    name: yup.string().trim().min(3),
    type: yup.string().oneOf(["percent", "fixed"]),
    value: yup.number().typeError("Value must be a number").min(0),
    maxDiscount: yup.number().typeError("maxDiscount must be a number").min(0),
    scope: yup.string().oneOf(["product", "category", "all"]),
    applicableIds: yup.array().of(yup.string()),
    startAt: yup.number().typeError("startAt must be a timestamp"),
    endAt: yup.number().typeError("endAt must be a timestamp"),
    isActive: yup.boolean(),
});
