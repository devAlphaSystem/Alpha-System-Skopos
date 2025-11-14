import dotenv from "dotenv";
import { pb, pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { initialize as initializeAppState } from "../services/appState.js";
import logger from "../utils/logger.js";

dotenv.config();

export function showLoginPage(req, res) {
  if (res.locals.user) {
    return res.redirect("/");
  }
  res.render("login", { error: null });
}

export async function handleLogin(req, res) {
  const { email, password } = req.body;
  logger.info("Login attempt for user: %s", email);
  try {
    const authData = await pb.collection("users").authWithPassword(email, password);
    const cookieOptions = {
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
    res.cookie("pb_auth", JSON.stringify({ token: pb.authStore.token, model: authData.record }), cookieOptions);
    logger.info("User %s logged in successfully.", email);
    res.redirect("/");
  } catch (error) {
    logger.warn("Failed login attempt for user: %s", email);
    res.render("login", { error: "Invalid email or password." });
  }
}

export function handleLogout(req, res) {
  logger.info("User %s logged out.", res.locals.user?.email);
  pb.authStore.clear();
  res.clearCookie("pb_auth");
  res.redirect("/login");
}

export function showRegistrationPage(req, res) {
  res.render("register", { error: null });
}

export async function handleRegistration(req, res) {
  logger.info("Attempting to register first user.");
  try {
    await ensureAdminAuth();
    const existingUsers = await pbAdmin.collection("users").getList(1, 1);
    if (existingUsers.totalItems > 0) {
      logger.warn("Registration blocked: A user already exists.");
      return res.redirect("/login");
    }

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      logger.warn("Registration failed: Missing required fields.");
      return res.status(400).render("register", { error: "All fields are required." });
    }
    if (password.length < 8) {
      logger.warn("Registration failed: Password too short.");
      return res.status(400).render("register", { error: "Password must be at least 8 characters long." });
    }

    await pbAdmin.collection("users").create({
      name,
      email,
      password,
      passwordConfirm: password,
      emailVisibility: false,
      verified: true,
    });

    await initializeAppState();
    logger.info("First user registered successfully: %s", email);
    res.redirect("/login");
  } catch (error) {
    logger.error("Registration failed: %o", error);
    let errorMessage = "Failed to create account. The email might already be in use.";
    if (error?.response?.data?.email?.message) {
      errorMessage = error.response.data.email.message;
    }
    res.status(400).render("register", { error: errorMessage });
  }
}
