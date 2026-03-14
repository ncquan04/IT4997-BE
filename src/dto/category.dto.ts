// src/schemas/category.schema.ts
import * as yup from "yup";

export const categorySchema = yup.object({
  name: yup
    .string()
    .trim()
    .min(1, "Name is required")
    .max(200, "Name must be at most 200 characters")
    .required("Name is required"),
}).required();
