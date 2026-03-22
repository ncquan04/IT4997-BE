import * as yup from "yup";
import { Contacts } from "../shared/contacts";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const validReasons = Object.values(Contacts.ExportReason);

const stockExportItemSchema = yup
    .object({
        productId: yup
            .string()
            .trim()
            .matches(objectIdRegex, "Invalid productId format")
            .required("productId is required"),
        variantId: yup
            .string()
            .trim()
            .matches(objectIdRegex, "Invalid variantId format")
            .required("variantId is required"),
        imeiList: yup
            .array()
            .of(yup.string().trim().required("imei must not be empty"))
            .min(1, "imeiList must contain at least one IMEI")
            .required("imeiList is required"),
    })
    .required();

export const createStockExportSchema = yup
    .object({
        branchId: yup
            .string()
            .trim()
            .matches(objectIdRegex, "Invalid branchId format")
            .required("branchId is required"),
        reason: yup
            .string()
            .oneOf(
                validReasons,
                `reason must be one of: ${validReasons.join(", ")}`
            )
            .required("reason is required"),
        note: yup.string().trim().max(1000).default(""),
        items: yup
            .array()
            .of(stockExportItemSchema)
            .min(1, "At least one item is required")
            .required("items is required"),
    })
    .required();

export const updateStockExportStatusSchema = yup
    .object({
        status: yup
            .number()
            .oneOf(
                Object.values(Contacts.Status.Stock) as number[],
                "Invalid status value"
            )
            .required("status is required"),
    })
    .required();
