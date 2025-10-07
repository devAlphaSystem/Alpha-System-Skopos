import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dashboardRoutes from "./src/routes/dashboard.js";
import { pb } from "./src/services/pocketbase.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(async (req, res, next) => {
  try {
    const authCookie = req.cookies.pb_auth;
    if (authCookie) {
      const authData = JSON.parse(authCookie);
      pb.authStore.save(authData.token, authData.model);
    }
  } catch (error) {
    pb.authStore.clear();
  }
  res.locals.user = pb.authStore.isValid ? pb.authStore.model : null;
  next();
});

app.use("/", dashboardRoutes);

app.use(express.static(path.join(__dirname, "public")));

app.listen(port, () => {
  console.log(`Skopos server listening at http://localhost:${port}`);
});
