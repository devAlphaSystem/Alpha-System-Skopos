import express from "express";
import { showLoginPage, handleLogin, handleLogout, showRegistrationPage, handleRegistration } from "../controllers/authController.js";

const router = express.Router();

router.get("/register", showRegistrationPage);
router.post("/register", handleRegistration);
router.get("/login", showLoginPage);
router.post("/login", handleLogin);
router.get("/logout", handleLogout);

export default router;
