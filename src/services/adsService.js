import { pbAdmin, ensureAdminAuth } from "./pocketbase.js";
import logger from "../utils/logger.js";
import { randomUUID } from "node:crypto";

const BANNER_SIZES = {
  "728x90": { width: 728, height: 90, label: "Leaderboard (728×90)" },
  "300x250": { width: 300, height: 250, label: "Medium Rectangle (300×250)" },
  "160x600": { width: 160, height: 600, label: "Wide Skyscraper (160×600)" },
  "320x50": { width: 320, height: 50, label: "Mobile Banner (320×50)" },
  "300x600": { width: 300, height: 600, label: "Half Page (300×600)" },
};

const SIZE_MAPPING = {
  leaderboard: "728x90",
  "medium-rectangle": "300x250",
  "wide-skyscraper": "160x600",
  "large-rectangle": "300x250",
  "half-page": "300x600",
  billboard: "728x90",
  "mobile-banner": "320x50",
  "mobile-large": "320x50",
};

const BANNER_TYPES = ["minimal", "gradient", "bold", "elegant", "modern"];

function getBannerSize(size) {
  if (BANNER_SIZES[size]) return size;
  return SIZE_MAPPING[size] || "300x250";
}

function getBannerType(type) {
  const t = (type || "minimal").toLowerCase();
  return BANNER_TYPES.includes(t) ? t : "minimal";
}

const COLOR_SCHEMES = {
  brand: {
    primary: "#ef4444",
    secondary: "#dc2626",
    background: "#ffffff",
    text: "#111827",
    accent: "#fef2f2",
    cta: "#ffffff",
  },
  dark: {
    primary: "#f87171",
    secondary: "#ef4444",
    background: "#111827",
    text: "#f9fafb",
    accent: "#1f2937",
    cta: "#ffffff",
  },
  ocean: {
    primary: "#0ea5e9",
    secondary: "#0284c7",
    background: "#f0f9ff",
    text: "#0c4a6e",
    accent: "#e0f2fe",
    cta: "#ffffff",
  },
  forest: {
    primary: "#22c55e",
    secondary: "#16a34a",
    background: "#f0fdf4",
    text: "#14532d",
    accent: "#dcfce7",
    cta: "#ffffff",
  },
  sunset: {
    primary: "#f97316",
    secondary: "#ea580c",
    background: "#fff7ed",
    text: "#7c2d12",
    accent: "#ffedd5",
    cta: "#ffffff",
  },
  purple: {
    primary: "#a855f7",
    secondary: "#9333ea",
    background: "#faf5ff",
    text: "#581c87",
    accent: "#f3e8ff",
    cta: "#ffffff",
  },
  neon: {
    primary: "#00ff41",
    secondary: "#003b00",
    background: "#0d0208",
    text: "#00ff41",
    accent: "#003b00",
    cta: "#000000",
  },
  glass: {
    primary: "#ffffff",
    secondary: "#e2e8f0",
    background: "rgba(255, 255, 255, 0.1)",
    text: "#ffffff",
    accent: "rgba(255, 255, 255, 0.05)",
    cta: "#111827",
  },
};

function sanitize(str, maxLen = 255) {
  if (typeof str !== "string") return "";
  return str
    .replace(/[\p{Cc}]/gu, "")
    .trim()
    .slice(0, maxLen);
}

function sanitizeUrl(url) {
  const fallback = process.env.APP_URL || "";
  if (!url || typeof url !== "string") return fallback;

  let target = url.trim();
  if (target === "") return fallback;

  if (!target.includes("://")) {
    target = "https://" + target;
  }

  try {
    const parsed = new URL(target);
    if (!parsed.hostname) return fallback;
    return parsed.toString();
  } catch (e) {
    return fallback;
  }
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function proxyUrl(url, baseUrl = "") {
  if (!url || !url.startsWith("http")) return url;
  const proxyPath = `/api/proxy-image?url=${encodeURIComponent(url)}`;
  return baseUrl ? `${baseUrl}${proxyPath}` : proxyPath;
}

export function generateBannerSvg(options) {
  const { size = "300x250", title = "Your Ad Here", subtitle = "", ctaText = "Learn More", colorScheme = "brand", logoText = "", logoUrl = null, imageUrl = null, badgeText = "", isAnimated = true, customColors = null, id = Math.random().toString(36).substring(2, 9), baseUrl = "" } = options;

  const mappedSize = getBannerSize(size);
  const sizeConfig = BANNER_SIZES[mappedSize] || BANNER_SIZES["300x250"];
  const colors = customColors || COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.brand;
  const { width, height } = sizeConfig;

  const proxiedImageUrl = proxyUrl(imageUrl, baseUrl);
  const proxiedLogoUrl = proxyUrl(logoUrl, baseUrl);

  const safeTitle = escapeHtml(sanitize(title, 100));
  const safeSubtitle = escapeHtml(sanitize(subtitle, 150));
  const safeCta = escapeHtml(sanitize(ctaText, 30));
  const safeLogo = escapeHtml(sanitize(logoText, 20));
  const safeBadge = escapeHtml(sanitize(badgeText, 15));

  const isWide = width / height > 3;
  const isTall = height / width > 2;
  const isSmall = width < 350 && height < 150;

  const gradIds = {
    bg: `bgGradient_${id}`,
    btn: `btnGradient_${id}`,
    shadow: `shadow_${id}`,
    imgClip: `imgClip_${id}`,
  };

  const animations = isAnimated ? generateAnimations(id, colors) : "";

  let layout;
  if (isWide) {
    layout = generateWideLayout(width, height, safeTitle, safeSubtitle, safeCta, safeLogo, proxiedLogoUrl, proxiedImageUrl, colors, gradIds);
  } else if (isTall) {
    layout = generateTallLayout(width, height, safeTitle, safeSubtitle, safeCta, safeLogo, proxiedLogoUrl, proxiedImageUrl, colors, gradIds);
  } else if (isSmall) {
    layout = generateCompactLayout(width, height, safeTitle, safeCta, safeLogo, proxiedLogoUrl, proxiedImageUrl, colors, gradIds);
  } else {
    layout = generateStandardLayout(width, height, safeTitle, safeSubtitle, safeCta, safeLogo, proxiedLogoUrl, proxiedImageUrl, colors, gradIds);
  }

  const badge = safeBadge ? generateBadge(width, height, safeBadge, colors) : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&amp;display=swap');
    ${animations}
  </style>
  <defs>
    <linearGradient id="${gradIds.bg}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.background};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors.accent};stop-opacity:1" />
    </linearGradient>
    <linearGradient id="${gradIds.btn}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.primary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors.secondary};stop-opacity:1" />
    </linearGradient>
    <filter id="${gradIds.shadow}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/>
    </filter>
    <clipPath id="${gradIds.imgClip}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8"/>
    </clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#${gradIds.bg})" rx="8"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="${colors.primary}" stroke-opacity="0.1" rx="7"/>
  ${layout}
  ${badge}
</svg>`;
}

function generateAnimations(id, colors) {
  return `
    @keyframes breathe-${id} {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
    .cta-btn-${id} {
      animation: breathe-${id} 4s infinite ease-in-out;
      transform-origin: center;
      transform-box: fill-box;
    }
    @keyframes float-${id} {
      0% { transform: translateY(0px); }
      50% { transform: translateY(-5px); }
      100% { transform: translateY(0px); }
    }
    .float-${id} {
      animation: float-${id} 4s infinite ease-in-out;
      transform-box: fill-box;
      transform-origin: center;
    }
  `;
}

function generateBadge(width, height, text, colors) {
  const badgeWidth = 60;
  return `
    <g transform="translate(${width - badgeWidth}, 0)">
      <path d="M 0 0 L ${badgeWidth} 0 L ${badgeWidth} ${badgeWidth} Z" fill="${colors.primary}"/>
      <text transform="rotate(45, ${badgeWidth * 0.7}, ${badgeWidth * 0.3})" x="${badgeWidth * 0.7}" y="${badgeWidth * 0.3}" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="${colors.cta || "#ffffff"}" text-anchor="middle">
        ${text.toUpperCase()}
      </text>
    </g>
  `;
}

function generateWideLayout(width, height, title, subtitle, cta, logo, logoUrl, imageUrl, colors, gradIds) {
  const padding = 16;
  const imageWidth = imageUrl ? height * 1.2 : 0;
  const logoSize = height - padding * 2;

  let textX = padding;
  if (imageUrl) {
    textX = imageWidth + 16;
  } else if (logo || logoUrl) {
    textX = padding + logoSize + 16;
  }

  const textWidth = width - textX - 140;
  const fontSize = Math.min(18, height * 0.25);
  const subtitleSize = Math.min(12, height * 0.15);
  const titleLines = wrapText(title, textWidth, fontSize, 2);
  const subtitleLines = subtitle ? wrapText(subtitle, textWidth, subtitleSize, 1) : [];

  return `
    ${
      imageUrl
        ? `
      <defs>
        <clipPath id="wideClip_${gradIds.imgClip}">
          <rect x="0" y="0" width="${imageWidth}" height="${height}" rx="8"/>
        </clipPath>
      </defs>
      <image href="${imageUrl}" x="0" y="0" width="${imageWidth}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#wideClip_${gradIds.imgClip})"/>
    `
        : logoUrl
          ? `
      <rect x="${padding}" y="${padding}" width="${logoSize}" height="${logoSize}" rx="6" fill="${colors.primary}" fill-opacity="0.1"/>
      <image href="${logoUrl}" x="${padding + 4}" y="${padding + 4}" width="${logoSize - 8}" height="${logoSize - 8}" preserveAspectRatio="xMidYMid meet" class="float-${gradIds.bg.split("_")[1]}"/>
    `
          : logo
            ? `
      <rect x="${padding}" y="${padding}" width="${logoSize}" height="${logoSize}" rx="6" fill="${colors.primary}" fill-opacity="0.1"/>
      <text x="${padding + logoSize / 2}" y="${height / 2 + fontSize * 0.35}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${colors.primary}" text-anchor="middle">${logo.charAt(0).toUpperCase()}</text>
    `
            : ""
    }
    
    <text x="${textX}" y="${height / 2 - (subtitle ? (titleLines.length > 1 ? fontSize * 0.6 : 4) : titleLines.length > 1 ? fontSize * 0.3 : -fontSize * 0.3)}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${colors.text}">
      ${titleLines.map((line, i) => `<tspan x="${textX}" dy="${i === 0 ? 0 : fontSize * 1.1}">${line}</tspan>`).join("")}
    </text>
    ${
      subtitle
        ? `
      <text x="${textX}" y="${height / 2 + subtitleSize + 4}" font-family="Inter, Arial, sans-serif" font-size="${subtitleSize}" fill="${colors.text}" fill-opacity="0.7">
        ${subtitleLines[0]}
      </text>
    `
        : ""
    }
    <g class="cta-btn-${gradIds.bg.split("_")[1]}">
      <rect x="${width - 120 - padding}" y="${(height - 36) / 2}" width="120" height="36" rx="6" fill="url(#${gradIds.btn})" filter="url(#${gradIds.shadow})"/>
      <text x="${width - 60 - padding}" y="${height / 2 + 5}" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="600" fill="${colors.cta || "#ffffff"}" text-anchor="middle">${cta}</text>
    </g>
  `;
}

function generateTallLayout(width, height, title, subtitle, cta, logo, logoUrl, imageUrl, colors, gradIds) {
  const padding = 20;
  const imageHeight = imageUrl ? width * 0.8 : 0;
  const logoSize = 50;
  const titleSize = Math.min(20, width * 0.12);
  const subtitleSize = Math.min(13, width * 0.08);
  const ctaWidth = width - padding * 2;
  const ctaHeight = 44;

  const contentStartY = imageUrl ? imageHeight + 20 : logo || logoUrl ? padding + logoSize + 30 : padding + 40;
  const titleLines = wrapText(title, width - padding * 2, titleSize, 3);
  const subtitleLines = subtitle ? wrapText(subtitle, width - padding * 2, subtitleSize, 4) : [];

  return `
    ${
      imageUrl
        ? `
      <defs>
        <clipPath id="tallClip_${gradIds.imgClip}">
          <rect x="0" y="0" width="${width}" height="${imageHeight}" rx="8"/>
        </clipPath>
      </defs>
      <image href="${imageUrl}" x="0" y="0" width="${width}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#tallClip_${gradIds.imgClip})"/>
    `
        : logoUrl
          ? `
      <rect x="${(width - logoSize) / 2}" y="${padding}" width="${logoSize}" height="${logoSize}" rx="10" fill="${colors.primary}" fill-opacity="0.1"/>
      <image href="${logoUrl}" x="${(width - logoSize) / 2 + 5}" y="${padding + 5}" width="${logoSize - 10}" height="${logoSize - 10}" preserveAspectRatio="xMidYMid meet" class="float-${gradIds.bg.split("_")[1]}"/>
    `
          : logo
            ? `
      <rect x="${(width - logoSize) / 2}" y="${padding}" width="${logoSize}" height="${logoSize}" rx="10" fill="${colors.primary}" fill-opacity="0.1"/>
      <text x="${width / 2}" y="${padding + logoSize / 2 + titleSize * 0.35}" font-family="Inter, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="${colors.primary}" text-anchor="middle">${logo.charAt(0).toUpperCase()}</text>
    `
            : ""
    }
    
    <text x="${width / 2}" y="${contentStartY}" font-family="Inter, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="${colors.text}" text-anchor="middle">
      ${titleLines.map((line, i) => `<tspan x="${width / 2}" dy="${i === 0 ? 0 : titleSize * 1.2}">${line}</tspan>`).join("")}
    </text>
    ${
      subtitle
        ? `
      <text x="${width / 2}" y="${contentStartY + titleLines.length * titleSize * 1.2 + 15}" font-family="Inter, Arial, sans-serif" font-size="${subtitleSize}" fill="${colors.text}" fill-opacity="0.7" text-anchor="middle">
        ${subtitleLines.map((line, i) => `<tspan x="${width / 2}" dy="${i === 0 ? 0 : subtitleSize * 1.2}">${line}</tspan>`).join("")}
      </text>
    `
        : ""
    }
    <g class="cta-btn-${gradIds.btn.split("_")[1]}">
      <rect x="${padding}" y="${height - padding - ctaHeight}" width="${ctaWidth}" height="${ctaHeight}" rx="8" fill="url(#${gradIds.btn})" filter="url(#${gradIds.shadow})"/>
      <text x="${width / 2}" y="${height - padding - ctaHeight / 2 + 5}" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="600" fill="${colors.cta || "#ffffff"}" text-anchor="middle">${cta}</text>
    </g>
  `;
}

function generateCompactLayout(width, height, title, cta, logo, logoUrl, imageUrl, colors, gradIds) {
  const padding = 10;
  const imageSize = height - padding * 2;
  const fontSize = Math.min(13, height * 0.3);
  const ctaWidth = 70;

  const textX = imageUrl || logo || logoUrl ? padding + (imageUrl ? imageSize : 30) + 12 : padding;
  const textWidth = width - ctaWidth - textX - padding;
  const titleLines = wrapText(title, textWidth, fontSize, 2);

  return `
    ${
      imageUrl
        ? `
      <defs>
        <clipPath id="compClip_${gradIds.imgClip}">
          <rect x="${padding}" y="${padding}" width="${imageSize}" height="${imageSize}" rx="4"/>
        </clipPath>
      </defs>
      <rect x="${padding}" y="${padding}" width="${imageSize}" height="${imageSize}" rx="4" fill="${colors.primary}" fill-opacity="0.05"/>
      <image href="${imageUrl}" x="${padding}" y="${padding}" width="${imageSize}" height="${imageSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#compClip_${gradIds.imgClip})"/>
    `
        : logoUrl
          ? `
      <rect x="${padding}" y="${(height - 30) / 2}" width="30" height="30" rx="4" fill="${colors.primary}" fill-opacity="0.1"/>
      <image href="${logoUrl}" x="${padding + 3}" y="${(height - 30) / 2 + 3}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>
    `
          : logo
            ? `
      <rect x="${padding}" y="${(height - 30) / 2}" width="30" height="30" rx="4" fill="${colors.primary}" fill-opacity="0.1"/>
      <text x="${padding + 15}" y="${height / 2 + fontSize * 0.3}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${colors.primary}" text-anchor="middle">${logo.charAt(0).toUpperCase()}</text>
    `
            : ""
    }
    
    <text x="${textX}" y="${height / 2 - (titleLines.length > 1 ? fontSize * 0.2 : -fontSize * 0.35)}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="${colors.text}">
      ${titleLines.map((line, i) => `<tspan x="${textX}" dy="${i === 0 ? 0 : fontSize * 1.1}">${line}</tspan>`).join("")}
    </text>
    <g class="cta-btn-${gradIds.bg.split("_")[1]}">
      <rect x="${width - ctaWidth - padding}" y="${(height - 24) / 2}" width="${ctaWidth}" height="24" rx="4" fill="url(#${gradIds.btn})"/>
      <text x="${width - ctaWidth / 2 - padding}" y="${height / 2 + 4}" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="600" fill="${colors.cta || "#ffffff"}" text-anchor="middle">${cta}</text>
    </g>
  `;
}

function generateStandardLayout(width, height, title, subtitle, cta, logo, logoUrl, imageUrl, colors, gradIds) {
  const padding = 24;
  const imageHeight = imageUrl ? height * 0.45 : 0;
  const logoSize = 48;
  const titleSize = Math.min(22, width * 0.07);
  const subtitleSize = Math.min(14, width * 0.045);
  const ctaWidth = 140;
  const ctaHeight = 44;

  const contentStartY = imageUrl ? imageHeight + padding + 10 : logo || logoUrl ? padding + logoSize + 30 : padding + 36;
  const titleLines = wrapText(title, width - padding * 2, titleSize, 2);
  const subtitleLines = subtitle ? wrapText(subtitle, width - padding * 2, subtitleSize, 3) : [];

  return `
    ${
      imageUrl
        ? `
      <defs>
        <clipPath id="stdClip_${gradIds.imgClip}">
          <rect x="0" y="0" width="${width}" height="${imageHeight}" rx="8"/>
        </clipPath>
      </defs>
      <image href="${imageUrl}" x="0" y="0" width="${width}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#stdClip_${gradIds.imgClip})"/>
    `
        : logoUrl
          ? `
      <rect x="${padding}" y="${padding}" width="${logoSize}" height="${logoSize}" rx="10" fill="${colors.primary}" fill-opacity="0.1"/>
      <image href="${logoUrl}" x="${padding + 8}" y="${padding + 8}" width="${logoSize - 16}" height="${logoSize - 16}" preserveAspectRatio="xMidYMid meet" class="float-${gradIds.bg.split("_")[1]}"/>
    `
          : logo
            ? `
      <rect x="${padding}" y="${padding}" width="${logoSize}" height="${logoSize}" rx="10" fill="${colors.primary}" fill-opacity="0.1"/>
      <text x="${padding + logoSize / 2}" y="${padding + logoSize / 2 + titleSize * 0.35}" font-family="Inter, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="${colors.primary}" text-anchor="middle">${logo.charAt(0).toUpperCase()}</text>
    `
            : ""
    }
    
    <text x="${padding}" y="${contentStartY}" font-family="Inter, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="${colors.text}">
      ${titleLines.map((line, i) => `<tspan x="${padding}" dy="${i === 0 ? 0 : titleSize * 1.2}">${line}</tspan>`).join("")}
    </text>
    ${
      subtitle
        ? `
      <text x="${padding}" y="${contentStartY + titleLines.length * titleSize * 1.2 + 8}" font-family="Inter, Arial, sans-serif" font-size="${subtitleSize}" fill="${colors.text}" fill-opacity="0.7">
        ${subtitleLines.map((line, i) => `<tspan x="${padding}" dy="${i === 0 ? 0 : subtitleSize * 1.2}">${line}</tspan>`).join("")}
      </text>
    `
        : ""
    }
    <g class="cta-btn-${gradIds.btn.split("_")[1]}">
      <rect x="${padding}" y="${height - padding - ctaHeight}" width="${ctaWidth}" height="${ctaHeight}" rx="8" fill="url(#${gradIds.btn})" filter="url(#${gradIds.shadow})"/>
      <text x="${padding + ctaWidth / 2}" y="${height - padding - ctaHeight / 2 + 5}" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="600" fill="${colors.cta || "#ffffff"}" text-anchor="middle">${cta}</text>
    </g>
    <g transform="translate(${width - padding - 60}, ${height - padding - 20})">
      <rect width="60" height="16" rx="3" fill="${colors.text}" fill-opacity="0.05"/>
      <text x="30" y="11" font-family="Inter, Arial, sans-serif" font-size="9" fill="${colors.text}" fill-opacity="0.4" text-anchor="middle">Ad</text>
    </g>
  `;
}

function truncateText(text, maxWidth, fontSize) {
  const avgCharWidth = fontSize * 0.5;
  const maxChars = Math.floor(maxWidth / avgCharWidth);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 2) + "...";
}

function wrapText(text, maxWidth, fontSize, linesCount = 2) {
  const avgCharWidth = fontSize * 0.5;
  const maxChars = Math.floor(maxWidth / avgCharWidth);
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.slice(0, linesCount).map((line, idx) => {
    if (idx === linesCount - 1 && lines.length > linesCount) {
      return line.length > maxChars - 3 ? line.slice(0, maxChars - 3) + "..." : line + "...";
    }
    return line.length > maxChars ? line.slice(0, maxChars - 3) + "..." : line;
  });
}

export async function createAdvertisement(userId, websiteId, adData, baseUrl = "") {
  logger.info("Creating advertisement for website %s, user %s", websiteId, userId);

  await ensureAdminAuth();

  const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);

  if (!website) {
    throw new Error("Website not found or unauthorized");
  }

  const svgContent = generateBannerSvg({
    size: getBannerSize(adData.size),
    title: adData.title || website.name,
    subtitle: adData.subtitle || "",
    ctaText: adData.ctaText || "Learn More",
    colorScheme: adData.colorScheme || "brand",
    logoText: adData.logoText || website.name.charAt(0),
    logoUrl: adData.logoUrl || null,
    imageUrl: adData.imageUrl || null,
    badgeText: adData.badgeText || "",
    isAnimated: adData.isAnimated !== undefined ? adData.isAnimated : true,
    customColors: adData.customColors || null,
    id: Math.random().toString(36).substring(2, 9),
    baseUrl,
  });

  const advertisement = await pbAdmin.collection("advertisements").create({
    website: websiteId,
    title: sanitize(adData.title || website.name, 100),
    description: sanitize(adData.name || `Ad - ${new Date().toISOString().split("T")[0]}`, 1000),
    bannerSize: getBannerSize(adData.size),
    bannerType: getBannerType(adData.bannerType),
    ctaText: sanitize(adData.ctaText || "Learn More", 30),
    targetUrl: sanitizeUrl(adData.targetUrl || website.domain),
    bannerConfig: {
      colorScheme: adData.colorScheme || "brand",
      customColors: adData.customColors || null,
      logoText: sanitize(adData.logoText || website.name.charAt(0), 20),
      logoUrl: adData.logoUrl || null,
      subtitle: sanitize(adData.subtitle || "", 150),
      imageUrl: adData.imageUrl || null,
      badgeText: adData.badgeText || "",
      isAnimated: adData.isAnimated !== undefined ? adData.isAnimated : true,
      svgContent: svgContent,
    },
    isActive: true,
    clickCount: 0,
    impressionCount: 0,
  });

  logger.info("Advertisement %s created successfully", advertisement.id);
  return advertisement;
}

export async function updateAdvertisement(userId, adId, adData, baseUrl = "") {
  logger.info("Updating advertisement %s", adId);

  await ensureAdminAuth();

  const ad = await pbAdmin.collection("advertisements").getOne(adId, {
    expand: "website",
  });

  if (!ad || ad.expand?.website?.user !== userId) {
    throw new Error("Advertisement not found or unauthorized");
  }

  const svgContent = generateBannerSvg({
    size: getBannerSize(adData.size || ad.bannerSize),
    title: adData.title || ad.title,
    subtitle: adData.subtitle !== undefined ? adData.subtitle : ad.bannerConfig?.subtitle || "",
    ctaText: adData.ctaText || ad.ctaText,
    colorScheme: adData.colorScheme || ad.bannerConfig?.colorScheme || "brand",
    logoText: adData.logoText || ad.bannerConfig?.logoText || "",
    logoUrl: adData.logoUrl !== undefined ? adData.logoUrl : ad.bannerConfig?.logoUrl || null,
    imageUrl: adData.imageUrl !== undefined ? adData.imageUrl : ad.bannerConfig?.imageUrl || null,
    badgeText: adData.badgeText !== undefined ? adData.badgeText : ad.bannerConfig?.badgeText || "",
    isAnimated: adData.isAnimated !== undefined ? adData.isAnimated : ad.bannerConfig?.isAnimated !== undefined ? ad.bannerConfig.isAnimated : true,
    customColors: adData.customColors || ad.bannerConfig?.customColors,
    id: adId,
    baseUrl,
  });

  const updated = await pbAdmin.collection("advertisements").update(adId, {
    title: sanitize(adData.title || ad.title, 100),
    description: sanitize(adData.name || ad.description, 1000),
    bannerSize: getBannerSize(adData.size || ad.bannerSize),
    bannerType: getBannerType(adData.bannerType || ad.bannerType),
    ctaText: sanitize(adData.ctaText || ad.ctaText, 30),
    targetUrl: sanitizeUrl(adData.targetUrl || ad.targetUrl),
    bannerConfig: {
      colorScheme: adData.colorScheme || ad.bannerConfig?.colorScheme || "brand",
      customColors: adData.customColors || ad.bannerConfig?.customColors || null,
      logoText: sanitize(adData.logoText || ad.bannerConfig?.logoText || "", 20),
      logoUrl: adData.logoUrl !== undefined ? adData.logoUrl : ad.bannerConfig?.logoUrl || null,
      subtitle: sanitize(adData.subtitle !== undefined ? adData.subtitle : ad.bannerConfig?.subtitle || "", 150),
      imageUrl: adData.imageUrl !== undefined ? adData.imageUrl : ad.bannerConfig?.imageUrl || null,
      badgeText: adData.badgeText !== undefined ? adData.badgeText : ad.bannerConfig?.badgeText || "",
      isAnimated: adData.isAnimated !== undefined ? adData.isAnimated : ad.bannerConfig?.isAnimated !== undefined ? ad.bannerConfig.isAnimated : true,
      svgContent: svgContent,
    },
    isActive: adData.isActive !== undefined ? adData.isActive : ad.isActive,
  });

  logger.info("Advertisement %s updated successfully", adId);
  return updated;
}

export async function deleteAdvertisement(userId, adId) {
  logger.info("Deleting advertisement %s", adId);

  await ensureAdminAuth();

  const ad = await pbAdmin.collection("advertisements").getOne(adId, {
    expand: "website",
  });

  if (!ad || ad.expand?.website?.user !== userId) {
    throw new Error("Advertisement not found or unauthorized");
  }

  await pbAdmin
    .collection("ad_clicks")
    .getFullList({
      filter: `advertisement="${adId}"`,
    })
    .then(async (clicks) => {
      for (const click of clicks) {
        await pbAdmin.collection("ad_clicks").delete(click.id);
      }
    });

  await pbAdmin.collection("advertisements").delete(adId);
  logger.info("Advertisement %s deleted successfully", adId);
}

export async function getAdvertisementsByWebsite(websiteId) {
  logger.debug("Fetching advertisements for website %s", websiteId);

  await ensureAdminAuth();

  const ads = await pbAdmin.collection("advertisements").getFullList({
    filter: `website="${websiteId}"`,
    sort: "-created",
  });

  return ads;
}

export async function getAdvertisementMetrics(adId, period = 30) {
  logger.debug("Fetching metrics for advertisement %s, period %d days", adId, period);

  await ensureAdminAuth();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  const startDateStr = startDate.toISOString();

  const clicks = await pbAdmin.collection("ad_clicks").getFullList({
    filter: `advertisement="${adId}" && created >= "${startDateStr}"`,
    sort: "-created",
  });

  const ad = await pbAdmin.collection("advertisements").getOne(adId);

  const clicksByDay = {};
  const clicksByCountry = {};
  const clicksByDevice = {};
  const clicksByBrowser = {};

  for (const click of clicks) {
    const day = click.created.split("T")[0];
    clicksByDay[day] = (clicksByDay[day] || 0) + 1;

    const country = click.country || "Unknown";
    clicksByCountry[country] = (clicksByCountry[country] || 0) + 1;

    const device = click.device || "Unknown";
    clicksByDevice[device] = (clicksByDevice[device] || 0) + 1;

    const browser = click.browser || "Unknown";
    clicksByBrowser[browser] = (clicksByBrowser[browser] || 0) + 1;
  }

  const totalClicks = ad.clickCount || 0;
  const totalImpressions = ad.impressionCount || 0;
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0;

  return {
    totalClicks,
    totalImpressions,
    ctr,
    periodClicks: clicks.length,
    clicksByDay,
    clicksByCountry,
    clicksByDevice,
    clicksByBrowser,
    lastClick: ad.updated,
    lastImpression: ad.updated,
  };
}

export async function recordAdClick(adId, sessionData) {
  logger.debug("Recording click for advertisement %s", adId);

  await ensureAdminAuth();

  try {
    const ad = await pbAdmin.collection("advertisements").getOne(adId);

    if (!ad || !ad.isActive) {
      logger.warn("Advertisement %s not found or inactive", adId);
      return null;
    }

    await pbAdmin.collection("ad_clicks").create({
      advertisement: adId,
      referrer: sessionData.referrer || "",
      source: sessionData.source || "direct",
      userAgent: sessionData.userAgent || "",
      country: sessionData.country || "Unknown",
      device: sessionData.device || "Unknown",
      browser: sessionData.browser || "Unknown",
    });

    await pbAdmin.collection("advertisements").update(adId, {
      "clickCount+": 1,
    });

    logger.info("Click recorded for advertisement %s", adId);
    return ad.targetUrl;
  } catch (error) {
    logger.error("Failed to record ad click: %o", error);
    return null;
  }
}

export async function recordAdImpression(adId) {
  logger.debug("Recording impression for advertisement %s", adId);

  await ensureAdminAuth();

  try {
    await pbAdmin.collection("advertisements").update(adId, {
      "impressionCount+": 1,
    });
  } catch (error) {
    logger.error("Failed to record ad impression: %o", error);
  }
}

export async function generateAdFromSeoData(userId, websiteId, options = {}, baseUrl = "") {
  logger.info("Generating ad from SEO data for website %s", websiteId);

  await ensureAdminAuth();

  const website = await pbAdmin.collection("websites").getFirstListItem(`id="${websiteId}" && user.id="${userId}"`);

  if (!website) {
    throw new Error("Website not found or unauthorized");
  }

  let seoData = null;
  try {
    seoData = await pbAdmin.collection("seo_data").getFirstListItem(`website="${websiteId}"`);
  } catch (e) {
    logger.debug("No SEO data found for website %s", websiteId);
  }

  let title = website.name;
  let subtitle = "";
  let ctaText = "Visit Now";
  let imageUrl = null;

  if (seoData) {
    const metaTags = seoData.metaTags || {};
    const social = seoData.socialMetaTags || {};
    const headings = seoData.headings || {};

    imageUrl = social.openGraph?.image || social.twitter?.image || seoData.favicon || null;

    if (metaTags.title) {
      title = metaTags.title.length > 60 ? metaTags.title.slice(0, 57) + "..." : metaTags.title;
    } else if (social.openGraph?.title) {
      title = social.openGraph.title.length > 60 ? social.openGraph.title.slice(0, 57) + "..." : social.openGraph.title;
    }

    if (metaTags.description) {
      subtitle = metaTags.description.length > 120 ? metaTags.description.slice(0, 117) + "..." : metaTags.description;
    } else if (social.openGraph?.description) {
      subtitle = social.openGraph.description.length > 120 ? social.openGraph.description.slice(0, 117) + "..." : social.openGraph.description;
    }

    if (subtitle.length < 40 && headings.h2 && headings.h2.length > 0) {
      const extra = headings.h2[0];
      subtitle = subtitle ? `${subtitle} • ${extra}` : extra;
      if (subtitle.length > 150) subtitle = subtitle.slice(0, 147) + "...";
    }

    if (!subtitle && headings.h1 && headings.h1.length > 0) {
      subtitle = headings.h1[0].length > 120 ? headings.h1[0].slice(0, 117) + "..." : headings.h1[0];
    }
  }

  return createAdvertisement(
    userId,
    websiteId,
    {
      name: options.name || `Auto-Generated Ad - ${new Date().toISOString().split("T")[0]}`,
      size: getBannerSize(options.size || "300x250"),
      bannerType: getBannerType(options.bannerType || "minimal"),
      title: options.title || title,
      subtitle: options.subtitle || subtitle,
      ctaText: options.ctaText || ctaText,
      targetUrl: options.targetUrl || (website.domain ? website.domain : process.env.APP_URL || ""),
      colorScheme: options.colorScheme || "brand",
      logoText: options.logoText || website.name.charAt(0).toUpperCase(),
      logoUrl: seoData?.favicon || null,
      imageUrl: options.imageUrl || imageUrl,
      customColors: options.customColors || null,
    },
    baseUrl,
  );
}

export function getBannerSizes() {
  return BANNER_SIZES;
}

export function getColorSchemes() {
  return COLOR_SCHEMES;
}
