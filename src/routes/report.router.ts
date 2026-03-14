import express from "express";
import { validate } from "../middlewares/validate";
import { createRefundReportSchema } from "../dto/report.dto";
import { auth } from "../middlewares/auth";
import {
    getRefundReportById,
    getRefundReports,
    creatReportRefund,
} from "../services/report.service";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";

const ReportRouter = express.Router();

ReportRouter.post(
    "/reports/refund",
    auth,
    verifyRole([UserRole.ADMIN]),
    validate(createRefundReportSchema),
    creatReportRefund
);

ReportRouter.get(
    "/reports/refund/:id",
    auth,
    verifyRole([UserRole.ADMIN]),
    getRefundReportById
);
ReportRouter.get(
    "/reports/refund",
    auth,
    verifyRole([UserRole.ADMIN]),
    getRefundReports
);

export default ReportRouter;
