import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { validate } from "../middlewares/validate";
import { UserRole } from "../shared/models/user-model";
import {
    createDiscountProgramSchema,
    updateDiscountProgramSchema,
} from "../dto/discount-program.dto";
import discountProgramService from "../services/discount-program.service";

const DiscountProgramRouter = express.Router();

// ── Admin: list all programs ─────────────────────────────────────────────────
DiscountProgramRouter.get(
    "/discount-programs",
    auth,
    verifyRole([UserRole.ADMIN]),
    async (req, res) => {
        try {
            const programs = await discountProgramService.getAllPrograms();
            return res.status(200).json(programs);
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    }
);

// ── Admin: create program ────────────────────────────────────────────────────
DiscountProgramRouter.post(
    "/discount-programs",
    auth,
    verifyRole([UserRole.ADMIN]),
    validate(createDiscountProgramSchema),
    async (req, res) => {
        try {
            const program = await discountProgramService.createProgram(
                req.body
            );
            return res.status(201).json(program);
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    }
);

// ── Admin: update program ────────────────────────────────────────────────────
DiscountProgramRouter.put(
    "/discount-programs/:id",
    auth,
    verifyRole([UserRole.ADMIN]),
    validate(updateDiscountProgramSchema),
    async (req, res) => {
        try {
            const program = await discountProgramService.updateProgram(
                String(req.params.id),
                req.body
            );
            if (!program) {
                return res.status(404).json({ message: "Program not found" });
            }
            return res.status(200).json(program);
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    }
);

// ── Admin: delete program ────────────────────────────────────────────────────
DiscountProgramRouter.delete(
    "/discount-programs/:id",
    auth,
    verifyRole([UserRole.ADMIN]),
    async (req, res) => {
        try {
            const deleted = await discountProgramService.deleteProgram(
                String(req.params.id)
            );
            if (!deleted) {
                return res.status(404).json({ message: "Program not found" });
            }
            return res.status(200).json({ message: "Program deleted" });
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    }
);

export default DiscountProgramRouter;
