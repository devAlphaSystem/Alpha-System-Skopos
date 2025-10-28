import express from "express";
import { showSessions, showSessionDetails, deleteSession, deleteVisitorSessions } from "../controllers/sessionsController.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/login");
}

router.get("/sessions/:websiteId", requireAuth, showSessions);
router.get("/sessions/:websiteId/session/:sessionId", requireAuth, showSessionDetails);
router.post("/sessions/:websiteId/session/:sessionId/delete", requireAuth, deleteSession);
router.post("/sessions/:websiteId/visitor/:visitorId/delete", requireAuth, deleteVisitorSessions);

export default router;
