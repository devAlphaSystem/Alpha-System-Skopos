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
    secondary: "#b91c1c",
    background: "#ffffff",
    text: "#0f172a",
    accent: "#fef2f2",
    cta: "#ffffff",
    border: "rgba(239, 68, 68, 0.1)",
  },
  dark: {
    primary: "#ef4444",
    secondary: "#dc2626",
    background: "#0f172a",
    text: "#f8fafc",
    accent: "#1e293b",
    cta: "#ffffff",
    border: "rgba(255, 255, 255, 0.1)",
  },
  ocean: {
    primary: "#0ea5e9",
    secondary: "#0369a1",
    background: "#f0f9ff",
    text: "#0c4a6e",
    accent: "#e0f2fe",
    cta: "#ffffff",
    border: "rgba(14, 165, 233, 0.1)",
  },
  forest: {
    primary: "#10b981",
    secondary: "#047857",
    background: "#f0fdf4",
    text: "#064e3b",
    accent: "#dcfce7",
    cta: "#ffffff",
    border: "rgba(16, 185, 129, 0.1)",
  },
  sunset: {
    primary: "#f59e0b",
    secondary: "#d97706",
    background: "#fffbeb",
    text: "#78350f",
    accent: "#fef3c7",
    cta: "#ffffff",
    border: "rgba(245, 158, 11, 0.1)",
  },
  purple: {
    primary: "#8b5cf6",
    secondary: "#6d28d9",
    background: "#faf5ff",
    text: "#4c1d95",
    accent: "#f3e8ff",
    cta: "#ffffff",
    border: "rgba(139, 92, 246, 0.1)",
  },
  glass: {
    primary: "#ffffff",
    secondary: "#e2e8f0",
    background: "rgba(255, 255, 255, 0.1)",
    text: "#ffffff",
    accent: "rgba(255, 255, 255, 0.05)",
    cta: "#111827",
    isGlass: true,
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

function unescapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
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

  const rawTitle = unescapeHtml(sanitize(title, 100));
  const rawSubtitle = unescapeHtml(sanitize(subtitle, 150));
  const rawCta = unescapeHtml(sanitize(ctaText, 30));
  const rawLogo = unescapeHtml(sanitize(logoText, 20));
  const rawBadge = unescapeHtml(sanitize(badgeText, 15));

  const isWide = width / height > 3;
  const isTall = height / width > 2;
  const isSmall = height < 80 || (width < 350 && height < 150);

  const gradIds = {
    bg: `bgGradient_${id}`,
    btn: `btnGradient_${id}`,
    shadow: `shadow_${id}`,
    imgClip: `imgClip_${id}`,
    glow: `glow_${id}`,
  };

  const animations = isAnimated ? generateAnimations(id, colors) : "";

  let layout;
  if (isSmall) {
    layout = generateCompactLayout(width, height, rawTitle, rawSubtitle, rawCta, rawLogo, proxiedLogoUrl, proxiedImageUrl, colors, gradIds);
  } else if (isWide) {
    layout = generateWideLayout(width, height, rawTitle, rawSubtitle, rawCta, rawLogo, proxiedLogoUrl, proxiedImageUrl, colors, gradIds);
  } else if (isTall) {
    layout = generateTallLayout(width, height, rawTitle, rawSubtitle, rawCta, rawLogo, proxiedLogoUrl, proxiedImageUrl, colors, gradIds);
  } else {
    layout = generateStandardLayout(width, height, rawTitle, rawSubtitle, rawCta, rawLogo, proxiedLogoUrl, proxiedImageUrl, colors, gradIds);
  }

  const badge = rawBadge ? generateBadge(width, height, escapeHtml(rawBadge), colors) : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap');
    ${animations}
    .text-title { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
    .text-body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
  </style>
  <defs>
    <linearGradient id="${gradIds.bg}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.background};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors.accent};stop-opacity:1" />
    </linearGradient>
    <linearGradient id="${gradIds.btn}" x1="0%" y1="10%" x2="100%" y2="90%">
      <stop offset="0%" style="stop-color:${colors.primary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors.secondary};stop-opacity:1" />
    </linearGradient>
    <filter id="${gradIds.shadow}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.12"/>
      <feDropShadow dx="0" dy="2" stdDeviation="1" flood-color="#000" flood-opacity="0.08"/>
    </filter>
    <filter id="${gradIds.glow}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <pattern id="noise_${id}" width="100" height="100" patternUnits="userSpaceOnUse">
      <filter id="noiseFilter_${id}">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.03"/>
        </feComponentTransfer>
      </filter>
      <rect width="100" height="100" filter="url(#noiseFilter_${id})"/>
    </pattern>
    <pattern id="dots_${id}" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
       <circle cx="2" cy="2" r="1.5" fill="${colors.primary}" fill-opacity="${colors.isGlass ? 0.1 : 0.03}" />
    </pattern>
    <linearGradient id="btnSheen_${id}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:${colors.isGlass ? 0.4 : 0.25}" />
      <stop offset="50%" style="stop-color:#ffffff;stop-opacity:0" />
      <stop offset="100%" style="stop-color:#000000;stop-opacity:0.05" />
    </linearGradient>
    ${
      colors.isGlass
        ? `
    <filter id="blur_${id}">
      <feGaussianBlur in="SourceGraphic" stdDeviation="15" />
    </filter>`
        : ""
    }
  </defs>
  <rect width="${width}" height="${height}" fill="${colors.isGlass ? colors.background : `url(#${gradIds.bg})`}" rx="12"/>
  ${colors.isGlass ? `<rect width="${width}" height="${height}" fill="none" rx="12" stroke="white" stroke-opacity="0.3" stroke-width="1.5" />` : ""}
  <rect width="${width}" height="${height}" fill="url(#dots_${id})" rx="12"/>
  <rect width="${width}" height="${height}" fill="url(#noise_${id})" rx="12"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${colors.primary}" stroke-opacity="0.08" stroke-width="1" rx="11.5"/>
  ${layout}
  ${badge}
</svg>`;
}

function generateAnimations(id, colors) {
  return `
    @keyframes breathe-${id} {
      0% { transform: scale(1); opacity: 0.95; }
      50% { transform: scale(1.03); opacity: 1; }
      100% { transform: scale(1); opacity: 0.95; }
    }
    .cta-anim-${id} {
      animation: breathe-${id} 3s infinite ease-in-out;
      transform-origin: center;
    }
    @keyframes float-${id} {
      0% { transform: translateY(0px); }
      50% { transform: translateY(-4px); }
      100% { transform: translateY(0px); }
    }
    .float-${id} {
      animation: float-${id} 4s infinite ease-in-out;
    }
  `;
}

function generateBadge(width, height, text, colors) {
  const badgeWidth = 80;
  const badgeHeight = 24;
  return `
    <g transform="translate(${width - badgeWidth - 8}, 8)">
      <rect width="${badgeWidth}" height="${badgeHeight}" rx="12" fill="${colors.primary}" fill-opacity="0.9"/>
      <text x="${badgeWidth / 2}" y="${badgeHeight / 2 + 4}" font-family="Inter, sans-serif" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle" style="letter-spacing: 0.05em">
        ${escapeHtml(text.toUpperCase())}
      </text>
    </g>
  `;
}

function generateWideLayout(width, height, title, subtitle, cta, logo, logoUrl, imageUrl, colors, gradIds) {
  const padding = 24;
  const imageWidth = imageUrl ? Math.min(width * 0.35, height * 1.5) : 0;
  const logoSize = Math.min(height - padding * 2, 44);

  let textX = padding;
  if (imageUrl) {
    textX = imageWidth + 24;
  } else if (logo || logoUrl) {
    textX = padding + logoSize + 16;
  }

  const ctaWidth = Math.max(120, cta.length * 8 + 48);
  const textWidth = width - textX - ctaWidth - padding - 40;

  let titleSize = height > 60 ? 20 : 16;
  let titleLines = wrapText(title, textWidth, titleSize, 1);
  if (titleLines[0].includes("...") && titleSize > 14) {
    titleSize -= 3;
    titleLines = wrapText(title, textWidth, titleSize, 1);
  }

  const subtitleSize = 13;
  const subtitleLines = subtitle ? wrapText(subtitle, textWidth, subtitleSize, 1) : [];

  return `
    ${
      imageUrl
        ? `
      <defs>
        <clipPath id="wideClip_${gradIds.imgClip}">
          <rect x="0" y="0" width="${imageWidth}" height="${height}" rx="12 0 0 12"/>
        </clipPath>
      </defs>
      <image href="${imageUrl}" x="0" y="0" width="${imageWidth}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#wideClip_${gradIds.imgClip})" filter="url(#${gradIds.shadow})"/>
    `
        : logoUrl
          ? `
      <rect x="${padding}" y="${(height - logoSize) / 2}" width="${logoSize}" height="${logoSize}" rx="12" fill="${colors.primary}" fill-opacity="0.1"/>
      <image href="${logoUrl}" x="${padding + 8}" y="${(height - logoSize) / 2 + 8}" width="${logoSize - 16}" height="${logoSize - 16}" preserveAspectRatio="xMidYMid meet" class="float-${gradIds.bg.split("_")[1]}"/>
    `
          : logo
            ? `
      <rect x="${padding}" y="${(height - logoSize) / 2}" width="${logoSize}" height="${logoSize}" rx="12" fill="${colors.primary}" fill-opacity="0.1"/>
      <text x="${padding + logoSize / 2}" y="${height / 2 + 6}" class="text-title" font-size="${logoSize * 0.45}" font-weight="900" fill="${colors.primary}" text-anchor="middle">${escapeHtml(logo.charAt(0).toUpperCase())}</text>
    `
            : ""
    }
    
    <text x="${textX}" y="${subtitleLines.length > 0 ? height / 2 - 2 : height / 2 + 7}" class="text-title" font-size="${titleSize}" font-weight="800" fill="${colors.text}" style="letter-spacing: -0.025em">
      ${escapeHtml(titleLines[0] || "")}
    </text>
    ${
      subtitleLines.length > 0
        ? `
      <text x="${textX}" y="${height / 2 + subtitleSize + 6}" class="text-body" font-size="${subtitleSize}" font-weight="500" fill="${colors.text}" fill-opacity="0.55">
        ${escapeHtml(subtitleLines[0])}
      </text>
    `
        : ""
    }
    <g transform="translate(${width - ctaWidth - padding}, ${(height - 40) / 2})">
      <g class="cta-anim-${gradIds.bg.split("_")[1]}">
        <rect width="${ctaWidth}" height="40" rx="20" fill="url(#${gradIds.btn})" filter="url(#${gradIds.shadow})"/>
        <rect width="${ctaWidth}" height="40" rx="20" fill="url(#btnSheen_${gradIds.bg.split("_")[1]})"/>
        <text x="${ctaWidth / 2}" y="25" class="text-body" font-size="14" font-weight="800" fill="${colors.cta}" text-anchor="middle">${escapeHtml(cta)}</text>
      </g>
    </g>
    <text x="${width - padding}" y="${height - 8}" class="text-body" font-size="8" font-weight="900" fill="${colors.text}" fill-opacity="0.15" text-anchor="end">SPONSORED</text>
  `;
}

function generateTallLayout(width, height, title, subtitle, cta, logo, logoUrl, imageUrl, colors, gradIds) {
  const padding = 24;
  const imageHeight = imageUrl ? width * 0.9 : 0;
  const logoSize = width > 200 ? 72 : 56;

  const textWidth = width - padding * 2;

  let titleSize = width > 200 ? 32 : 24;
  let titleLines = wrapText(title, textWidth, titleSize, 5);
  if (titleLines.length >= 5 && titleLines[4].includes("...") && titleSize > 20) {
    titleSize -= 6;
    titleLines = wrapText(title, textWidth, titleSize, 6);
  }

  const subtitleSize = width > 200 ? 18 : 15;
  const subtitleLines = subtitle ? wrapText(subtitle, textWidth, subtitleSize, 10) : [];

  const contentStartY = imageUrl ? imageHeight + 36 : logo || logoUrl ? padding + logoSize + 40 : padding + 50;
  const ctaWidth = width - padding * 2;
  const ctaHeight = 50;

  return `
    ${
      imageUrl
        ? `
      <defs>
        <clipPath id="tallClip_${gradIds.imgClip}">
          <rect x="0" y="0" width="${width}" height="${imageHeight}" rx="12 12 0 0"/>
        </clipPath>
      </defs>
      <image href="${imageUrl}" x="0" y="0" width="${width}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#tallClip_${gradIds.imgClip})" filter="url(#${gradIds.shadow})"/>
    `
        : logoUrl
          ? `
      <rect x="${(width - logoSize) / 2}" y="${padding + 16}" width="${logoSize}" height="${logoSize}" rx="18" fill="${colors.primary}" fill-opacity="0.1"/>
      <image href="${logoUrl}" x="${(width - logoSize) / 2 + 12}" y="${padding + 28}" width="${logoSize - 24}" height="${logoSize - 24}" preserveAspectRatio="xMidYMid meet" class="float-${gradIds.bg.split("_")[1]}"/>
    `
          : logo
            ? `
      <rect x="${(width - logoSize) / 2}" y="${padding + 16}" width="${logoSize}" height="${logoSize}" rx="18" fill="${colors.primary}" fill-opacity="0.1"/>
      <text x="${width / 2}" y="${padding + 16 + logoSize / 2 + 10}" class="text-title" font-size="${logoSize * 0.4}" font-weight="900" fill="${colors.primary}" text-anchor="middle">${escapeHtml(logo.charAt(0).toUpperCase())}</text>
    `
            : ""
    }
    
    <text x="${width / 2}" y="${contentStartY}" class="text-title" font-size="${titleSize}" font-weight="800" fill="${colors.text}" text-anchor="middle" style="letter-spacing: -0.02em">
      ${titleLines.map((line, i) => `<tspan x="${width / 2}" dy="${i === 0 ? 0 : titleSize * 1.1}">${escapeHtml(line)}</tspan>`).join("")}
    </text>
    ${
      subtitleLines.length > 0
        ? `
      <text x="${width / 2}" y="${contentStartY + titleLines.length * titleSize * 1.1 + 12}" class="text-body" font-size="${subtitleSize}" font-weight="400" fill="${colors.text}" fill-opacity="0.6" text-anchor="middle">
        ${subtitleLines.map((line, i) => `<tspan x="${width / 2}" dy="${i === 0 ? 0 : subtitleSize * 1.35}">${escapeHtml(line)}</tspan>`).join("")}
      </text>
    `
        : ""
    }
    <g transform="translate(${padding}, ${height - padding - ctaHeight})">
      <g class="cta-anim-${gradIds.bg.split("_")[1]}">
        <rect width="${ctaWidth}" height="${ctaHeight}" rx="24" fill="url(#${gradIds.btn})" filter="url(#${gradIds.shadow})"/>
        <rect width="${ctaWidth}" height="${ctaHeight}" rx="24" fill="url(#btnSheen_${gradIds.bg.split("_")[1]})"/>
        <text x="${ctaWidth / 2}" y="${ctaHeight / 2 + 6}" class="text-body" font-size="16" font-weight="800" fill="${colors.cta}" text-anchor="middle">
          ${escapeHtml(cta)}
        </text>
      </g>
    </g>
    <text x="${width - padding}" y="${height - 10}" class="text-body" font-size="8" font-weight="900" fill="${colors.text}" fill-opacity="0.15" text-anchor="end">SPONSORED</text>
  `;
}

function generateCompactLayout(width, height, title, subtitle, cta, logo, logoUrl, imageUrl, colors, gradIds) {
  const isMini = height <= 60;
  const padding = isMini ? 8 : 12;
  const imageSize = isMini ? height - 12 : height - 20;

  const ctaHeight = isMini ? 24 : 28;
  const ctaWidth = Math.max(isMini ? 60 : 80, cta.length * (isMini ? 5.5 : 6.5) + (isMini ? 16 : 24));

  const iconX = padding;
  const textX = imageUrl || logo || logoUrl ? iconX + imageSize + (isMini ? 8 : 12) : padding;
  const textWidth = width - textX - ctaWidth - padding - 4;

  const titleSize = isMini ? 13 : 15;
  const titleLines = wrapText(title, textWidth, titleSize, 1);

  const subtitleSize = isMini ? 10 : 12;
  const subtitleLines = subtitle ? wrapText(subtitle, textWidth, subtitleSize, 1) : [];

  return `
    ${
      imageUrl
        ? `
      <defs>
        <clipPath id="compClip_${gradIds.imgClip}">
          <rect x="${iconX}" y="${(height - imageSize) / 2}" width="${imageSize}" height="${imageSize}" rx="6"/>
        </clipPath>
      </defs>
      <image href="${imageUrl}" x="${iconX}" y="${(height - imageSize) / 2}" width="${imageSize}" height="${imageSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#compClip_${gradIds.imgClip})" filter="url(#${gradIds.shadow})"/>
    `
        : logoUrl
          ? `
      <rect x="${iconX}" y="${(height - imageSize) / 2}" width="${imageSize}" height="${imageSize}" rx="8" fill="${colors.primary}" fill-opacity="0.1"/>
      <image href="${logoUrl}" x="${iconX + (isMini ? 3 : 4)}" y="${(height - imageSize) / 2 + (isMini ? 3 : 4)}" width="${imageSize - (isMini ? 6 : 8)}" height="${imageSize - (isMini ? 6 : 8)}" preserveAspectRatio="xMidYMid meet" class="float-${gradIds.bg.split("_")[1]}"/>
    `
          : logo
            ? `
      <rect x="${iconX}" y="${(height - imageSize) / 2}" width="${imageSize}" height="${imageSize}" rx="8" fill="${colors.primary}" fill-opacity="0.1"/>
      <text x="${iconX + imageSize / 2}" y="${height / 2 + (isMini ? 4 : 5)}" class="text-title" font-size="${isMini ? 11 : 13}" font-weight="900" fill="${colors.primary}" text-anchor="middle">${escapeHtml(logo.charAt(0).toUpperCase())}</text>
    `
            : ""
    }
    
    <text x="${textX}" y="${subtitleLines.length > 0 ? height / 2 - (isMini ? 1 : 2) : height / 2 + (isMini ? 4 : 5)}" class="text-title" font-size="${titleSize}" font-weight="700" fill="${colors.text}">
      ${escapeHtml(titleLines[0] || "")}
    </text>
    ${
      subtitleLines.length > 0
        ? `
      <text x="${textX}" y="${height / 2 + (isMini ? 10 : 13)}" class="text-body" font-size="${subtitleSize}" font-weight="500" fill="${colors.text}" fill-opacity="0.5">
        ${escapeHtml(subtitleLines[0])}
      </text>
    `
        : ""
    }
    
    <g transform="translate(${width - ctaWidth - padding}, ${(height - ctaHeight) / 2})">
      <g class="cta-anim-${gradIds.bg.split("_")[1]}">
        <rect width="${ctaWidth}" height="${ctaHeight}" rx="${ctaHeight / 2}" fill="url(#${gradIds.btn})" filter="url(#${gradIds.shadow})"/>
        <rect width="${ctaWidth}" height="${ctaHeight}" rx="${ctaHeight / 2}" fill="url(#btnSheen_${gradIds.bg.split("_")[1]})"/>
        <text x="${ctaWidth / 2}" y="${ctaHeight / 2 + (isMini ? 4 : 5)}" class="text-body" font-size="${isMini ? 10 : 11}" font-weight="800" fill="${colors.cta}" text-anchor="middle">${escapeHtml(cta)}</text>
      </g>
    </g>
  `;
}

function generateStandardLayout(width, height, title, subtitle, cta, logo, logoUrl, imageUrl, colors, gradIds) {
  const padding = 24;
  const imageHeight = imageUrl ? height * 0.4 : 0;
  const logoSize = height < 300 ? 50 : 64;

  const textWidth = width - padding * 2;
  const ctaHeight = height < 300 ? 44 : 50;
  const ctaWidth = Math.max(140, cta.length * 9 + 40);

  const contentStartY = imageUrl ? imageHeight + 30 : logo || logoUrl ? padding + logoSize + 35 : padding + 40;
  const footerY = height - padding - ctaHeight - 15;
  const availHeight = footerY - contentStartY;

  let titleSize = height < 300 ? 22 : 28;
  let titleLines = wrapText(title, textWidth, titleSize, 2);

  if (availHeight < 60 && titleSize > 18) {
    titleSize = 18;
    titleLines = wrapText(title, textWidth, titleSize, 2);
  }

  const subtitleSize = height < 300 ? 14 : 16;
  const showSubtitle = !imageUrl;
  const subtitleLines = subtitle && showSubtitle ? wrapText(subtitle, textWidth, subtitleSize, Math.floor((availHeight - titleLines.length * titleSize * 1.1) / (subtitleSize * 1.4))) : [];

  return `
    ${
      imageUrl
        ? `
      <defs>
        <clipPath id="stdClip_${gradIds.imgClip}">
          <rect x="0" y="0" width="${width}" height="${imageHeight}" rx="12 12 0 0"/>
        </clipPath>
      </defs>
      <image href="${imageUrl}" x="0" y="0" width="${width}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#stdClip_${gradIds.imgClip})" filter="url(#${gradIds.shadow})"/>
    `
        : logoUrl
          ? `
      <rect x="${padding}" y="${padding}" width="${logoSize}" height="${logoSize}" rx="14" fill="${colors.primary}" fill-opacity="0.1"/>
      <image href="${logoUrl}" x="${padding + 8}" y="${padding + 8}" width="${logoSize - 16}" height="${logoSize - 16}" preserveAspectRatio="xMidYMid meet" class="float-${gradIds.bg.split("_")[1]}"/>
    `
          : logo
            ? `
      <rect x="${padding}" y="${padding}" width="${logoSize}" height="${logoSize}" rx="14" fill="${colors.primary}" fill-opacity="0.1"/>
      <text x="${padding + logoSize / 2}" y="${padding + logoSize / 2 + 8}" class="text-title" font-size="${logoSize * 0.5}" font-weight="900" fill="${colors.primary}" text-anchor="middle">${escapeHtml(logo.charAt(0).toUpperCase())}</text>
    `
            : ""
    }
    
    <text x="${padding}" y="${contentStartY}" class="text-title" font-size="${titleSize}" font-weight="800" fill="${colors.text}" style="letter-spacing: -0.025em">
      ${titleLines.map((line, i) => `<tspan x="${padding}" dy="${i === 0 ? 0 : titleSize * 1.1}">${escapeHtml(line)}</tspan>`).join("")}
    </text>
    ${
      subtitleLines.length > 0
        ? `
      <text x="${padding}" y="${contentStartY + titleLines.length * titleSize * 1.1 + 10}" class="text-body" font-size="${subtitleSize}" font-weight="400" fill="${colors.text}" fill-opacity="0.55">
        ${subtitleLines.map((line, i) => `<tspan x="${padding}" dy="${i === 0 ? 0 : subtitleSize * 1.4}">${escapeHtml(line)}</tspan>`).join("")}
      </text>
    `
        : ""
    }
    <g transform="translate(${padding}, ${height - padding - ctaHeight})">
      <g class="cta-anim-${gradIds.bg.split("_")[1]}">
        <rect width="${ctaWidth}" height="${ctaHeight}" rx="${ctaHeight / 2}" fill="url(#${gradIds.btn})" filter="url(#${gradIds.shadow})"/>
        <rect width="${ctaWidth}" height="${ctaHeight}" rx="${ctaHeight / 2}" fill="url(#btnSheen_${gradIds.bg.split("_")[1]})"/>
        <text x="${ctaWidth / 2}" y="${ctaHeight / 2 + 5}" class="text-body" font-size="${height < 300 ? 14 : 15}" font-weight="800" fill="${colors.cta}" text-anchor="middle">${escapeHtml(cta)}</text>
      </g>
    </g>
    <text x="${width - padding}" y="${height - 10}" class="text-body" font-size="8" font-weight="900" fill="${colors.text}" fill-opacity="0.2" text-anchor="end">SPONSORED</text>
  `;
}

function truncateText(text, maxWidth, fontSize) {
  const avgCharWidth = fontSize * 0.5;
  const maxChars = Math.floor(maxWidth / avgCharWidth);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 2) + "...";
}

function wrapText(text, maxWidth, fontSize, linesCount = 2) {
  const avgCharWidth = fontSize * 0.55;
  const maxChars = Math.floor(maxWidth / avgCharWidth);
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).length <= maxChars) {
      currentLine = currentLine ? currentLine + " " + word : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (currentLine.length > maxChars) {
        currentLine = currentLine.slice(0, maxChars - 3) + "...";
      }
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.slice(0, linesCount).map((line, idx) => {
    if (idx === linesCount - 1 && lines.length > linesCount) {
      return line.length > maxChars - 3 ? line.slice(0, maxChars - 3) + "..." : line + "...";
    }
    return line;
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
