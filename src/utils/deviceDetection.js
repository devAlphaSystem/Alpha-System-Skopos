/**
 * Returns true if the request originates from a mobile device, based on User-Agent string matching.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function detectMobile(req) {
  const userAgent = req.headers["user-agent"] || "";
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
  return mobileRegex.test(userAgent);
}

/**
 * Express middleware that sets `res.locals.isMobile` based on the request User-Agent.
 * Applied globally in `server.js` before route handlers.
 *
 * @type {import('express').RequestHandler}
 */
export function deviceDetectionMiddleware(req, res, next) {
  res.locals.isMobile = detectMobile(req);
  next();
}
