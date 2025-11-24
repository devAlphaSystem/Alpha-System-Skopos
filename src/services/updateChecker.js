import { fetch } from "undici";
import logger from "../utils/logger.js";

let dashboardUpdateCache = {
  hasUpdate: false,
  latestCommitSha: null,
  latestCommitDate: null,
  latestVersion: null,
  currentVersion: null,
  lastChecked: null,
  cacheExpiry: 3600000,
};

let sdkUpdateCache = {
  latestVersion: null,
  latestCommitSha: null,
  latestCommitDate: null,
  lastChecked: null,
  cacheExpiry: 3600000,
};

function isNewerVersion(current, latest) {
  if (!current || !latest) return false;

  const currentParts = current.replace(/^v/, "").split(".").map(Number);
  const latestParts = latest.replace(/^v/, "").split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const curr = currentParts[i] || 0;
    const lat = latestParts[i] || 0;

    if (lat > curr) return true;
    if (lat < curr) return false;
  }

  return false;
}

async function fetchLatestCommit(repo, userAgent = "Skopos-Update-Checker") {
  try {
    const response = await fetch(`https://api.github.com/repos/devAlphaSystem/${repo}/commits/main`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": userAgent,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.debug(`GitHub API returned status ${response.status} for ${repo}`);
      return null;
    }

    const commit = await response.json();

    const packageResponse = await fetch(`https://raw.githubusercontent.com/devAlphaSystem/${repo}/${commit.sha}/package.json`, {
      signal: AbortSignal.timeout(5000),
    });

    if (packageResponse.ok) {
      const packageData = await packageResponse.json();
      return {
        sha: commit.sha,
        date: commit.commit.committer.date,
        version: packageData.version,
        message: commit.commit.message,
      };
    }

    return {
      sha: commit.sha,
      date: commit.commit.committer.date,
      version: null,
      message: commit.commit.message,
    };
  } catch (error) {
    logger.debug(`Error fetching latest commit for ${repo}:`, error.message);
    return null;
  }
}

export async function checkForUpdates(currentVersion) {
  const now = Date.now();
  if (dashboardUpdateCache.lastChecked && now - dashboardUpdateCache.lastChecked < dashboardUpdateCache.cacheExpiry && dashboardUpdateCache.currentVersion === currentVersion) {
    logger.debug("Using cached dashboard update status");
    return {
      hasUpdate: dashboardUpdateCache.hasUpdate,
      latestVersion: dashboardUpdateCache.latestCommitSha ? dashboardUpdateCache.latestVersion : currentVersion,
      currentVersion: dashboardUpdateCache.currentVersion,
    };
  }

  try {
    logger.debug("Checking for dashboard updates from GitHub");

    const latestCommit = await fetchLatestCommit("Alpha-System-Skopos");

    if (!latestCommit || !latestCommit.version) {
      logger.debug("No version information available from GitHub");

      dashboardUpdateCache = {
        hasUpdate: false,
        latestCommitSha: latestCommit?.sha || null,
        latestCommitDate: latestCommit?.date || null,
        latestVersion: currentVersion,
        currentVersion,
        lastChecked: now,
        cacheExpiry: dashboardUpdateCache.cacheExpiry,
      };

      return {
        hasUpdate: false,
        latestVersion: currentVersion,
        currentVersion,
      };
    }

    const hasUpdate = isNewerVersion(currentVersion, latestCommit.version);

    dashboardUpdateCache = {
      hasUpdate,
      latestCommitSha: latestCommit.sha,
      latestCommitDate: latestCommit.date,
      latestVersion: latestCommit.version,
      currentVersion,
      lastChecked: now,
      cacheExpiry: dashboardUpdateCache.cacheExpiry,
    };

    logger.info(`Dashboard update check: Current=${currentVersion}, Latest=${latestCommit.version}, HasUpdate=${hasUpdate}`);

    return {
      hasUpdate,
      latestVersion: latestCommit.version,
      currentVersion,
    };
  } catch (error) {
    logger.debug("Error checking for dashboard updates:", error.message);

    dashboardUpdateCache = {
      hasUpdate: false,
      latestCommitSha: null,
      latestCommitDate: null,
      latestVersion: currentVersion,
      currentVersion,
      lastChecked: now,
      cacheExpiry: dashboardUpdateCache.cacheExpiry,
    };

    return {
      hasUpdate: false,
      latestVersion: currentVersion,
      currentVersion,
    };
  }
}

export async function getLatestSdkVersion() {
  const now = Date.now();

  if (sdkUpdateCache.lastChecked && now - sdkUpdateCache.lastChecked < sdkUpdateCache.cacheExpiry) {
    logger.debug("Using cached SDK version");
    return sdkUpdateCache.latestVersion;
  }

  try {
    logger.debug("Fetching latest SDK version from GitHub");
    const latestCommit = await fetchLatestCommit("Alpha-System-Skopos-SDK", "Skopos-SDK-Update-Checker");

    if (!latestCommit || !latestCommit.version) {
      logger.debug("No SDK version information available from GitHub");

      sdkUpdateCache = {
        ...sdkUpdateCache,
        latestCommitSha: latestCommit?.sha || null,
        latestCommitDate: latestCommit?.date || null,
        lastChecked: now,
      };

      return sdkUpdateCache.latestVersion ?? null;
    }

    sdkUpdateCache = {
      latestVersion: latestCommit.version,
      latestCommitSha: latestCommit.sha,
      latestCommitDate: latestCommit.date,
      lastChecked: now,
      cacheExpiry: sdkUpdateCache.cacheExpiry,
    };

    logger.debug(`Latest SDK version from GitHub: ${latestCommit.version}`);
    return latestCommit.version;
  } catch (error) {
    logger.debug("Error getting latest SDK version:", error.message);

    sdkUpdateCache = {
      ...sdkUpdateCache,
      latestCommitSha: null,
      latestCommitDate: null,
      lastChecked: now,
    };

    return sdkUpdateCache.latestVersion ?? null;
  }
}

export async function checkSdkUpdate(currentSdkVersion) {
  if (!currentSdkVersion) {
    return false;
  }

  const latestVersion = await getLatestSdkVersion();
  if (!latestVersion) {
    return false;
  }

  return isNewerVersion(currentSdkVersion, latestVersion);
}

export function clearUpdateCache() {
  dashboardUpdateCache = {
    hasUpdate: false,
    latestVersion: null,
    currentVersion: null,
    lastChecked: null,
    cacheExpiry: 3600000,
  };
  logger.debug("Dashboard update cache cleared");
}

export function clearSdkUpdateCache() {
  sdkUpdateCache = {
    latestVersion: null,
    latestCommitSha: null,
    latestCommitDate: null,
    lastChecked: null,
    cacheExpiry: 3600000,
  };
  logger.debug("SDK update cache cleared");
}

export default {
  checkForUpdates,
  getLatestSdkVersion,
  checkSdkUpdate,
  clearUpdateCache,
  clearSdkUpdateCache,
};
