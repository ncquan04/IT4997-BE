import express from "express";
import { auth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { cartSchema } from "../dto/cart.dto";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";
import { addToCart, getCart, updateQuantity, removeItem } from "../services/cart.service";
const CartRouter = express.Router();

CartRouter.get("/cart-products", auth, verifyRole([UserRole.USER]),getCart);
CartRouter.post("/cart-products", auth, verifyRole([UserRole.USER]), validate(cartSchema), addToCart);
CartRouter.patch("/cart-products/", auth, verifyRole([UserRole.USER]), updateQuantity);
CartRouter.delete("/cart-products/", auth, verifyRole([UserRole.USER]), removeItem);
export default CartRouter;
