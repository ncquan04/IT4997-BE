import mongoose from "mongoose";
import CartModel from "../models/cart-model.mongo";
import ProductModel from "../models/product-model.mongo";
// 1. Thêm sản phẩm vào giỏ hàng
export const addToCart = async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const { productId, variantId, quantity } = req.body;
        const product = await ProductModel.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        // 3. KIỂM TRA VARIANT CÓ TỒN TẠI TRONG SẢN PHẨM ĐÓ KHÔNG
        // Chú ý
        // Lưu ý: product.variants là một Mongoose Array, nên có thể dùng hàm .id() hoặc .find()
        // Cách chắc chắn nhất là so sánh chuỗi string
        const variantExists = product.variants.find(
            (v: any) => v._id.toString() === variantId.toString()
        );

        if (!variantExists) {
            return res
                .status(404)
                .json({ message: "Variant ID does not exist in this product" });
        }
        // Validate quantity
        if (!quantity || quantity <= 0) {
            return res
                .status(400)
                .json({ message: "Quantity must be greater than 0" });
        }

        // Cập nhật giỏ hàng
        const updatedCart = await CartModel.findOneAndUpdate(
            {
                userId: userId,
                productId: productId,
                variantId: variantId,
            },
            {
                $inc: { quantity: quantity }, // Cộng dồn số lượng
            },
            {
                new: true, // Trả về document mới
                upsert: true, // Nếu chưa có thì tạo mới
                setDefaultsOnInsert: true,
            }
        );

        res.status(200).json({
            message: "Product added to cart",
            data: updatedCart,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to add product to cart",
            error,
        });
    }
};

// 2. Lấy danh sách giỏ hàng của User
export const getCart = async (req: any, res: any) => {
    try {
        const userId = req.user.id;

        const cartItems = await CartModel.find({ userId })
            .populate({
                path: "productId",
                select: "title variants brand description",
            })
            .lean();

        const finalCartItems = cartItems
            .map((item: any) => {
                const product = item.productId;
                if (!product) return null;

                const selectedVariant = product.variants?.find(
                    (v: any) => v._id.toString() === item.variantId.toString()
                );

                if (!selectedVariant) return null;

                return {
                    _id: item._id,
                    userId: item.userId,
                    quantity: item.quantity,
                    product: {
                        _id: product._id,
                        title: product.title,
                        brand: product.brand,
                        selectedVariant,
                    },
                };
            })
            .filter(Boolean); // 🔥 xoá null gọn gàng

        return res.status(200).json({
            success: true,
            data: finalCartItems,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch cart",
            error,
        });
    }
};

// 3. Cập nhật số lượng (Update Quantity)
export const updateQuantity = async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const { productId, variantId, quantity } = req.body;

        const query = {
            userId: new mongoose.Types.ObjectId(userId),
            productId: new mongoose.Types.ObjectId(productId),
            variantId: new mongoose.Types.ObjectId(variantId), // <--- QUAN TRỌNG
        };
        // Trường hợp 1: Số lượng <= 0 -> Xóa sản phẩm
        if (quantity <= 0) {
            const deletedItem = await CartModel.findOneAndDelete(query);

            if (!deletedItem) {
                return res
                    .status(404)
                    .json({ message: "Item not found in cart" });
            }
            return res.status(200).json({
                message: "Item removed from cart because quantity is 0",
            });
        }

        // Trường hợp 2: Update số lượng mới
        const updatedItem = await CartModel.findOneAndUpdate(
            query,
            { quantity: quantity },
            { new: true }
        ).lean();

        if (!updatedItem) {
            return res.status(404).json({ message: "Item not found in cart" });
        }

        res.status(200).json({
            message: "Cart updated successfully",
            data: updatedItem,
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to update cart", error });
    }
};

// 4. Xóa hẳn sản phẩm khỏi giỏ
export const removeItem = async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const { productId, variantId } = req.body;

        const result = await CartModel.deleteOne({
            userId: new mongoose.Types.ObjectId(userId),
            productId: new mongoose.Types.ObjectId(productId),
            variantId: new mongoose.Types.ObjectId(variantId),
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Item not found in cart" });
        }

        res.status(200).json({
            message: "Item removed from cart successfully",
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to remove item from cart",
            error,
        });
    }
};
