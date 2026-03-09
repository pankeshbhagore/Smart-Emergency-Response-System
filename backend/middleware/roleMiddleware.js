// Accept both: role("Admin","Operator") and requireRole("Admin","Operator")
const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  if (!allowedRoles.includes(req.user.role))
    return res.status(403).json({ message: `Access denied. Required: ${allowedRoles.join(" or ")}` });
  next();
};

module.exports = requireRole;
module.exports.requireRole = requireRole;
