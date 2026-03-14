import express from 'express';
import mongoose from 'mongoose';
import { Request, Response } from "express";
import EvaluationModel from '../models/evaluation-model.mongo';
import { Contacts } from "../shared/contacts";
import { get } from 'http';
import UserModel from '../models/user-model.mongo';
import { Product } from '../shared/models/product-model';
import ProductModel from '../models/product-model.mongo';


export const addEvaluation = async (req: any, res: Response) => {
    try {
        const { productId } = req.params;
        const userId = req.user?.id;
        const { parentEvaluationId, content, rate, imageUrlFeedback} = req.body;
        
        if(!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({ message: 'Invalid productId' });
        }
        const product = await ProductModel.findById(productId).lean();

        if(!userId){
            return res.status(400).json({ message: 'User must log in' });
        }
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        
        const newEvaluation = await EvaluationModel.create({
            userId: userId,
            productId: productId,
            parentEvaluationId: parentEvaluationId || null,
            content: content || [],
            rate: rate,
            isHide: Contacts.Status.Evaluation.PUBLIC,
            imageUrlFeedback: imageUrlFeedback || []
        });
        res.status(201).json(newEvaluation);
    } catch (error) {
        res.status(500).json({ message: 'Failed to add evaluation', error });
    }
};

export const getEvaluationsByProductId = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        
        if(!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({ message: 'Invalid productId' });
        }

        const evaluations = await EvaluationModel.find({ productId: productId, isHide: Contacts.Status.Evaluation.PUBLIC }).lean();
        res.status(200).json(evaluations);
    } catch (error) {
        throw new Error('Failed to fetch evaluations');
    }
}

export const toggleStatusEvaluation = async (req: Request, res: Response) => {
    try {
        const { evaluationId } = req.params;
        if(!mongoose.isValidObjectId(evaluationId)) {
            return res.status(400).json({ message: 'Invalid evaluationId' });
        }

        const evaluation = await EvaluationModel.findById(evaluationId);
        if (evaluation){
            evaluation.isHide = evaluation.isHide === Contacts.Status.Evaluation.PUBLIC
                ? Contacts.Status.Evaluation.HIDE
                : Contacts.Status.Evaluation.PUBLIC;
            await evaluation.save();
            return  res.status(200).json(evaluation);
        }
        if (!evaluation) {
            return res.status(404).json({ message: 'Evaluation not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Failed to toggle evaluation status', error });
    }
}


