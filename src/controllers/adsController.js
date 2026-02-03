import { pbAdmin, ensureAdminAuth } from "../services/pocketbase.js";
import { createAdvertisement, updateAdvertisement, deleteAdvertisement, getAdvertisementsByWebsite, getAdvertisementMetrics, generateAdFromSeoData, getBannerSizes, getColorSchemes, generateBannerSvg } from "../services/adsService.js";
import logger from "../utils/logger.js";

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

export async function showAdvertisements(req, res) {
  const { websiteId } = req.params;
  logger.info("Rendering advertisements page for website: %s, user: %s", websiteId, res.locals.user.id);

  try {
    const { websites, archivedWebsites, allWebsites } = await getCommonData(res.locals.user.id);

    const currentWebsite = allWebsites.find((w) => w.id === websiteId);
    if (!currentWebsite) {
      logger.warn("User %s attempted to access unauthorized or non-existent website %s", res.locals.user.id, websiteId);
      return res.status(404).render("404");
    }

    const advertisements = await getAdvertisementsByWebsite(websiteId);

    const adsWithMetrics = await Promise.all(
      advertisements.map(async (ad) => {
        const metrics = await getAdvertisementMetrics(ad.id, 30);
        const adData = JSON.parse(JSON.stringify(ad));

        if (adData.bannerConfig?.svgContent) {
          const adId = ad.id;
          adData.bannerConfig.svgContent = adData.bannerConfig.svgContent
            .replace(/id="bgGradient"/g, `id="bgGradient_${adId}"`)
            .replace(/id="btnGradient"/g, `id="btnGradient_${adId}"`)
            .replace(/id="shadow"/g, `id="shadow_${adId}"`)
            .replace(/url\(#bgGradient\)/g, `url(#bgGradient_${adId})`)
            .replace(/url\(#btnGradient\)/g, `url(#btnGradient_${adId})`)
            .replace(/url\(#shadow\)/g, `url(#shadow_${adId})`);
        }

        return { ...adData, metrics };
      }),
    );

    const bannerSizes = getBannerSizes();
    const colorSchemes = getColorSchemes();

    res.render("advertisements", {
      websites,
      archivedWebsites,
      currentWebsite,
      advertisements: adsWithMetrics,
      bannerSizes,
      colorSchemes,
      currentPage: "advertisements",
    });
  } catch (error) {
    logger.error("Error loading advertisements for website %s: %o", websiteId, error);
    res.status(500).render("500");
  }
}

export async function createAd(req, res) {
  const { websiteId } = req.params;
  const userId = res.locals.user?.id;

  logger.info("Creating advertisement for website: %s, user: %s", websiteId, userId);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const adData = req.body;

    if (!adData.name || typeof adData.name !== "string" || adData.name.trim().length === 0) {
      return res.status(400).json({ error: "Advertisement name is required" });
    }

    if (!adData.title || typeof adData.title !== "string" || adData.title.trim().length === 0) {
      return res.status(400).json({ error: "Advertisement title is required" });
    }

    if (adData.targetUrl && typeof adData.targetUrl === "string") {
      try {
        new URL(adData.targetUrl.startsWith("http") ? adData.targetUrl : `https://${adData.targetUrl}`);
      } catch {
        return res.status(400).json({ error: "Invalid target URL" });
      }
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const advertisement = await createAdvertisement(userId, websiteId, adData, baseUrl);

    res.status(201).json({
      success: true,
      advertisement: {
        id: advertisement.id,
        name: advertisement.description,
        size: advertisement.bannerSize,
        isActive: advertisement.isActive,
      },
    });
  } catch (error) {
    logger.error("Error creating advertisement for website %s: %o", websiteId, error);
    res.status(500).json({ error: error.message || "Failed to create advertisement" });
  }
}

export async function updateAd(req, res) {
  const { websiteId, adId } = req.params;
  const userId = res.locals.user?.id;

  logger.info("Updating advertisement %s for website: %s, user: %s", adId, websiteId, userId);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const adData = req.body;

    if (adData.targetUrl && typeof adData.targetUrl === "string") {
      try {
        new URL(adData.targetUrl.startsWith("http") ? adData.targetUrl : `https://${adData.targetUrl}`);
      } catch {
        return res.status(400).json({ error: "Invalid target URL" });
      }
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const advertisement = await updateAdvertisement(userId, adId, adData, baseUrl);

    res.json({
      success: true,
      advertisement: {
        id: advertisement.id,
        name: advertisement.description,
        size: advertisement.bannerSize,
        isActive: advertisement.isActive,
      },
    });
  } catch (error) {
    logger.error("Error updating advertisement %s: %o", adId, error);
    res.status(500).json({ error: error.message || "Failed to update advertisement" });
  }
}

export async function deleteAd(req, res) {
  const { websiteId, adId } = req.params;
  const userId = res.locals.user?.id;

  logger.info("Deleting advertisement %s for website: %s, user: %s", adId, websiteId, userId);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await deleteAdvertisement(userId, adId);

    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting advertisement %s: %o", adId, error);
    res.status(500).json({ error: error.message || "Failed to delete advertisement" });
  }
}

export async function getAdMetrics(req, res) {
  const { websiteId, adId } = req.params;
  const { period } = req.query;
  const userId = res.locals.user?.id;

  logger.info("Fetching metrics for advertisement %s, website: %s, user: %s", adId, websiteId, userId);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const periodDays = parseInt(period, 10) || 30;
    const metrics = await getAdvertisementMetrics(adId, periodDays);

    res.json({ success: true, metrics });
  } catch (error) {
    logger.error("Error fetching metrics for advertisement %s: %o", adId, error);
    res.status(500).json({ error: error.message || "Failed to fetch metrics" });
  }
}

export async function generateFromSeo(req, res) {
  const { websiteId } = req.params;
  const userId = res.locals.user?.id;

  logger.info("Generating ad from SEO data for website: %s, user: %s", websiteId, userId);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const options = req.body || {};
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const advertisement = await generateAdFromSeoData(userId, websiteId, options, baseUrl);

    res.status(201).json({
      success: true,
      advertisement: {
        id: advertisement.id,
        name: advertisement.description,
        size: advertisement.bannerSize,
        isActive: advertisement.isActive,
        svgContent: advertisement.bannerConfig?.svgContent,
      },
    });
  } catch (error) {
    logger.error("Error generating ad from SEO data for website %s: %o", websiteId, error);
    res.status(500).json({ error: error.message || "Failed to generate advertisement" });
  }
}

export async function previewBanner(req, res) {
  const userId = res.locals.user?.id;

  logger.debug("Generating banner preview for user: %s", userId);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const options = req.body || {};
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const svgContent = generateBannerSvg({
      size: options.size || "medium-rectangle",
      title: options.title || "Your Ad Title",
      subtitle: options.subtitle || "",
      ctaText: options.ctaText || "Learn More",
      colorScheme: options.colorScheme || "brand",
      logoText: options.logoText || "A",
      logoUrl: options.logoUrl || null,
      imageUrl: options.imageUrl || null,
      badgeText: options.badgeText || "",
      isAnimated: options.isAnimated !== undefined ? options.isAnimated : true,
      customColors: options.customColors || null,
      baseUrl: baseUrl,
    });

    res.json({ success: true, svgContent });
  } catch (error) {
    logger.error("Error generating banner preview: %o", error);
    res.status(500).json({ error: error.message || "Failed to generate preview" });
  }
}

async function inlineSvgImages(svgContent, baseUrl) {
  const images = svgContent.match(/href="([^"]+)"/g);
  if (!images) return svgContent;

  let newSvg = svgContent;
  for (const imgTag of images) {
    const urlMatch = imgTag.match(/href="([^"]+)"/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    if (url.startsWith("data:")) continue;

    try {
      let absoluteUrl = url;
      if (url.startsWith("/")) {
        absoluteUrl = `${baseUrl}${url}`;
      }

      logger.debug("Inlining image for SVG: %s", absoluteUrl);
      const response = await fetch(absoluteUrl, {
        headers: { "User-Agent": "Skopos-Banner-Inliner/1.0" },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") || "image/png";
        const base64 = Buffer.from(buffer).toString("base64");
        const dataUrl = `data:${contentType};base64,${base64}`;
        newSvg = newSvg.replace(imgTag, `href="${dataUrl}"`);
      }
    } catch (error) {
      logger.error("Failed to inline image %s: %s", url, error.message);
    }
  }
  return newSvg;
}

export async function getAdBanner(req, res) {
  const { adId } = req.params;

  logger.debug("Serving banner for advertisement: %s", adId);

  try {
    const ad = await pbAdmin.collection("advertisements").getOne(adId);

    if (!ad || !ad.isActive) {
      return res.status(404).send("Ad not found");
    }

    await pbAdmin.collection("advertisements").update(adId, {
      "impressionCount+": 1,
    });

    let svgContent = ad.bannerConfig?.svgContent || "";

    const origin = `${req.protocol}://${req.get("host")}`;

    if (svgContent.includes('href="http') && !svgContent.includes("/api/proxy-image")) {
      svgContent = svgContent.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
        if (url.includes("/api/proxy-image") || url.includes(origin)) return match;
        return `href="${origin}/api/proxy-image?url=${encodeURIComponent(url)}"`;
      });
    }

    svgContent = await inlineSvgImages(svgContent, origin);

    res.set("Content-Type", "image/svg+xml");
    res.set("Cache-Control", "public, max-age=3600");
    res.set("Access-Control-Allow-Origin", "*");
    res.send(svgContent);
  } catch (error) {
    logger.error("Error serving banner %s: %o", adId, error);
    res.status(404).send("Ad not found");
  }
}

export async function getEmbedCode(req, res) {
  const { websiteId, adId } = req.params;
  const userId = res.locals.user?.id;

  logger.info("Generating embed code for advertisement %s", adId);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await ensureAdminAuth();

    const ad = await pbAdmin.collection("advertisements").getOne(adId, {
      expand: "website",
    });

    if (!ad || ad.expand?.website?.user !== userId) {
      return res.status(404).json({ error: "Advertisement not found" });
    }

    const bannerSizes = getBannerSizes();
    const size = bannerSizes[ad.bannerSize] || bannerSizes["300x250"];

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const bannerUrl = `${baseUrl}/ads/banner/${ad.id}`;
    const clickUrl = `${baseUrl}/ads/click/${ad.id}`;

    const embedCode = `<!-- Skopos Ad Banner -->
<a href="${clickUrl}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;">
  <img src="${bannerUrl}" 
       alt="${ad.title}" 
       width="${size.width}" 
       height="${size.height}" 
       style="border:0;max-width:100%;height:auto;" 
       loading="lazy" />
</a>
<!-- End Skopos Ad Banner -->`;

    const htmlEmbed = `<div class="skopos-ad-responsive" style="width: 100%; max-width: ${size.width}px; margin: 0 auto;">
  <div style="position: relative; padding-bottom: ${((size.height / size.width) * 100).toFixed(2)}%; height: 0; overflow: hidden;">
    <a href="${clickUrl}" target="_blank" rel="noopener sponsored" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
      <img src="${bannerUrl}" alt="${ad.title}" style="width: 100%; height: 100%; display: block; border: 0; object-fit: contain;" />
    </a>
  </div>
</div>`;

    const jsEmbed = `<script>
(function() {
  var d = document.createElement('div');
  d.style.width = '100%';
  d.style.maxWidth = '${size.width}px';
  d.style.margin = '0 auto';
  d.innerHTML = '<div style="position:relative;padding-bottom:${((size.height / size.width) * 100).toFixed(2)}%;height:0;overflow:hidden;"><a href="${clickUrl}" target="_blank" rel="noopener sponsored" style="position:absolute;top:0;left:0;width:100%;height:100%;"><img src="${bannerUrl}" alt="${ad.title}" style="width:100%;height:100%;display:block;border:0;object-fit:contain;"></a></div>';
  document.currentScript.parentNode.insertBefore(d, document.currentScript);
})();
</script>`;

    res.json({
      success: true,
      embedCode,
      htmlEmbed,
      jsEmbed,
      bannerUrl,
      clickUrl,
      size,
      ad: JSON.parse(JSON.stringify(ad)),
    });
  } catch (error) {
    logger.error("Error generating embed code for advertisement %s: %o", adId, error);
    res.status(500).json({ error: error.message || "Failed to generate embed code" });
  }
}

export async function toggleAdStatus(req, res) {
  const { websiteId, adId } = req.params;
  const userId = res.locals.user?.id;

  logger.info("Toggling status for advertisement %s", adId);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await ensureAdminAuth();

    const ad = await pbAdmin.collection("advertisements").getOne(adId, {
      expand: "website",
    });

    if (!ad || ad.expand?.website?.user !== userId) {
      return res.status(404).json({ error: "Advertisement not found" });
    }

    const updated = await pbAdmin.collection("advertisements").update(adId, {
      isActive: !ad.isActive,
    });

    res.json({
      success: true,
      isActive: updated.isActive,
    });
  } catch (error) {
    logger.error("Error toggling advertisement %s: %o", adId, error);
    res.status(500).json({ error: error.message || "Failed to toggle status" });
  }
}
