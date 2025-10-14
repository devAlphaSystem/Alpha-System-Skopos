import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dashboardRoutes from "./src/routes/dashboard.js";
import { pb, pbAdmin } from "./src/services/pocketbase.js";
import { startCronJobs } from "./src/services/cron.js";
import { userExists, setUserExists } from "./src/services/userState.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeApp() {
  try {
    const users = await pbAdmin.collection("users").getList(1, 1);
    setUserExists(users.totalItems > 0);
  } catch (error) {
    console.error("Could not check for existing users:", error);
    setUserExists(false);
  }

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use((req, res, next) => {
    const allowedPaths = ["/register", "/login"];
    const isStaticAsset = req.path.startsWith("/css") || req.path.startsWith("/js") || req.path.startsWith("/img");

    if (!userExists && !allowedPaths.includes(req.path) && !isStaticAsset) {
      return res.redirect("/register");
    }

    if (userExists && req.path === "/register") {
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
    next();
  });

  app.use("/", dashboardRoutes);

  app.use(express.static(path.join(__dirname, "public")));

  app.use((req, res, next) => {
    res.status(404).render("404");
  });

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render("500");
  });

  app.listen(port, () => {
    console.log(`Skopos server listening at http://localhost:${port}`);
    startCronJobs();
  });
}

initializeApp();
