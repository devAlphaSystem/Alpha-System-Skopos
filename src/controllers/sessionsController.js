import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import logger from "../utils/logger.js";
import { getApiKey, listApiKeys } from "../services/apiKeyManager.js";
import cacheService from "../services/cacheService.js";

async function getCommonData(userId) {
  const cacheKey = cacheService.key("websites", userId);

  return cacheService.getOrCompute(cacheKey, cacheService.TTL.WEBSITES, async () => {
    logger.debug("Fetching common data for user: %s", userId);
    await ensureAdminAuth();
    const allWebsites = await pbAdmin.collection("websites").getFullList({
      filter: `user.id = "${userId}"`,
      sort: "created",
      fields: "id,domain,name,trackingId,isArchived,created,disableLocalhostTracking,dataRetentionDays,uptimeMonitoring,uptimeCheckInterval",
    });

    const websites = allWebsites.filter((w) => !w.isArchived);
    const archivedWebsites = allWebsites.filter((w) => w.isArchived);
    logger.debug("Found %d active and %d archived websites for user %s.", websites.length, archivedWebsites.length, userId);

    return { websites, archivedWebsites, allWebsites };
  });
}

export async function showSessions(req, res) {
  const { websiteId } = req.params;
  const page = Math.max(1, Number.parseInt(req.query.page) || 1);
  const perPage = Math.max(1, Math.min(100, Number.parseInt(req.query.perPage) || 25));

  logger.info("Rendering sessions page for website: %s, user: %s (page: %d, perPage: %d)", websiteId, res.locals.user.id, page, perPage);
  try {
    const { websites, archivedWebsites, allWebsites } = await getCommonData(res.locals.user.id);

    const currentWebsite = allWebsites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      logger.warn("User %s attempted to access unauthorized or non-existent website %s", res.locals.user.id, websiteId);
      return res.status(404).render("404");
    }

    await ensureAdminAuth();

    const sessionsResult = await pbAdmin.collection("sessions").getList(page, perPage, {
      filter: `website.id = "${websiteId}"`,
      sort: "-created",
      fields: "id,visitor,created,updated,browser,os,device,country,state,isNewVisitor,ipAddress",
      $autoCancel: false,
    });

    const paginatedSessions = sessionsResult.items;
    const totalSessions = sessionsResult.totalItems;
    const totalPages = sessionsResult.totalPages;

    const visitorIds = [...new Set(paginatedSessions.map((s) => s.visitor).filter(Boolean))];

    let visitors = [];
    if (visitorIds.length > 0) {
      const visitorFilter = visitorIds.map((id) => `id = "${id}"`).join(" || ");
      visitors = await pbAdmin.collection("visitors").getFullList({
        filter: visitorFilter,
        fields: "id,visitorId,userId,name,email,metadata",
        $autoCancel: false,
      });
    }

    const visitorMap = new Map(visitors.map((v) => [v.id, v]));

    const sessionIds = paginatedSessions.map((s) => s.id);

    const eventCounts = new Map();
    if (sessionIds.length > 0) {
      const BATCH_SIZE = 100;
      const batches = [];
      for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
        batches.push(sessionIds.slice(i, i + BATCH_SIZE));
      }

      const batchResults = await Promise.all(
        batches.map(async (batch) => {
          const filter = batch.map((id) => `session.id = "${id}"`).join(" || ");
          return pbAdmin.collection("events").getFullList({
            filter: `(${filter}) && type = "pageView"`,
            fields: "session",
            $autoCancel: false,
          });
        }),
      );

      for (const events of batchResults) {
        for (const event of events) {
          eventCounts.set(event.session, (eventCounts.get(event.session) || 0) + 1);
        }
      }
    }

    const sessionsData = [];

    for (const session of paginatedSessions) {
      const visitor = visitorMap.get(session.visitor);
      if (!visitor) continue;

      const startTime = new Date(session.created);
      const endTime = new Date(session.updated);
      const durationMs = endTime - startTime;
      const durationMinutes = Math.floor(durationMs / 60000);
      const durationSeconds = Math.floor((durationMs % 60000) / 1000);

      sessionsData.push({
        sessionId: session.id,
        visitorId: visitor.visitorId,
        visitorRecordId: visitor.id,
        userId: visitor.userId,
        userName: visitor.name,
        userEmail: visitor.email,
        userMetadata: visitor.metadata,
        ipAddress: session.ipAddress,
        startTime: session.created,
        endTime: session.updated,
        duration: `${durationMinutes}m ${durationSeconds}s`,
        durationMs,
        pagesVisited: eventCounts.get(session.id) || 0,
        browser: session.browser,
        os: session.os,
        device: session.device,
        country: session.country,
        state: session.state,
        isNewVisitor: session.isNewVisitor,
      });
    }

    const groupedSessions = new Map();
    for (const session of sessionsData) {
      if (!groupedSessions.has(session.visitorRecordId)) {
        groupedSessions.set(session.visitorRecordId, {
          visitorId: session.visitorId,
          visitorRecordId: session.visitorRecordId,
          userId: session.userId,
          userName: session.userName,
          userEmail: session.userEmail,
          userMetadata: session.userMetadata,
          sessions: [],
        });
      }
      groupedSessions.get(session.visitorRecordId).sessions.push(session);
    }

    const visitorsWithSessions = Array.from(groupedSessions.values());

    const pagination = {
      currentPage: page,
      totalPages,
      totalSessions,
      perPage,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      startItem: (page - 1) * perPage + 1,
      endItem: Math.min(page * perPage, totalSessions),
    };

    logger.debug("Sessions page data for website %s calculated successfully. Rendering page.", websiteId);

    res.render("sessions", {
      websites,
      archivedWebsites,
      currentWebsite,
      visitorsWithSessions,
      pagination,
      currentPage: "sessions",
    });
  } catch (error) {
    logger.error("Error loading sessions page for website %s: %o", websiteId, error);
    res.status(500).render("500");
  }
}

export async function showSessionDetails(req, res) {
  const { websiteId, sessionId } = req.params;
  logger.info("Rendering session details for session: %s, website: %s, user: %s", sessionId, websiteId, res.locals.user.id);
  try {
    const { websites, archivedWebsites, allWebsites } = await getCommonData(res.locals.user.id);

    const currentWebsite = allWebsites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      logger.warn("User %s attempted to access unauthorized or non-existent website %s", res.locals.user.id, websiteId);
      return res.status(404).render("404");
    }

    await ensureAdminAuth();

    const session = await pbAdmin.collection("sessions").getOne(sessionId, {
      expand: "visitor",
      $autoCancel: false,
    });

    if (session.website !== websiteId) {
      logger.warn("Session %s does not belong to website %s", sessionId, websiteId);
      return res.status(404).render("404");
    }

    const events = await pbAdmin.collection("events").getFullList({
      filter: `session.id = "${sessionId}"`,
      sort: "-created",
      $autoCancel: false,
    });

    const startTime = new Date(session.created);
    const endTime = new Date(session.updated);
    const durationMs = endTime - startTime;
    const durationMinutes = Math.floor(durationMs / 60000);
    const durationSeconds = Math.floor((durationMs % 60000) / 1000);

    const pageViews = events.filter((e) => e.type === "pageView").length;
    const customEvents = events.filter((e) => e.type === "custom").length;

    const pagesVisited = new Map();
    const customEventNames = new Map();

    for (const event of events) {
      if (event.type === "pageView") {
        pagesVisited.set(event.path, (pagesVisited.get(event.path) || 0) + 1);
      } else if (event.type === "custom" && event.eventName) {
        customEventNames.set(event.eventName, (customEventNames.get(event.eventName) || 0) + 1);
      }
    }

    const topPages = Array.from(pagesVisited.entries())
      .map(([key, count]) => ({
        key,
        count,
        percentage: pageViews > 0 ? Math.round((count / pageViews) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const topCustomEvents = Array.from(customEventNames.entries())
      .map(([key, count]) => ({
        key,
        count,
        percentage: customEvents > 0 ? Math.round((count / customEvents) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const sessionInfo = {
      sessionId: session.id,
      visitorId: session.expand?.visitor?.visitorId || "Unknown",
      visitorRecordId: session.visitor,
      userId: session.expand?.visitor?.userId,
      userName: session.expand?.visitor?.name,
      userEmail: session.expand?.visitor?.email,
      userPhone: session.expand?.visitor?.phone,
      userMetadata: session.expand?.visitor?.metadata,
      ipAddress: session.ipAddress,
      startTime: session.created,
      endTime: session.updated,
      duration: `${durationMinutes}m ${durationSeconds}s`,
      durationFormatted: `${String(durationMinutes).padStart(2, "0")}:${String(durationSeconds).padStart(2, "0")}`,
      durationMs,
      browser: session.browser,
      os: session.os,
      device: session.device,
      country: session.country,
      state: session.state,
      entryPath: session.entryPath,
      exitPath: session.exitPath,
      referrer: session.referrer || "Direct",
      screenWidth: session.screenWidth,
      screenHeight: session.screenHeight,
      language: session.language,
      isNewVisitor: session.isNewVisitor,
    };

    const metrics = {
      pageViews,
      customEvents,
      duration: sessionInfo.durationFormatted,
      isNewVisitor: session.isNewVisitor,
    };

    const reports = {
      topPages,
      topCustomEvents,
    };

    const apiKeys = await listApiKeys(res.locals.user.id);
    const hasChapybaraKey = apiKeys.some((k) => k.service === "chapybara" && k.isActive);

    logger.debug("Session details for session %s calculated successfully. Rendering page.", sessionId);

    res.render("session-details", {
      websites,
      archivedWebsites,
      currentWebsite,
      sessionInfo,
      metrics,
      reports,
      events,
      hasChapybaraKey,
      currentPage: "sessions",
    });
  } catch (error) {
    logger.error("Error loading session details for session %s: %o", sessionId, error);
    res.status(500).render("500");
  }
}

export async function deleteSession(req, res) {
  const { websiteId, sessionId } = req.params;
  logger.info("User %s is deleting session: %s from website: %s", res.locals.user.id, sessionId, websiteId);
  try {
    await ensureAdminAuth();

    const session = await pbAdmin.collection("sessions").getOne(sessionId);

    if (session.website !== websiteId) {
      logger.warn("Session %s does not belong to website %s", sessionId, websiteId);
      return res.status(403).send("You do not have permission to delete this session.");
    }

    const website = await pbAdmin.collection("websites").getOne(websiteId);
    if (website.user !== res.locals.user.id) {
      logger.warn("User %s attempted to delete session from unauthorized website %s", res.locals.user.id, websiteId);
      return res.status(403).send("You do not have permission to delete this session.");
    }

    const [events, jsErrors] = await Promise.all([
      pbAdmin.collection("events").getFullList({
        filter: `session.id = "${sessionId}"`,
        fields: "id",
        $autoCancel: false,
      }),
      pbAdmin.collection("js_errors").getFullList({
        filter: `session.id = "${sessionId}"`,
        fields: "id",
        $autoCancel: false,
      }),
    ]);

    const deletePromises = [...events.map((event) => pbAdmin.collection("events").delete(event.id)), ...jsErrors.map((jsError) => pbAdmin.collection("js_errors").delete(jsError.id))];

    await Promise.all(deletePromises);
    await pbAdmin.collection("sessions").delete(sessionId);

    const remainingSessions = await pbAdmin.collection("sessions").getList(1, 1, {
      filter: `visitor.id = "${session.visitor}"`,
      $autoCancel: false,
    });

    if (remainingSessions.totalItems === 0) {
      await pbAdmin.collection("visitors").delete(session.visitor);
      logger.debug("Deleted visitor record %s as no sessions remain.", session.visitor);
    }

    cacheService.invalidateWebsite(websiteId);

    logger.info("Successfully deleted session: %s", sessionId);
    res.redirect(`/sessions/${websiteId}`);
  } catch (error) {
    logger.error("Error deleting session %s: %o", sessionId, error);
    res.status(500).render("500");
  }
}

export async function deleteVisitorSessions(req, res) {
  const { websiteId, visitorId } = req.params;
  logger.info("User %s is deleting all sessions for visitor: %s from website: %s", res.locals.user.id, visitorId, websiteId);
  try {
    await ensureAdminAuth();

    const visitor = await pbAdmin.collection("visitors").getOne(visitorId);

    if (visitor.website !== websiteId) {
      logger.warn("Visitor %s does not belong to website %s", visitorId, websiteId);
      return res.status(403).send("You do not have permission to delete this visitor.");
    }

    const website = await pbAdmin.collection("websites").getOne(websiteId);
    if (website.user !== res.locals.user.id) {
      logger.warn("User %s attempted to delete visitor from unauthorized website %s", res.locals.user.id, websiteId);
      return res.status(403).send("You do not have permission to delete this visitor.");
    }

    const sessions = await pbAdmin.collection("sessions").getFullList({
      filter: `visitor.id = "${visitorId}"`,
      fields: "id",
      $autoCancel: false,
    });

    const deletePromises = [];

    for (const session of sessions) {
      const [events, jsErrors] = await Promise.all([
        pbAdmin.collection("events").getFullList({
          filter: `session.id = "${session.id}"`,
          fields: "id",
          $autoCancel: false,
        }),
        pbAdmin.collection("js_errors").getFullList({
          filter: `session.id = "${session.id}"`,
          fields: "id",
          $autoCancel: false,
        }),
      ]);

      deletePromises.push(...events.map((event) => pbAdmin.collection("events").delete(event.id)), ...jsErrors.map((jsError) => pbAdmin.collection("js_errors").delete(jsError.id)));
    }

    await Promise.all(deletePromises);

    await Promise.all(sessions.map((session) => pbAdmin.collection("sessions").delete(session.id)));

    await pbAdmin.collection("visitors").delete(visitorId);

    cacheService.invalidateWebsite(websiteId);

    logger.info("Successfully deleted all sessions for visitor: %s", visitorId);
    res.redirect(`/sessions/${websiteId}`);
  } catch (error) {
    logger.error("Error deleting visitor sessions %s: %o", visitorId, error);
    res.status(500).render("500");
  }
}

export async function getIpIntelligence(req, res) {
  const { websiteId, sessionId } = req.params;
  logger.info("Fetching IP intelligence for session: %s, website: %s, user: %s", sessionId, websiteId, res.locals.user.id);

  try {
    await ensureAdminAuth();

    const website = await pbAdmin.collection("websites").getOne(websiteId);
    if (website.user !== res.locals.user.id) {
      logger.warn("User %s attempted to access unauthorized website %s", res.locals.user.id, websiteId);
      return res.status(403).json({ error: "Unauthorized" });
    }

    const session = await pbAdmin.collection("sessions").getOne(sessionId, {
      $autoCancel: false,
    });

    if (session.website !== websiteId) {
      logger.warn("Session %s does not belong to website %s", sessionId, websiteId);
      return res.status(404).json({ error: "Session not found" });
    }

    if (!session.ipAddress) {
      logger.warn("Session %s has no IP address stored", sessionId);
      return res.status(400).json({ error: "No IP address available for this session" });
    }

    const apiKey = await getApiKey(res.locals.user.id, "chapybara");
    if (!apiKey) {
      logger.warn("User %s has no Chapybara API key configured", res.locals.user.id);
      return res.status(400).json({ error: "Chapybara API key not configured" });
    }

    const chapybaraUrl = `https://api.chapyapi.com/api/v1/ip/${session.ipAddress}`;
    logger.debug("Calling Chapybara API: %s", chapybaraUrl);

    const response = await fetch(chapybaraUrl, {
      headers: {
        "X-API-Key": apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Chapybara API error: %s - %s", response.status, errorText);
      return res.status(response.status).json({
        error: "Failed to fetch IP intelligence",
        details: errorText,
      });
    }

    const ipData = await response.json();
    logger.info("Successfully fetched IP intelligence for %s", session.ipAddress);

    res.json(ipData);
  } catch (error) {
    logger.error("Error fetching IP intelligence for session %s: %o", sessionId, error);
    res.status(500).json({ error: "Internal server error" });
  }
}
