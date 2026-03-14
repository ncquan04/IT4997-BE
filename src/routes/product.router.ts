import express from "express";
import { addProduct, updateProduct, getAllProducts, changeProductStatus, getProductById } from '../services/product.service';
import { auth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { productSchema, updateProductSchema } from "../dto/product.dto";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";

const ProductRouter = express.Router();

// Admin only
ProductRouter.put("/products/:id", auth, verifyRole([UserRole.ADMIN]), validate(updateProductSchema), updateProduct);
ProductRouter.patch("/products/:id/status", auth, verifyRole([UserRole.ADMIN]), changeProductStatus);
ProductRouter.post("/products", auth, verifyRole([UserRole.ADMIN]), validate(productSchema), addProduct);


// Public routes
ProductRouter.get("/products", getAllProducts);
ProductRouter.get("/products/:id", getProductById);

export default ProductRouter;
