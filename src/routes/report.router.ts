import express from "express";
import { validate } from "../middlewares/validate";
import { createRefundReportSchema } from "../dto/report.dto";
import { auth } from "../middlewares/auth";
import {
    getRefundReportById,
    getRefundReports,
    creatReportRefund,
} from "../services/report.service";
import {
    getTopProducts,
    getInventoryValue,
    getRevenueOverTime,
    getRevenueByBranch,
    getCouponImpact,
    getImportCost,
    getRefundSummary,
    getLoyaltySummary,
} from "../services/financial-report.service";
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

// ─── Financial Reports ───────────────────────────────────────────────────────

const FINANCIAL_ROLES = [UserRole.ADMIN, UserRole.MANAGER];

ReportRouter.get(
    "/reports/financial/top-products",
    auth,
    verifyRole(FINANCIAL_ROLES),
    verifyBranchScope(),
    getTopProducts
);

ReportRouter.get(
    "/reports/financial/inventory-value",
    auth,
    verifyRole(FINANCIAL_ROLES),
    verifyBranchScope(),
    getInventoryValue
);

ReportRouter.get(
    "/reports/financial/revenue-over-time",
    auth,
    verifyRole(FINANCIAL_ROLES),
    verifyBranchScope(),
    getRevenueOverTime
);

ReportRouter.get(
    "/reports/financial/revenue-by-branch",
    auth,
    verifyRole([UserRole.ADMIN]),
    getRevenueByBranch
);

ReportRouter.get(
    "/reports/financial/coupon-impact",
    auth,
    verifyRole(FINANCIAL_ROLES),
    verifyBranchScope(),
    getCouponImpact
);

ReportRouter.get(
    "/reports/financial/import-cost",
    auth,
    verifyRole(FINANCIAL_ROLES),
    verifyBranchScope(),
    getImportCost
);

ReportRouter.get(
    "/reports/financial/refund-summary",
    auth,
    verifyRole(FINANCIAL_ROLES),
    verifyBranchScope(),
    getRefundSummary
);

ReportRouter.get(
    "/reports/financial/loyalty-summary",
    auth,
    verifyRole([UserRole.ADMIN]),
    getLoyaltySummary
);

export default ReportRouter;
