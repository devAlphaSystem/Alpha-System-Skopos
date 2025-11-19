import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { randomUUID } from "node:crypto";
import logger from "../utils/logger.js";
import { analyzeSeo } from "../services/seoAnalyzer.js";
import { getLatestSdkVersion, checkSdkUpdate } from "../services/updateChecker.js";

async function getCommonData(userId) {
  logger.debug("Fetching common data for user: %s", userId);
  await ensureAdminAuth();
  const allWebsites = await pbAdmin.collection("websites").getFullList({
    filter: `user.id = "${userId}"`,
    sort: "created",
  });

  const websites = allWebsites.filter((w) => !w.isArchived);
  const archivedWebsites = allWebsites.filter((w) => w.isArchived);
  logger.debug("Found %d active and %d archived websites for user %s.", websites.length, archivedWebsites.length, userId);

  const latestSdkVersion = await getLatestSdkVersion();
  for (const website of websites) {
    if (website.sdkVersion) {
      website.hasSdkUpdate = await checkSdkUpdate(website.sdkVersion);
    }
  }

  return { websites, archivedWebsites, allWebsites, latestSdkVersion };
}

export async function showWebsites(req, res) {
  logger.info("Rendering websites page for user: %s", res.locals.user.id);
  try {
    await ensureAdminAuth();
    const { websites, archivedWebsites, latestSdkVersion } = await getCommonData(res.locals.user.id);
    res.render("websites", {
      websites,
      archivedWebsites,
      currentWebsite: null,
      currentPage: "websites",
      latestSdkVersion,
    });
  } catch (error) {
    logger.error("Error fetching websites for user %s: %o", res.locals.user.id, error);
    res.status(500).render("500");
  }
}

export async function addWebsite(req, res) {
  const { name, domain, dataRetentionDays } = req.body;
  logger.info("User %s is adding a new website: %s (%s)", res.locals.user.id, name, domain);
  logger.debug("Add website payload: %o", req.body);
  try {
    await ensureAdminAuth();
    const newWebsite = await pbAdmin.collection("websites").create({
      name,
      domain,
      dataRetentionDays: Number(dataRetentionDays) || 0,
      trackingId: randomUUID(),
      user: res.locals.user.id,
      disableLocalhostTracking: false,
      ipBlacklist: [],
      isArchived: false,
    });

    logger.info("Website %s created successfully. Triggering background SEO analysis.", newWebsite.id);

    runSeoAnalysisInBackground(newWebsite.id, domain);

    res.redirect("/websites");
  } catch (error) {
    logger.error("Error adding website %s for user %s: %o", name, res.locals.user.id, error);
    res.status(500).render("500");
  }
}

async function runSeoAnalysisInBackground(websiteId, domain) {
  try {
    logger.info("Starting background SEO analysis for website %s (%s)", websiteId, domain);
    const seoData = await analyzeSeo(domain, null, res.locals.user?.id);

    await ensureAdminAuth();
    await pbAdmin.collection("seo_data").create({
      website: websiteId,
      metaTags: seoData.metaTags,
      socialMetaTags: seoData.socialMetaTags,
      headings: seoData.headings,
      images: seoData.images,
      links: seoData.links,
      technicalSeo: seoData.technicalSeo,
      performanceScores: seoData.performanceScores,
      lighthouseData: seoData.lighthouseData,
      analysisWarnings: seoData.analysisWarnings,
      recommendations: seoData.recommendations,
      loadTime: seoData.loadTime,
      pageSize: seoData.pageSize,
      lastAnalyzed: seoData.lastAnalyzed,
    });

    logger.info("Background SEO analysis completed successfully for website %s", websiteId);
  } catch (error) {
    logger.error("Background SEO analysis failed for website %s: %o", websiteId, error);
  }
}

export async function archiveWebsite(req, res) {
  const { id } = req.params;
  logger.info("User %s is archiving website: %s", res.locals.user.id, id);
  try {
    await ensureAdminAuth();
    const record = await pbAdmin.collection("websites").getOne(id);
    if (record.user === res.locals.user.id) {
      await pbAdmin.collection("websites").update(id, { isArchived: true });
      logger.info("Successfully archived website: %s", id);
    } else {
      logger.warn("User %s attempted to archive unauthorized website %s", res.locals.user.id, id);
    }
    res.redirect("/websites");
  } catch (error) {
    logger.error("Error archiving website %s: %o", id, error);
    res.status(500).render("500");
  }
}

export async function restoreWebsite(req, res) {
  const { id } = req.params;
  logger.info("User %s is restoring website: %s", res.locals.user.id, id);
  try {
    await ensureAdminAuth();
    const record = await pbAdmin.collection("websites").getOne(id);
    if (record.user === res.locals.user.id) {
      await pbAdmin.collection("websites").update(id, { isArchived: false });
      logger.info("Successfully restored website: %s", id);
    } else {
      logger.warn("User %s attempted to restore unauthorized website %s", res.locals.user.id, id);
    }
    res.redirect("/websites");
  } catch (error) {
    logger.error("Error restoring website %s: %o", id, error);
    res.status(500).render("500");
  }
}

export async function deleteWebsite(req, res) {
  const { id } = req.params;
  const { deleteData } = req.body;
  logger.info("User %s is deleting website: %s. Delete data: %s", res.locals.user.id, id, deleteData);
  try {
    await ensureAdminAuth();
    const record = await pbAdmin.collection("websites").getOne(id);
    if (record.user !== res.locals.user.id) {
      logger.warn("User %s attempted to delete unauthorized website %s", res.locals.user.id, id);
      return res.status(403).send("You do not have permission to delete this website.");
    }

    if (deleteData === "true") {
      logger.info("Deleting associated data for website %s", id);
      const relatedCollections = ["events", "js_errors", "sessions", "visitors"];
      for (const collection of relatedCollections) {
        let items;
        do {
          const filterField = collection === "events" || collection === "js_errors" ? "session.website.id" : "website.id";
          items = await pbAdmin.collection(collection).getFullList({
            filter: `${filterField} = "${id}"`,
            fields: "id",
            perPage: 200,
          });
          for (const item of items) {
            await pbAdmin.collection(collection).delete(item.id);
          }
          logger.debug("Deleted %d items from %s for website %s", items.length, collection, id);
        } while (items.length > 0);
      }
      logger.info("Finished deleting associated data for website %s", id);
    }

    try {
      const seoRecord = await pbAdmin.collection("seo_data").getFirstListItem(`website.id="${id}"`);
      await pbAdmin.collection("seo_data").delete(seoRecord.id);
      logger.info("Deleted SEO data for website %s", id);
    } catch (e) {
      logger.debug("No SEO data found for website %s (or already deleted)", id);
    }

    await pbAdmin.collection("websites").delete(id);
    logger.info("Successfully deleted website: %s", id);
    res.redirect("/websites");
  } catch (error) {
    logger.error("Error deleting website %s: %o", id, error);
    res.status(500).render("500");
  }
}

export async function getWebsiteSettings(req, res) {
  const { websiteId } = req.params;
  logger.debug("API call to get settings for website %s", websiteId);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    res.status(200).json({ ipBlacklist: website.ipBlacklist || [] });
  } catch (error) {
    logger.error("Failed to get settings for website %s: %o", websiteId, error);
    res.status(404).json({ error: "Website not found." });
  }
}

export async function updateWebsiteSettings(req, res) {
  const { websiteId } = req.params;
  logger.info("Updating settings for website: %s", websiteId);
  logger.debug("Update settings payload: %o", req.body);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);

    const dataToUpdate = { ...req.body };
    if (dataToUpdate.dataRetentionDays !== undefined && dataToUpdate.dataRetentionDays !== null) {
      dataToUpdate.dataRetentionDays = Number(dataToUpdate.dataRetentionDays);
    }

    await pbAdmin.collection("websites").update(website.id, dataToUpdate);
    logger.info("Successfully updated settings for website %s", websiteId);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Failed to update settings for website %s: %o", req.params.websiteId, error);
    res.status(500).json({ error: "Failed to update settings." });
  }
}

export async function addIpToBlacklist(req, res) {
  const { websiteId } = req.params;
  const { ip } = req.body;
  logger.debug("API call to add IP %s to blacklist for website %s", ip, websiteId);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;
    if (!userId || !ip) return res.status(400).json({ error: "Bad Request" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    const currentBlacklist = website.ipBlacklist || [];
    logger.debug("Current IP blacklist size: %d", currentBlacklist.length);

    if (currentBlacklist.includes(ip)) {
      logger.warn("Attempt to add duplicate IP %s to blacklist for website %s", ip, websiteId);
      return res.status(409).json({ error: "IP already exists in blacklist." });
    }

    const newBlacklist = [...currentBlacklist, ip];
    await pbAdmin.collection("websites").update(website.id, { ipBlacklist: newBlacklist });
    logger.info("Added IP %s to blacklist for website %s", ip, websiteId);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Failed to add IP to blacklist for website %s: %o", req.params.websiteId, error);
    res.status(500).json({ error: "Failed to add IP to blacklist." });
  }
}

export async function removeIpFromBlacklist(req, res) {
  const { websiteId } = req.params;
  const { ip } = req.body;
  logger.debug("API call to remove IP %s from blacklist for website %s", ip, websiteId);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;
    if (!userId || !ip) return res.status(400).json({ error: "Bad Request" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);
    const currentBlacklist = website.ipBlacklist || [];
    logger.debug("Current IP blacklist size: %d", currentBlacklist.length);

    const newBlacklist = currentBlacklist.filter((i) => i !== ip);
    await pbAdmin.collection("websites").update(website.id, { ipBlacklist: newBlacklist });
    logger.info("Removed IP %s from blacklist for website %s", ip, websiteId);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Failed to remove IP from blacklist for website %s: %o", req.params.websiteId, error);
    res.status(500).json({ error: "Failed to remove IP from blacklist." });
  }
}

export async function cleanupWebsiteData(req, res) {
  const { websiteId } = req.params;
  logger.info("User %s is running data cleanup for website: %s", res.locals.user.id, websiteId);
  try {
    await ensureAdminAuth();
    const userId = res.locals.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);

    const allVisitors = await pbAdmin.collection("visitors").getFullList({
      filter: `website.id = "${website.id}"`,
      fields: "id,visitorId",
      $autoCancel: false,
    });

    let orphanedVisitors = 0;
    for (const visitor of allVisitors) {
      const sessions = await pbAdmin.collection("sessions").getList(1, 1, {
        filter: `visitor.id = "${visitor.id}"`,
        $autoCancel: false,
      });

      if (sessions.totalItems === 0) {
        await pbAdmin.collection("visitors").delete(visitor.id);
        orphanedVisitors++;
        logger.debug("Deleted orphaned visitor: %s", visitor.id);
      }
    }

    logger.info("Successfully cleaned up website %s: %d orphaned visitors removed", websiteId, orphanedVisitors);
    res.status(200).json({
      success: true,
      orphanedVisitors: orphanedVisitors,
    });
  } catch (error) {
    logger.error("Failed to cleanup website %s: %o", websiteId, error);
    res.status(500).json({ error: "Failed to cleanup website data." });
  }
}
