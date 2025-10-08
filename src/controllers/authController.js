import { pb } from "../services/pocketbase.js";

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
    pb.autoCancellation(false);
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
