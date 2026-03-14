// src/schemas/wishlist.schema.ts
import * as yup from "yup";

// Mongo ObjectId regex
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

/* ------------------------
   Wishlist Body Schema
   Dùng cho các API gửi productId trong Body (POST, DELETE nếu dùng body...)
------------------------- */
export const wishlistBodySchema = yup.object({
  productId: yup
    .string()
    .trim()
    .matches(objectIdRegex, "Invalid Product ID format")
    .required("Product ID is required"),
});