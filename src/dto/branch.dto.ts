import * as yup from "yup";

export const updateBranchStatusSchema = yup
    .object({
        isActive: yup.boolean().required("isActive is required"),
    })
    .required();
