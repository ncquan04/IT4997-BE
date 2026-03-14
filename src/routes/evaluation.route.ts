import express from "express";
import { Router } from "express";
import { validate } from "../middlewares/validate";
import { addEvaluation, getEvaluationsByProductId, toggleStatusEvaluation } from "../services/evaluation.service";
import { evaluationSchema } from "../dto/evaluation.dto";
import { UserRole } from "../shared/models/user-model";
import { verifyRole } from "../middlewares/verifyRole";
import { auth } from "../middlewares/auth";
const EvaluationRouter = Router();

EvaluationRouter.post("/evaluations/product/:productId", auth, validate(evaluationSchema), addEvaluation);
EvaluationRouter.get("/evaluations/product/:productId",auth, getEvaluationsByProductId);
EvaluationRouter.patch("/evaluations/toggle-status/:evaluationId",auth,verifyRole([UserRole.ADMIN]), toggleStatusEvaluation);

export default EvaluationRouter;