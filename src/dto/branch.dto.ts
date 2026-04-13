import * as yup from "yup";

export const updateBranchStatusSchema = yup
    .object({
        isActive: yup.boolean().required("isActive is required"),
    })
    .required();

export const createBranchSchema = yup
    .object({
        name: yup.string().required("name is required"),
        address: yup.string().required("address is required"),
        phone: yup.string().required("phone is required"),
        managerId: yup.string().required("managerId is required"),
        isActive: yup.boolean().default(true),
        rentCost: yup.number().min(0).default(0),
    })
    .required();

export const updateBranchSchema = yup
    .object({
        name: yup.string(),
        address: yup.string(),
        phone: yup.string(),
        managerId: yup.string(),
        isActive: yup.boolean(),
        rentCost: yup.number().min(0),
    })
    .required();
