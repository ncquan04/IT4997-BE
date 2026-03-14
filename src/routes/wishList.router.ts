import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";
import { wishlistBodySchema } from "../dto/wishList.dto";
import { validate } from "../middlewares/validate";
import {
  addToWishlist,
  getWishlist,
  checkWishlist,
  removeFromWishlist,
  clearWishlist,
} from "../services/wishList.service";

const WishListRouter = express.Router();


WishListRouter.get(
  "/wish-list",
  auth,
  verifyRole([UserRole.USER]),
  getWishlist
);


WishListRouter.post(
  "/wish-list",
  auth,
  verifyRole([UserRole.USER]),
  validate(wishlistBodySchema),
  addToWishlist
);


WishListRouter.get(
  "/wish-list/:productId",
  auth,
  verifyRole([UserRole.USER]),
  checkWishlist
);


WishListRouter.delete(
  "/wish-list/:productId",
  auth,
  verifyRole([UserRole.USER]),
  removeFromWishlist
);

WishListRouter.delete(
  "/wish-list",
  auth,
  verifyRole([UserRole.USER]),
  clearWishlist
);

export default WishListRouter;
