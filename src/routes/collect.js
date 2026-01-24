import express from "express";
import { handleCollect, handleHealthCheck } from "../controllers/collectController.js";

const router = express.Router();

const collectCors = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
};

router.use(collectCors);

router.post("/collect", handleCollect);

router.get("/collect/health", handleHealthCheck);

export default router;
