module.exports = function (req, res, next) {
  // ✅ allow public health check
  if (req.path === "/health" || req.originalUrl === "/api/health") {
    return next();
  }

  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};
