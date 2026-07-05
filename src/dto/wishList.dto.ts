// src/schemas/wishlist.schema.ts
import * as yup from "yup";

// Mongo ObjectId regex
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const wishlistBodySchema = yup.object({
  productId: yup
    .string()
    .trim()
    .matches(objectIdRegex, "Invalid Product ID format")
    .required("Product ID is required"),
});