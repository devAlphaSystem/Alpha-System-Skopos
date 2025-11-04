import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import logger from "../services/logger.js";
import { initializeAdjustments, accumulateSessionAdjustments, accumulateJsErrorAdjustments, applyDashSummaryAdjustments } from "../services/dashSummary.js";

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

  return { websites, archivedWebsites, allWebsites };
}

export async function showSessions(req, res) {
  const { websiteId } = req.params;
  logger.info("Rendering sessions page for website: %s, user: %s", websiteId, res.locals.user.id);
  try {
    const { websites, archivedWebsites, allWebsites } = await getCommonData(res.locals.user.id);

    const currentWebsite = allWebsites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      logger.warn("User %s attempted to access unauthorized or non-existent website %s", res.locals.user.id, websiteId);
      return res.status(404).render("404");
    }

    await ensureAdminAuth();

    const visitors = await pbAdmin.collection("visitors").getFullList({
      filter: `website.id = "${websiteId}"`,
      sort: "-created",
      $autoCancel: false,
    });

    const sessionsData = [];

    for (const visitor of visitors) {
      const sessions = await pbAdmin.collection("sessions").getFullList({
        filter: `visitor.id = "${visitor.id}"`,
        sort: "-created",
        $autoCancel: false,
      });

      for (const session of sessions) {
        const eventsCount = await pbAdmin.collection("events").getList(1, 1, {
          filter: `session.id = "${session.id}" && type = "pageView"`,
          $autoCancel: false,
        });

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
          pagesVisited: eventsCount.totalItems,
          browser: session.browser,
          os: session.os,
          device: session.device,
          country: session.country,
          isNewVisitor: session.isNewVisitor,
        });
      }
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

    logger.debug("Sessions page data for website %s calculated successfully. Rendering page.", websiteId);

    res.render("sessions", {
      websites,
      archivedWebsites,
      currentWebsite,
      visitorsWithSessions,
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

    logger.debug("Session details for session %s calculated successfully. Rendering page.", sessionId);

    res.render("session-details", {
      websites,
      archivedWebsites,
      currentWebsite,
      sessionInfo,
      metrics,
      reports,
      events,
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

    const adjustments = initializeAdjustments();

    const events = await pbAdmin.collection("events").getFullList({
      filter: `session.id = "${sessionId}"`,
      fields: "id,type,path,eventName,eventData,created",
      sort: "created",
      $autoCancel: false,
    });

    const jsErrors = await pbAdmin.collection("js_errors").getFullList({
      filter: `session.id = "${sessionId}"`,
      fields: "id,errorMessage,count,created,lastSeen",
      $autoCancel: false,
    });

    accumulateSessionAdjustments(adjustments, session, events, jsErrors);
    accumulateJsErrorAdjustments(adjustments, jsErrors);

    for (const event of events) {
      await pbAdmin.collection("events").delete(event.id);
    }

    for (const jsError of jsErrors) {
      await pbAdmin.collection("js_errors").delete(jsError.id);
    }

    await pbAdmin.collection("sessions").delete(sessionId);

    await applyDashSummaryAdjustments(websiteId, adjustments);

    const remainingSessions = await pbAdmin.collection("sessions").getList(1, 1, {
      filter: `visitor.id = "${session.visitor}"`,
      $autoCancel: false,
    });

    if (remainingSessions.totalItems === 0) {
      await pbAdmin.collection("visitors").delete(session.visitor);
      logger.debug("Deleted visitor record %s as no sessions remain.", session.visitor);
    }

    logger.info("Successfully deleted session: %s and updated dashboard summaries.", sessionId);
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

    const adjustments = initializeAdjustments();

    const sessions = await pbAdmin.collection("sessions").getFullList({
      filter: `visitor.id = "${visitorId}"`,
      fields: "id,website,isNewVisitor,device,browser,language,country,entryPath,exitPath,referrer,created,updated",
      $autoCancel: false,
    });

    for (const session of sessions) {
      const events = await pbAdmin.collection("events").getFullList({
        filter: `session.id = "${session.id}"`,
        fields: "id,type,path,eventName,eventData,created",
        sort: "created",
        $autoCancel: false,
      });

      const jsErrors = await pbAdmin.collection("js_errors").getFullList({
        filter: `session.id = "${session.id}"`,
        fields: "id,errorMessage,count,created,lastSeen",
        $autoCancel: false,
      });

      accumulateSessionAdjustments(adjustments, session, events, jsErrors);
      accumulateJsErrorAdjustments(adjustments, jsErrors);

      for (const event of events) {
        await pbAdmin.collection("events").delete(event.id);
      }

      for (const jsError of jsErrors) {
        await pbAdmin.collection("js_errors").delete(jsError.id);
      }

      await pbAdmin.collection("sessions").delete(session.id);
    }

    await pbAdmin.collection("visitors").delete(visitorId);

    await applyDashSummaryAdjustments(websiteId, adjustments);
    logger.info("Successfully deleted all sessions for visitor: %s and updated dashboard summaries.", visitorId);
    res.redirect(`/sessions/${websiteId}`);
  } catch (error) {
    logger.error("Error deleting visitor sessions %s: %o", visitorId, error);
    res.status(500).render("500");
  }
}
