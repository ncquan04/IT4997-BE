
export const verifyRole = (allowRoles: string[]) => {
    return async (req, res, next) => {
        const user = req.user; // req.user được gán trong middleware auth

        if(!user || !user.role) {
            return res.status(403).send({
                error: "Access denied. No role information.",
            });
        }
        if (!allowRoles.includes(user.role)) {
                return res.status(403).json({
                    message: "Access denied. You do not have permission.",
                });
            }
        next();
    };
}