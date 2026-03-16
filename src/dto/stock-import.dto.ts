import * as yup from "yup";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const stockImportItemSchema = yup
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
        unitCost: yup
            .number()
            .transform((v, original) => {
                if (
                    original === "" ||
                    original === null ||
                    original === undefined
                )
                    return undefined;
                const n = Number(original);
                return Number.isNaN(n) ? v : n;
            })
            .typeError("unitCost must be a number")
            .min(0, "unitCost must be >= 0")
            .required("unitCost is required"),
        imeiList: yup
            .array()
            .of(yup.string().trim().required("imei must not be empty"))
            .min(1, "imeiList must contain at least one IMEI")
            .required("imeiList is required"),
    })
    .required();

export const createStockImportSchema = yup
    .object({
        branchId: yup
            .string()
            .trim()
            .matches(objectIdRegex, "Invalid branchId format")
            .required("branchId is required"),
        supplierId: yup
            .string()
            .trim()
            .matches(objectIdRegex, "Invalid supplierId format")
            .required("supplierId is required"),
        note: yup.string().trim().max(1000).default(""),
        items: yup
            .array()
            .of(stockImportItemSchema)
            .min(1, "At least one item is required")
            .required("items is required"),
    })
    .required();
