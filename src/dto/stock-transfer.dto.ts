import * as yup from "yup";
import { Contacts } from "../shared/contacts";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const validStatuses = Object.values(Contacts.Status.Transfer) as number[];

const stockTransferItemSchema = yup
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

export const createStockTransferSchema = yup
    .object({
        fromBranchId: yup
            .string()
            .trim()
            .matches(objectIdRegex, "Invalid fromBranchId format")
            .required("fromBranchId is required"),
        toBranchId: yup
            .string()
            .trim()
            .matches(objectIdRegex, "Invalid toBranchId format")
            .required("toBranchId is required")
            .test(
                "different-branches",
                "toBranchId must be different from fromBranchId",
                function (value) {
                    return value !== this.parent.fromBranchId;
                }
            ),
        note: yup.string().trim().max(1000).default(""),
        items: yup
            .array()
            .of(stockTransferItemSchema)
            .min(1, "At least one item is required")
            .required("items is required"),
    })
    .required();

export const updateStockTransferStatusSchema = yup
    .object({
        status: yup
            .number()
            .oneOf(validStatuses, `status must be one of: ${validStatuses.join(", ")}`)
            .required("status is required"),
    })
    .required();
