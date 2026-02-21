const jwt = require("jsonwebtoken");

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET in .env");

  return jwt.sign({ userId: user.id, email: user.email }, secret, { expiresIn: "30d" });
}

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
      return res.status(401).json({ ok: false, error: "Missing Authorization: Bearer <token>" });
    }

    const secret = process.env.JWT_SECRET;
    const payload = jwt.verify(token, secret);

    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

module.exports = { signToken, requireAuth };