import { pb, pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { initialize as initializeAppState } from "../services/appState.js";

export function showLoginPage(req, res) {
  if (res.locals.user) {
    return res.redirect("/");
  }
  res.render("login", { error: null });
}

export async function handleLogin(req, res) {
  const { email, password } = req.body;
  try {
    const authData = await pb.collection("users").authWithPassword(email, password);
    const cookieOptions = {
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
    res.cookie("pb_auth", JSON.stringify({ token: pb.authStore.token, model: authData.record }), cookieOptions);
    res.redirect("/");
  } catch (error) {
    res.render("login", { error: "Invalid email or password." });
  }
}

export function handleLogout(req, res) {
  pb.authStore.clear();
  res.clearCookie("pb_auth");
  res.redirect("/login");
}

export function showRegistrationPage(req, res) {
  res.render("register", { error: null });
}

export async function handleRegistration(req, res) {
  try {
    await ensureAdminAuth();
    const existingUsers = await pbAdmin.collection("users").getList(1, 1);
    if (existingUsers.totalItems > 0) {
      return res.redirect("/login");
    }

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).render("register", { error: "All fields are required." });
    }
    if (password.length < 8) {
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
    res.redirect("/login");
  } catch (error) {
    console.error("Registration failed:", error);
    let errorMessage = "Failed to create account. The email might already be in use.";
    if (error?.response?.data?.email?.message) {
      errorMessage = error.response.data.email.message;
    }
    res.status(400).render("register", { error: errorMessage });
  }
}
