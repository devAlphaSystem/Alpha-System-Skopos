import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventSource } from "eventsource";

global.EventSource = EventSource;

import authRoutes from "./src/routes/auth.js";
import dashboardRoutes from "./src/routes/dashboard.js";
import websitesRoutes from "./src/routes/websites.js";
import sessionsRoutes from "./src/routes/sessions.js";
import settingsRoutes from "./src/routes/settings.js";
import apiRoutes from "./src/routes/api.js";
import { pb } from "./src/services/pocketbase.js";
import { startCronJobs } from "./src/services/cron.js";
import { initialize as initializeAppState, doesUserExist } from "./src/services/appState.js";
import { startRealtimeService } from "./src/services/realtime.js";
import { deviceDetectionMiddleware } from "./src/utils/deviceDetection.js";
import logger from "./src/services/logger.js";
import { readFileSync } from "node:fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const packageJson = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf-8"));
const port = process.env.PORT || 3000;

async function initializeApp() {
  await initializeAppState();

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(deviceDetectionMiddleware);

  app.use((req, res, next) => {
    const allowedPaths = ["/register", "/login"];
    const isStaticAsset = req.path.startsWith("/css") || req.path.startsWith("/js") || req.path.startsWith("/img");

    if (!doesUserExist() && !allowedPaths.includes(req.path) && !isStaticAsset) {
      return res.redirect("/register");
    }

    if (doesUserExist() && req.path === "/register") {
      return res.redirect("/login");
    }

    next();
  });

  app.use(async (req, res, next) => {
    pb.authStore.clear();

    try {
      const authCookie = req.cookies.pb_auth;
      if (authCookie) {
        const authData = JSON.parse(authCookie);
        pb.authStore.save(authData.token, authData.model);
      }
    } catch (error) {
      pb.authStore.clear();
    }
    res.locals.user = pb.authStore.isValid ? pb.authStore.record : null;
    res.locals.appVersion = packageJson.version;
    next();
  });

  app.use("/", authRoutes);
  app.use("/", apiRoutes);
  app.use("/", dashboardRoutes);
  app.use("/", websitesRoutes);
  app.use("/", sessionsRoutes);
  app.use("/", settingsRoutes);

  app.use(express.static(path.join(__dirname, "public")));

  app.use((req, res, next) => {
    res.status(404).render("404");
  });

  app.use((err, req, res, next) => {
    logger.error("Unhandled application error: %o", err);
    res.status(500).render("500");
  });

  app.listen(port, () => {
    logger.info(`Skopos server listening at http://localhost:${port}`);
    startCronJobs();
    startRealtimeService();
  });
}

initializeApp();
