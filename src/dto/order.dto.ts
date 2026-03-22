import * as yup from "yup";

export const productItemSchema = yup.object({
    productId: yup.string().required("productId is required"),

    variantId: yup.string().required("variantId is required"),

    title: yup.string().required("title is required"),

    description: yup.string().required("description is required"),

    price: yup
        .number()
        .required("price is required")
        .min(0, "price must be >= 0"),

    quantity: yup
        .number()
        .required("quantity is required")
        .integer("quantity must be integer")
        .min(1, "quantity must be >= 1"),

    discount: yup.number().min(0, "discount must be >= 0").nullable(),

    totalMoney: yup
        .number()
        .required("totalMoney is required")
        .min(0, "totalMoney must be >= 0"),
});

export const createOrderSchema = yup.object({
    listProduct: yup
        .array()
        .of(productItemSchema)
        .required("listProduct is required")
        .min(1, "Order must have at least one product"),

    sumPrice: yup
        .number()
        .required("sumPrice is required")
        .min(0, "sumPrice must be >= 0"),

    note: yup.string().nullable(),

    toAddress: yup.string().required("toAddress is required"),

    userName: yup.string().required("userName is required"),

    numberPhone: yup.string().required("numberPhone is required"),
});

export const changeOrderSchema = yup.object({
    orderId: yup.string().required("orderId is required"),
    statusOrder: yup.number().required("statusOrder is required"),
});

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const imeiAssignmentSchema = yup.object({
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
});

export const shipOrderSchema = yup.object({
    imeiAssignments: yup
        .array()
        .of(imeiAssignmentSchema)
        .min(1, "imeiAssignments must contain at least one item")
        .required("imeiAssignments is required"),
});
