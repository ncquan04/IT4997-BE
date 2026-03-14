import express from 'express';
import mongoose from 'mongoose';
import { Category } from '../shared/models/category-model';
import CategoryModel from '../models/category-model.mongo';
import ProductModel from '../models/product-model.mongo';

export const createCategory = async (req: any, res: any) => {
    try {
        const categoryData = req.body;
        const { name } = categoryData;
        
        const existingCategory = await CategoryModel.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ message: 'Category with this name already exists' });
        }
        const savedCategory = await CategoryModel.create({
            name: name,
        });
        res.status(201).json(savedCategory);
    } catch (error) {
        res.status(500).json({ message: 'Failed to create category', error });       
    }
}


export const getAllCategories = async (req: any, res: any) => {
    try {
        const categories = await CategoryModel.find();
        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch categories', error });
    }
}

export const getCategoryById = async (req: any, res: any) => {
    try {
        const categoryId = req.params.id;
        if (!mongoose.isValidObjectId(categoryId)) {
            return res.status(400).json({ message: "Invalid category id" });
        }

        const category = await CategoryModel.findById(categoryId);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch category', error });
    }
}

export const updateCategory = async (req: any, res: any) => {
    try {

        const categoryId = req.params.id;
        if (!mongoose.isValidObjectId(categoryId)) {
            return res.status(400).json({ message: "Invalid category id" });
        }
        const updateData = req.body;
        const updatedCategory = await CategoryModel.findByIdAndUpdate(categoryId, updateData, { new: true, runValidators: true, context: 'query' }).lean();
        if (!updatedCategory) {
            return res.status(404).json({ message: 'Category not found' });
        }
        res.status(200).json({ message: 'Category updated successfully', data: updatedCategory });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update category', error });
    }
}

export const deleteCategory = async (req: any, res: any) => {
    try {
        const categoryId = req.params.id;
        if (!mongoose.isValidObjectId(categoryId)) {
            return res.status(400).json({ message: "Invalid category id" });
        }

        const deletedCategory = await CategoryModel.findById(categoryId).lean();

        if (!deletedCategory) {
            return res.status(404).json({ message: 'Category not found' });
        }
        const productCount = await ProductModel.countDocuments({ categoryId: categoryId });
        
        if (productCount > 0) {
            return res.status(400).json({ message: 'Cannot delete category with associated products' });
        }

        await CategoryModel.deleteOne({ _id: categoryId });
        return res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete category', error });
    }
}   
