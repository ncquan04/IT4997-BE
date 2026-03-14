import mongoose from "mongoose";
import WishlistModel from "../models/wishList-model.mongo";
import ProductModel from "../models/product-model.mongo";

export const addToWishlist = async (req: any, res: any) => {
  try {
    const userId = req.user.id; 
    const { productId } = req.body;

    // if (!mongoose.Types.ObjectId.isValid(req.body.productId)) {
    // return res.status(400).json({ message: "Invalid Product ID" });
    // }
    // 1. Kiểm tra product tồn tại
     
    const product = await ProductModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 2. Tìm Wishlist của user này trước
    let wishlist = await WishlistModel.findOne({ userId: userId });

    if (!wishlist) {
      // TRƯỜNG HỢP 1: User chưa có Wishlist -> Tạo mới
      wishlist = await WishlistModel.create({
        userId: userId,
        items: [{ productId: productId, addedAt: new Date() }]
      });
    } else {
      // TRƯỜNG HỢP 2: User đã có Wishlist -> Kiểm tra xem có sản phẩm này chưa
      
      // Tìm xem item đã tồn tại trong mảng chưa (so sánh string)
      const itemExists = wishlist.items.some(
        (item) => item.productId.toString() === productId
      );

      if (itemExists) {
        return res.status(400).json({ message: "Product already in wishlist" });
      }

      // Nếu chưa có, push vào mảng
      wishlist.items.push({ 
        productId: productId, 
        addedAt: new Date() 
      } as any); // cast any nếu TS báo lỗi strict type với Subdocument
      
      await wishlist.save();
    }

    // Populate để trả về dữ liệu 
    const populatedWishlist = await wishlist.populate({
         path: "items.productId",
         select: "title brand description images"
    });

    return res.status(200).json({
      message: "Product added to wishlist",
      data: populatedWishlist,
    });

  } catch (error) {
    return res.status(500).json({
      message: "Failed to add product to wishlist",
      error,
    });
  }
};

export const getWishlist = async (req: any, res: any) => {
  try {
    const userId = req.user.id;

    // 1. Populate lấy cả variants về
    const wishlistItems = await WishlistModel.findOne({ userId })
      .populate({
        path: "items.productId",
        select: "title brand description variants", // <--- Quan trọng: Phải lấy variants
      })
      .lean();

    if (!wishlistItems || !wishlistItems.items) {
      return res.status(200).json({ success: true, data: [] });
    }

    // 2. "Lấy variant đầu tiên" 
    const formattedData = wishlistItems.items
      .filter((item: any) => item.productId) // Lọc bỏ sản phẩm lỗi/đã bị xóa
      .map((item: any) => {
        const p = item.productId;
        
        // ---  ---
        // Lấy variant đầu tiên, nếu mảng rỗng thì null
        const firstVariant = p.variants?.length > 0 ? p.variants[0] : null;
        console.log(firstVariant)
        // Lấy ảnh từ variant đầu tiên đó
        // Nếu firstVariant tồn tại -> lấy ảnh số 0. Nếu không -> null
        const displayImage = firstVariant?.images?.length > 0 
                             ? firstVariant.images[0] 
                             : null;
        
        const displayPrice = firstVariant ? firstVariant.price : 0;
        // --------------------------

        return {
          wishlistItemId: item._id,
          productId: p._id,
          title: p.title, 
          brand: p.brand,
          // Trả về ảnh và giá của variant đầu tiên
          image: displayImage, 
          price: displayPrice,
          addedAt: item.addedAt,
        };
      });

    return res.status(200).json({
      success: true,
      data: formattedData,
    });

  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch wishlist", error });
  }
};

export const checkWishlist = async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    //  QUERY:
    // Tìm document thỏa mãn 2 điều kiện cùng lúc:
    // 1. Của userId này
    // 2. Trong mảng 'items' có chứa phần tử có productId trùng khớp
    const exists = await WishlistModel.findOne(
      {
        userId: userId,
        "items.productId": productId, // Query lồng vào mảng
      },
      { _id: 1 } // Projection
    );

    return res.status(200).json({
      exists: !!exists, // Nếu tìm thấy (object) -> true, nếu null -> false
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to check wishlist",
      error,
    });
  }
};


export const removeFromWishlist = async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ message: "Invalid Product ID" });
    }

    //  Dùng updateOne và $pull
    const result = await WishlistModel.updateOne(
      { userId: userId }, // 1. Tìm wishlist của user này
      {
        $pull: {
          items: { productId: productId } // 2. Đưa item có productId này ra khỏi mảng items
        }
      },
      { timestamps: false } 
      // Tránh modifiedCount = 1
    );

    // Kiểm tra xem có gì thay đổi không
    // modifiedCount = 0 nghĩa là:
    // - Hoặc User chưa có wishlist
    // - Hoặc Sản phẩm này không có trong wishlist để mà xóa
    console.log(result)
    if (result.modifiedCount === 0) {
      return res.status(404).json({
        message: "Product not found in wishlist",
      });
    }

    return res.status(200).json({
      message: "Product removed from wishlist successfully",
    });

  } catch (error) {
    return res.status(500).json({
      message: "Failed to remove product from wishlist",
      error,
    });
  }
};

export const clearWishlist = async (req: any, res: any) => {
  try {
    const userId = req.user.id;

    const result = await WishlistModel.updateOne(
      { userId: userId },
      { $set: { items: [] } } // Làm rỗng mảng items
    );

    // Kiểm tra xem user có wishlist không 
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Wishlist not found" });
    }

    return res.status(200).json({ 
      message: "Wishlist cleared successfully",
      data: [] // Trả về mảng rỗng để FE set lại state luôn
    });

  } catch (error) {
    // Quan trọng: Phải catch lỗi 500
    return res.status(500).json({ 
      message: "Failed to clear wishlist", 
      error 
    });
  }
};