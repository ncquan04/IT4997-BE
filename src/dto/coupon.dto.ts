import * as yup from "yup";

export const createCouponSchema = yup.object({
    code: yup
        .string()
        .trim()
        .uppercase()
        .min(3, "Code must be at least 3 characters")
        .max(20, "Code must be at most 20 characters")
        .required("Code is required"),
    type: yup
        .string()
        .oneOf(["percent", "fixed"], "Type must be 'percent' or 'fixed'")
        .required("Type is required"),
    value: yup
        .number()
        .typeError("Value must be a number")
        .min(0, "Value must be >= 0")
        .required("Value is required"),
    minOrderValue: yup
        .number()
        .typeError("minOrderValue must be a number")
        .min(0, "minOrderValue must be >= 0")
        .default(0),
    maxDiscount: yup
        .number()
        .typeError("maxDiscount must be a number")
        .min(0, "maxDiscount must be >= 0")
        .default(0),
    maxUsage: yup
        .number()
        .typeError("maxUsage must be a number")
        .integer("maxUsage must be an integer")
        .min(0, "maxUsage must be >= 0")
        .default(0),
    expiredAt: yup
        .number()
        .typeError("expiredAt must be a timestamp")
        .min(Date.now(), "expiredAt must be in the future")
        .required("expiredAt is required"),
    isActive: yup.boolean().default(true),
    applicableProducts: yup.array().of(yup.string()).default([]),
});

export const updateCouponSchema = yup.object({
    type: yup
        .string()
        .oneOf(["percent", "fixed"], "Type must be 'percent' or 'fixed'"),
    value: yup
        .number()
        .typeError("Value must be a number")
        .min(0, "Value must be >= 0"),
    minOrderValue: yup
        .number()
        .typeError("minOrderValue must be a number")
        .min(0, "minOrderValue must be >= 0"),
    maxDiscount: yup
        .number()
        .typeError("maxDiscount must be a number")
        .min(0, "maxDiscount must be >= 0"),
    maxUsage: yup
        .number()
        .typeError("maxUsage must be a number")
        .integer("maxUsage must be an integer")
        .min(0, "maxUsage must be >= 0"),
    expiredAt: yup.number().typeError("expiredAt must be a timestamp"),
    isActive: yup.boolean(),
    applicableProducts: yup.array().of(yup.string()),
});
