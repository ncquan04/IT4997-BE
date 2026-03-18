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
import { verifyBranchScope } from "../middlewares/verifyBranchScope";
import { UserRole } from "../shared/models/user-model";

const ReportRouter = express.Router();

ReportRouter.post(
    "/reports/refund",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER]),
    verifyBranchScope(),
    validate(createRefundReportSchema),
    creatReportRefund
);

ReportRouter.get(
    "/reports/refund/:id",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER]),
    verifyBranchScope(),
    getRefundReportById
);
ReportRouter.get(
    "/reports/refund",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER]),
    verifyBranchScope(),
    getRefundReports
);

export default ReportRouter;
