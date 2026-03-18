import { UserRole } from "../shared/models/user-model";

/**
 * Middleware enforcing branch-level data isolation for non-ADMIN roles.
 *
 * Behaviour:
 *  - ADMIN: unrestricted, `req.targetBranchId` is left undefined (service may use query param freely).
 *  - MANAGER / WAREHOUSE / SALES: must have a branchId on their user record.
 *    `req.targetBranchId` is set to their own branchId, overriding whatever the
 *    client sends in the query string / body.
 *
 * Services should read `req.targetBranchId` instead of `req.query.branchId` /
 * `req.body.branchId` when performing branch-scoped queries.
 */
export const verifyBranchScope = (
    branchScopedRoles: string[] = [
        UserRole.MANAGER,
        UserRole.WAREHOUSE,
        UserRole.SALES,
    ]
) => {
    return (req: any, res: any, next: any) => {
        const user = req.user;

        if (!user || !user.role) {
            return res
                .status(403)
                .json({ message: "Access denied. No role information." });
        }

        if (branchScopedRoles.includes(user.role)) {
            if (!user.branchId) {
                return res.status(403).json({
                    message:
                        "Access denied. Staff account has no branch assigned.",
                });
            }
            // Override: staff can only ever see their own branch's data.
            req.targetBranchId = user.branchId;
        }
        // ADMIN: req.targetBranchId stays undefined → service uses query param (full access)

        next();
    };
};
