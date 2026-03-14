// src/schemas/product.schema.ts
import * as yup from "yup";
import { Contacts } from "../shared/contacts";

const STATUS_EVALUATION = Contacts.Status.Evaluation;
const validStatus = Object.values(STATUS_EVALUATION);

// Mongo ObjectId regex
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

/* ------------------------
   Spec Item
------------------------- */
const specItemSchema = yup.object({
  key: yup.string().trim().required("Spec key is required"),
  value: yup.string().trim().required("Spec value is required"),
});

/* ------------------------
   Variant (MATCHES MONGOOSE)
------------------------- */
const productVariantSchema = yup.object({
  version: yup.string().trim().required("Variant version is required"),

  colorName: yup.string().trim().required("Color name is required"),

  hexcode: yup
    .string()
    .trim()
    .matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Invalid hex color")
    .required("Hex code is required"),

  images: yup
    .array()
    .of(yup.string().trim().url("Image URL must be valid"))
    .default([]),

  quantity: yup
    .number()
    .typeError("Quantity must be a number")
    .integer("Quantity must be an integer")
    .min(0, "Quantity cannot be negative")
    .default(0),

  price: yup
    .number()
    .transform((v, original) => {
      if (original === "" || original === null || original === undefined) return undefined;
      const n = Number(original);
      return Number.isNaN(n) ? v : n;
    })
    .typeError("Price must be a number")
    .min(0, "Price must be >= 0")
    .required("Price is required"),

  salePrice: yup
    .number()
    .transform((v, orig) => {
      if (orig === "" || orig === null || orig === undefined) return null;
      const n = Number(orig);
      return Number.isNaN(n) ? v : n;
    })
    .nullable()
    .test("salePrice<=price", "Sale price must be <= price", function (val) {
      const { price } = this.parent;
      if (val == null) return true;
      return val <= price;
    }),

  sku: yup.string().trim().nullable().optional(),
});

/* ------------------------
   Product DTO (ROOT)
------------------------- */
export const productSchema = yup
  .object({
    title: yup.string().trim().max(255).required("Title is required"),
    brand: yup.string().trim().required("Brand is required"),
    description: yup.string().trim().required("Description is required"),

    descriptionDetail: yup
      .string()
      .trim()
      .required("DescriptionDetail is required"),

    specifications: yup.array().of(specItemSchema).default([]),

    variants: yup
      .array()
      .of(productVariantSchema)
      .min(1, "Product must have at least 1 variant")
      .default([]),

    categoryId: yup
      .string()
      .trim()
      .matches(objectIdRegex, "Invalid Category ID format")
      .required("CategoryId is required"),

    isHide: yup
      .number()
      .oneOf(validStatus as any, "Invalid evaluation status")
      .default(STATUS_EVALUATION.HIDE),

    rating: yup
      .number()
      .nullable()
      .transform((v, orig) => {
        if (orig === "" || orig === null || orig === undefined) return null;
        const n = Number(orig);
        return Number.isNaN(n) ? v : n;
      })
      .min(1, "Rating must be >= 1")
      .max(5, "Rating must be <= 5")
      .optional(),
  })
  .required();

  export const updateProductSchema = yup.object({
    title: yup.string().trim().max(255), // Đã bỏ .required()
    
    brand: yup.string().trim(), // Đã bỏ .required()
    
    description: yup.string().trim(),
    
    descriptionDetail: yup.string().trim(),

    // Tận dụng lại schema cũ, không cần viết lại logic bên trong
    specifications: yup.array().of(specItemSchema).default(undefined), 

    // Khi update variants: Thường là gửi cả mảng variants mới đè lên mảng cũ
    variants: yup
      .array()
      .of(productVariantSchema)
      .min(1, "If updating variants, must have at least 1")
      .default(undefined), // Để undefined để nếu ko gửi thì ko update

    categoryId: yup
      .string()
      .trim()
      .matches(objectIdRegex, "Invalid Category ID format"),

    isHide: yup
      .number()
      .oneOf(validStatus as any, "Invalid evaluation status"),

    rating: yup
      .number()
      .nullable()
      .min(1).max(5)
      .transform((v, orig) => (orig === "" ? null : v)),
});
