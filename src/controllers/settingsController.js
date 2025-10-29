import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import logger from "../services/logger.js";

export async function showSettings(req, res) {
  logger.info("Rendering settings page for user: %s", res.locals.user.id);
  try {
    await ensureAdminAuth();
    const allWebsites = await pbAdmin.collection("websites").getFullList({
      filter: `user.id = "${res.locals.user.id}"`,
      sort: "created",
    });

    const websites = allWebsites.filter((w) => !w.isArchived);
    logger.debug("Found %d active websites for user %s in settings.", websites.length, res.locals.user.id);

    res.render("settings", {
      websites,
      currentPage: "settings",
    });
  } catch (error) {
    logger.error("Error loading settings for user %s: %o", res.locals.user.id, error);
    res.status(500).render("500");
  }
}
