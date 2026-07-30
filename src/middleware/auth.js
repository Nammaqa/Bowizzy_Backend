const User = require("../models/User");
const jwt = require("jsonwebtoken");

module.exports = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token missing" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.query().findById(decoded.user_id);
    if (!user) return res.status(401).json({ message: "Invalid token user" });

    if (user.current_token !== token) {
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    if (
      req.params.user_id &&
      decoded.user_type !== "admin" &&
      String(req.params.user_id) !== String(decoded.user_id)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    req.user = decoded;
    next();

  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
