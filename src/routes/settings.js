import express from "express";
import { showSettings } from "../controllers/settingsController.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (res.locals.user) {
    return next();
  }
  res.redirect("/login");
}

router.get("/settings", requireAuth, showSettings);

export default router;
