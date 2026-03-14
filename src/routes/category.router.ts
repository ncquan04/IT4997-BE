import express from "express"

const CategoryRouter = express.Router();
import { validate } from "../middlewares/validate";
import {categorySchema} from "../dto/category.dto";
import { createCategory, getAllCategories, getCategoryById, updateCategory, deleteCategory } from "../services/category.service";
import { verifyRole } from "../middlewares/verifyRole";
import { auth } from "../middlewares/auth";
import { UserRole } from "../shared/models/user-model";
// Admin only
CategoryRouter.post("/categories",auth,verifyRole([UserRole.ADMIN]),validate(categorySchema), createCategory);  
CategoryRouter.delete("/categories/:id",auth,verifyRole([UserRole.ADMIN]), deleteCategory);
CategoryRouter.put("/categories/:id",auth,verifyRole([UserRole.ADMIN]),validate(categorySchema), updateCategory);

// Public routes
CategoryRouter.get("/categories", getAllCategories);
CategoryRouter.get("/categories/:id", getCategoryById);

export default CategoryRouter;
