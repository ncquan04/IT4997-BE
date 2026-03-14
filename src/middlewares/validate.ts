import { Request, Response, NextFunction } from 'express';
import { Schema } from 'yup';

/**
 * @param schema Yup schema định nghĩa cấu trúc dữ liệu mong muốn
 */
export const validate = (schema: Schema) => async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const validated = await schema.validate(req.body, { abortEarly: false , stripUnknown: true });
        req.body = validated;
        // Nếu validation thành công,gọi next() để chuyển cho login service xử lý
        next();
    } catch (error: any) {
        // Nếu validation thất bại, trả về lỗi 400 Bad Request
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                type: error.name,
                errors: error.errors, 
            });
        }
        // Chuyển lỗi không phải Validation Error sang Express Error Handler
        next(error); 
    }
};