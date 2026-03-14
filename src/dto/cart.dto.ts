// src/schemas/cart.schema.ts
import * as yup from "yup";

// Regex kiểm tra định dạng ObjectId của MongoDB (chuỗi 24 ký tự hex)
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const cartSchema = yup.object({
  productId: yup
    .string()
    .matches(objectIdRegex, "Invalid Product ID format") // Đảm bảo ID gửi lên đúng chuẩn MongoDB
    .required("Product ID is required"),
  
  variantId: yup
    .string()
    .matches(/^[0-9a-fA-F]{24}$/, "Invalid Variant ID")
    .required("Variant ID is required"),  

  quantity: yup
    .number()
    .typeError("Quantity must be a number") // Bắt lỗi nếu gửi chuỗi không phải số
    .integer("Quantity must be an integer") // Phải là số nguyên (không được 1.5)
    .min(1, "Quantity must be at least 1")  // Tối thiểu là 1
    .required("Quantity is required"),
}).required();