export function detectMobile(req) {
  const userAgent = req.headers["user-agent"] || "";
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
  return mobileRegex.test(userAgent);
}

export function deviceDetectionMiddleware(req, res, next) {
  res.locals.isMobile = detectMobile(req);
  next();
}
