import * as yup from "yup";
import mongoose from "mongoose";

const isObjectId = (value: string) => {
    return mongoose.Types.ObjectId.isValid(value);
};

// DTO làm phẳng hoàn toàn để khớp với Postman
export const createRefundReportSchema = yup.object({
    orderId: yup
        .string()
        .test("is-objectId", "Mã đơn hàng không hợp lệ", (val) =>
            isObjectId(val || "")
        )
        .required("orderId là bắt buộc"),

    paymentId: yup
        .string()
        .test("is-objectId", "Mã thanh toán không hợp lệ", (val) =>
            isObjectId(val || "")
        )
        .required("paymentId là bắt buộc"),

    // Các trường đã làm phẳng (Flat)
    cusName: yup.string().required("Tên khách hàng (cusName) là bắt buộc"),

    cusMail: yup
        .string()
        .email("Email không đúng định dạng")
        .required("Email (cusMail) là bắt buộc"),

    cusPhone: yup
        .string()
        .matches(/^[0-9]+$/, "Số điện thoại chỉ được chứa số")
        .min(10, "Số điện thoại tối thiểu 10 số")
        .required("Số điện thoại (cusPhone) là bắt buộc"),

    reason: yup
        .string()
        .min(10, "Lý do hoàn tiền ít nhất 10 ký tự")
        .required("Lý do là bắt buộc"),

    amount: yup
        .number()
        .transform((value, originalValue) =>
            originalValue === "" ? undefined : value
        )
        .typeError("Số tiền phải là một con số")
        .positive("Số tiền phải lớn hơn 0")
        .required("Số tiền là bắt buộc"),

    images: yup
        .array()
        .of(yup.string().url("Mỗi hình ảnh phải là một URL hợp lệ"))
        .min(1, "Phải có ít nhất một hình ảnh")
        .required("Hình ảnh là bắt buộc"),
});

export type RefundReportDto = yup.InferType<typeof createRefundReportSchema>;
