import * as yup from "yup";
import { Contacts } from "../shared/contacts";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const VALID_WARRANTY_STATUSES = Object.values(
    Contacts.Status.Warranty
) as number[];

export const createWarrantyRequestSchema = yup
    .object({
        customerId: yup
            .string()
            .trim()
            .matches(objectIdRegex, "Invalid customerId format")
            .required("customerId is required"),
        orderId: yup
            .string()
            .trim()
            .matches(objectIdRegex, "Invalid orderId format")
            .optional(),
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
        branchId: yup
            .string()
            .trim()
            .matches(objectIdRegex, "Invalid branchId format")
            .required("branchId is required"),
        imeiOrSerial: yup
            .string()
            .trim()
            .min(1, "imeiOrSerial cannot be empty")
            .required("imeiOrSerial is required"),
        issueDescription: yup
            .string()
            .trim()
            .min(1)
            .max(2000)
            .required("issueDescription is required"),
        physicalCondition: yup
            .string()
            .trim()
            .min(1)
            .max(1000)
            .required("physicalCondition is required"),
        images: yup.array().of(yup.string().trim().required()).default([]),
        estimatedDate: yup.number().positive().optional(),
    })
    .required();

export const updateWarrantyStatusSchema = yup
    .object({
        status: yup
            .number()
            .oneOf(VALID_WARRANTY_STATUSES, "Invalid warranty status value")
            .required("status is required"),
    })
    .required();

export const createRepairLogSchema = yup
    .object({
        action: yup
            .string()
            .trim()
            .min(1)
            .max(1000)
            .required("action is required"),
        replacedParts: yup
            .array()
            .of(yup.string().trim().required())
            .default([]),
        cost: yup.number().min(0).default(0),
        note: yup.string().trim().max(2000).default(""),
    })
    .required();
