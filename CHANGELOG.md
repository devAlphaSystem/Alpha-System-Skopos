# 0.19.0

#### Added

- Implemented a new responsive mobile header for improved navigation and user experience on smaller screens.
- Introduced server-side device detection middleware to identify mobile clients, enabling mobile-specific UI.
- Added dedicated CSS styles for the new mobile header and its components, including buttons and a progress bar.
- Integrated a new `mobile-header.ejs` partial across all main application views.
- Added JavaScript logic to manage the mobile sidebar toggle and ensure proper closing behavior when clicking outside.
- Included mobile-specific refresh and website settings buttons with corresponding JavaScript functionality for the dashboard.

#### Changed

- Enhanced dashboard UI: 'View Sessions' button now uses a new `header-button` style, and refresh/settings buttons are optimized for both desktop and mobile layouts.
- Adjusted sidebar behavior on mobile devices; it now slides in from the left, overlays content, and includes a semi-transparent background when open.
- Modified the main container padding on mobile to accommodate the new fixed mobile header.

---

# 0.18.0

#### Added

- A new API controller and dedicated API routes to handle all dashboard data, detailed reports, custom event details, Server-Sent Events (SSE) connections, and public IP retrieval.
- Dedicated authentication controller and routes for user registration, login, and logout.
- Dedicated website management controller and routes for adding, archiving, restoring, deleting websites, and configuring website settings, including IP blacklists.
- Dedicated session management controller and routes for viewing user sessions, session details, and deleting specific sessions or all sessions for a visitor.

#### Changed

- Major architectural refactor: Core functionalities related to API calls, authentication, website management, and session management have been extracted from the main dashboard controller and routes into new, specialized controllers and route files for improved modularity and maintainability.

---

# 0.17.0

#### Added

- Implemented comprehensive Session Management features, providing dedicated pages for viewing all visitor sessions grouped by visitor and detailed views for individual sessions.
- Introduced new controllers and API routes to handle session listing, detailed session information, and deletion of sessions or entire visitor histories.
- Added new styling for the session and session details pages to support the new user interface elements.
- Integrated a direct link to the Sessions page from the Dashboard for improved accessibility.
- Enabled deletion of individual sessions and all sessions associated with a specific visitor.

---

# 0.16.1

#### Fixed

- Resolved visual overflow issues within map cards and for the world map display.
- Corrected text truncation and wrapping for long tracking IDs and other `truncated-text` elements, preventing content overflow.
- Addressed responsive layout for website card headers, actions, and content on mobile devices, ensuring proper alignment and usability.
- Ensured consistent sizing for nested drawers across various screen sizes.
- Prevented unintended global scrollbars by adjusting body overflow properties.

---

# 0.16.0

#### Added

- Implemented user-specific IP address display and management within the IP Blacklist feature, allowing users to block or unblock their own IP directly from the dashboard.
- Added a new API endpoint /api/user-ip to retrieve the client's current IP address.

#### Fixed

- Corrected horizontal alignment of icons in detail tables for better visual consistency.

---

# 0.15.2

#### Changed

- Refactored dashboard settings and refresh interval handling for improved maintainability.

#### Fixed

- Resolved visual issues in list item display, enhancing readability for long keys and ensuring consistent alignment.

---

# 0.15.1

#### Changed

- Improved the world map's data handling and rendering efficiency, leading to smoother updates when geographical data or themes change.
- Refactored dashboard initialization logic for better performance and stability.

#### Fixed

- Corrected issues where the world map might not re-render properly or could consume extra memory, especially after theme changes or data updates.

---

# 0.15.0

#### Added

- Introduced a comprehensive logging system using Winston with daily rotating file support.
- Added `NODE_ENV` and `LOG_LEVEL` environment variables to `.env.example` for configurable application environment and logging verbosity.
- Included a `logs` directory in `.gitignore` to manage generated log files.
- Added new dependencies `winston` and `winston-daily-rotate-file` to `package.json`.

#### Changed

- Replaced all direct `console.log` and `console.error` calls with the new structured logging system, providing more consistent and detailed output for application events, errors, and user actions.

#### Fixed

- Standardized error page rendering for critical application and API errors, improving user experience by displaying consistent error pages (`500` for server errors, `404` for not found) rather than generic text responses.
- Ensured that calling `doesUserExist()` before app state initialization now throws a more informative error, improving developer experience.

---

# 0.14.0

#### Added

- Introduced new mini-charts displaying daily trends for Page Views, Visitors, Engagement Rate, and Average Session Duration directly within their respective metric cards.
- Added `createMiniChart` and `initializeMetricCharts` functions in `dashboard.js` to support the rendering and updating of the new mini-trend charts.
- Implemented the `getMetricTrends` utility function to efficiently calculate daily metric trends for displaying in the new charts.

#### Changed

- Refactored the dashboard and overview pages to integrate mini-trend charts into metric cards, replacing the single large 'Page Views Over Time' chart.
- Adjusted the layout of the metrics grid on dashboard and overview pages from 5 columns to 4 for better visual organization.
- Improved the precision of date range filtering for previous summaries in analytics data fetching, ensuring more accurate change calculations.
- Refactored `ensureAdminAuth` calls within dashboard controllers, streamlining authentication checks.
- Updated chart theming logic to apply to the new mini-trend charts, ensuring consistent visual experience.
- Adjusted the `onRegionTooltipShow` function signature in `dashboard.js` for consistency.

#### Removed

- Eliminated the dedicated 'Page Views Over Time' chart from both dashboard and overview pages.
- Removed the 'JS Errors' metric card from the dashboard and overview interfaces.
- Deprecated `getChartDataFromSummaries` and `getMultiWebsiteChartData` utility functions, as their functionality is replaced by `getMetricTrends`.
- Removed the `lineChart` variable and associated initialization/update logic in `dashboard.js`.
- Removed the `closeAllDrawers` function from `dashboard.js`.
- Removed the `req` parameter from `handleSseConnection` in `dashboardController.js`.

---

# 0.13.2

#### Added

- Introduced a new dedicated service for managing overall application state, including user existence, for better consistency.
- Implemented `ensureAdminAuth` to handle PocketBase admin authentication, ensuring tokens are valid and refreshed as needed.

#### Changed

- Refactored the core application initialization and user existence checks to utilize the new centralized `appState` service.
- Updated authentication, dashboard, cron, and realtime services to use the robust `ensureAdminAuth` mechanism for all administrative PocketBase operations.

#### Removed

- The `userState` service has been removed, as its functionality is now handled by the new `appState` service.

#### Fixed

- Addressed potential issues with PocketBase admin authentication tokens expiring by ensuring automatic re-authentication before critical operations.

---

# 0.13.1

#### Added

- Implemented automatic token refresh for Pocketbase admin authentication every 15 minutes to ensure continuous active sessions.
- Introduced startup validation to check for the presence of `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD` environment variables, terminating the process if essential credentials are not configured.

#### Changed

- Refactored Pocketbase admin authentication logic for improved modularity and clearer error reporting.

---

# 0.13.0

#### Added

- Introduced real-time dashboard updates using Server-Sent Events (SSE), enabling immediate data synchronization without manual refreshes.
- Implemented new server-side services for real-time functionality, including subscription to database changes and broadcasting updates to connected clients.
- Exposed a new API endpoint (/dashboard/events) for client-side Server-Sent Events connections.
- Integrated the `eventsource` package to support Server-Sent Events (SSE) functionality.

---

# 0.12.0

#### Added

- Implemented an initial user registration process for first-time setup, including new `/register` routes and a dedicated registration page.
- Introduced a user state service to manage and track the existence of the initial user account.
- Added middleware to guide users through the initial setup or login based on user existence.

#### Changed

- Refactored server initialization to perform an asynchronous check for existing users upon startup.
- Improved the website creation workflow to redirect to the website list after adding a new site.
- Adjusted dashboard metric displays to show 0% change for archived websites.
- Enhanced the login page by adding `autofocus` to the email input field.

#### Removed

- The user avatar field and associated avatar URL handling from the database schema and the application's user interface.

---

# 0.11.0

#### Added

- Archive and restore functionality for websites, allowing users to temporarily disable tracking and manage inactive sites.
- A new `isArchived` boolean field in the `websites` database collection to support archiving.
- A custom, reusable modal dialog system for confirmations and enhanced user interaction.
- Dedicated UI elements and styling to indicate and manage archived websites, including an "Archived" section in the sidebar and on the website management page.
- New routes for handling website archive and restore operations.
- Enhanced website deletion process to optionally remove all associated analytics data (summaries, events, JS errors, sessions, visitors).
- A separate PocketBase admin client (`pbAdmin`) for all backend data modification and retrieval operations, improving security.

#### Changed

- Implemented stricter access control rules for `reports` and `websites` database collections, restricting access to `user = @request.auth.id`. Other collection rules were updated from empty strings to null for consistency, meaning restricted to admin users only.
- Dashboard behavior and UI are now adapted for archived websites, disabling active user tracking, auto-refresh, and website settings.
- Increased the data fetching limit for country breakdown reports from 100 to 1000.
- Modified the world map data normalization function from `polynomial` to `linear` for improved visual representation.
- Centralized PocketBase client configuration for `autoCancellation` to ensure consistent behavior across all services.

#### Fixed

- Ensured consistent and proper PocketBase client usage across backend services and controllers, specifically by moving all administrative operations to the `pbAdmin` client and setting `autoCancellation(false)` centrally.

---

# 0.10.1

#### Added

- Added a new "Languages" report card to the overview dashboard.
- Introduced a local vendor copy of jsVectorMap (version 1.7.0) with custom fixes.

#### Changed

- Reordered report cards on the dashboard overview page for improved layout.

---

# 0.10.0

#### Removed

- Removed client-side collection and transmission of UTM parameters (utm_source, utm_medium, utm_campaign, utm_term, utm_content) from all tracked events.
- Discontinued storing UTM parameter fields (utmSource, utmMedium, utmCampaign) in the database schema.
- Eliminated dashboard reports and backend analytics processing for UTM Source, Medium, and Campaign breakdowns.
- Removed the "Top Pages" and "Top Referrers" report cards from the overview dashboard.

---

# 0.9.0

#### Added

- Introduced a new **Global Overview Dashboard** displaying aggregated analytics across all tracked websites, accessible at the root route (`/`).
- Added a dedicated API endpoint `/overview/data` for fetching global overview analytics data.
- Implemented a new utility function, `getMultiWebsiteChartData`, to aggregate and format chart data for multiple websites on the overview page.
- Added a **Data Retention setting** for individual websites, allowing users to configure how long their analytics data is stored.

#### Changed

- Adjusted the width of nested drawers (e.g., item detail, IP blacklist) from `50%` to `40%` for improved layout.
- Revised the client-side dashboard data fetching logic (`fetchDashboardData`) to dynamically select between single-website and global overview endpoints based on context.
- Modified chart rendering logic to support multiple data series, enabling the display of page views for individual websites on the Global Overview chart.
- Simplified the `calculatePercentageChange` utility function by removing the redundant `invert` parameter.
- The application's root route (`/`) now redirects to the new Global Overview Dashboard.
- Updated sidebar navigation to correctly highlight the 'Overview' page when active.

#### Removed

- Eliminated separate client-side functions (`closeDetailListDrawer`, `closeItemDetailDrawer`) by integrating their logic directly into respective event listeners for better code maintainability.

#### Fixed

- Addressed potential client-side issues by ensuring website-specific functions (e.g., `fetchDetailedData`, `updateWebsiteSetting`, IP blacklist management) only execute when a `WEBSITE_ID` is present, preventing errors on the Global Overview page.
- Improved the `detailDrawerOverlay` click handler to correctly dismiss only the topmost active drawer, resolving previous interaction inconsistencies.

---

# 0.8.0

#### Added

- New "Website Settings" feature, accessible from the dashboard, allowing per-website configuration.
- IP Blacklist management, enabling users to block specific IP addresses from being tracked.
- Option to disable tracking for localhost (127.0.0.1) explicitly in website settings.
- Dedicated UI components and API endpoints for managing website settings and the IP blacklist.
- Extended website data schema to support `disableLocalhostTracking` (boolean) and `ipBlacklist` (JSON array) settings.
- Initialized new websites with default values for `disableLocalhostTracking` and `ipBlacklist`.

#### Changed

- Improved dashboard drawer management logic to seamlessly integrate new website settings and IP blacklist drawers.
- Enhanced dark theme styling for secondary button and icon button hover states.
- Adjusted styling for search input fields within detail drawers, including dark theme support.
- Minor adjustment to trash icon alignment in detail tables.

---

# 0.7.1

#### Added

- Introduced a custom 404 Not Found page.
- Implemented a custom 500 Internal Server Error page.
- Added a favicon to improve branding and user experience across all pages.

#### Changed

- Improved user avatar URL handling to support distinct internal and public PocketBase URLs.
- Enhanced authentication reliability by clearing the PocketBase auth store at the start of each request.

---

# 0.7.0

#### Added

- Introduced comprehensive JavaScript error tracking, including automatic capture of console errors, console warnings, unhandled promise rejections, and uncaught exceptions.
- Added a new `js_errors` database collection to store detailed JavaScript error information, including error messages, stack traces, and associated session/website data.
- Implemented a new "JS Errors" metric card on the dashboard, providing an overview of error occurrences.
- Added a "Top JS Errors" report to the dashboard, allowing users to view and sort the most frequent JavaScript errors.
- Developed a dedicated "Item Detail Drawer" to display verbose details for individual report entries, such as full stack traces for JS errors or custom event data.
- Enabled the ability to inspect detailed `eventData` for custom events directly from the "Custom Events" report.
- Added a new API endpoint (`/dashboard/report/:websiteId/custom-event-details`) to fetch specific data for custom events.

#### Changed

- Refined the dashboard's metric grid layout to accommodate the new "JS Errors" metric, expanding from 4 to 5 columns.
- Standardized report table headers from "Views" to "Count" for consistency across various data types.
- Increased the default dashboard refresh rate from 10 seconds to 60 seconds for improved performance and reduced server load.
- Enhanced chart and map elements to dynamically adapt their themes and styling in response to dashboard theme changes.
- Restructured the "Your Websites" listing UI for a cleaner and more organized presentation.

#### Removed

- Removed console warnings previously logged by the client-side script for malformed `skopos-data-from` attributes or unfound elements, reducing console noise.

#### Fixed

- Addressed an issue where chart tooltips and the world map did not consistently update their visual themes when the dashboard theme was switched.

---

# 0.6.0

#### Added

- Introduced a new client-side option, `data-observe-dom`, allowing control over DOM mutation observation for dynamic event binding.
- Added new dashboard reports to display Entry Pages and Exit Pages.
- Implemented tracking for new visitors with the addition of an `isNewVisitor` field in the analytics schema.

#### Changed

- Replaced the 'Bounce Rate' metric with a new 'Engagement' metric across the dashboard, affecting UI, calculations, and data aggregation.
- Improved the layout of the websites page by adjusting main content padding.

---

# 0.5.0

#### Added

- Introduced a client-side tracking script (`skopos-min.js`).
- Implemented a new database schema (`pb_schema.json`) defining collections for users, websites, sessions, events, reports, and dashboard summaries.
- Added an interactive World Map visualization to the dashboard, displaying visitor origin by country.
- Included a new "Countries" breakdown report in the dashboard analytics.
- Enabled user avatar display in the sidebar.

#### Changed

- Overhauled the user interface with a new color palette, enhanced shadows, rounded corners, and refined component styles.
- Revised dashboard layout for improved metrics and reports presentation, including dedicated sections for map and country reports.
- Expanded sidebar width and updated navigation link styling and brand presentation.
- Relocated the dashboard update progress bar to the bottom of the main header.
- Converted the manual refresh button to a more compact icon-only style.
- Adjusted the default dashboard auto-refresh interval from 10 seconds to 60 seconds.
- Updated user authentication object access from `pb.authStore.model` to `pb.authStore.record`.
- Enhanced country data display in reports and detail tables to show full country names instead of ISO codes.

---

# 0.4.0

#### Added

- Implemented a new cron job to prune old session data, removing records older than 7 days to manage database size.
- Introduced new refresh rate options for the dashboard: 5 minutes, 15 minutes, and 30 minutes.

#### Changed

- Refreshed the dark theme's color palette and styling for improved consistency and a modern visual appeal across the UI.
- Optimized dashboard data fetching by consolidating summary data queries, reducing database load and improving performance.
- Enhanced the active user calculation method by directly querying session records, leading to more accurate and efficient real-time user metrics.
- Improved the accuracy of aggregate metrics (average session duration and bounce rate) by ensuring calculations only include finalized daily summaries.
- Adjusted the number of items displayed per page in the dashboard's detailed reports from 25 to 20.
- Refined the date filtering logic in daily summary finalization cron jobs for more precise and robust data processing.
- Modified available dashboard refresh rate options, removing the 5-second interval to promote more sustainable usage.

#### Removed

- Eliminated PDF and CSV report generation functionality, including associated routes, controller, service, and UI export buttons from the dashboard.
- Discontinued the 5-second refresh rate option from dashboard settings.

---

# 0.3.0

#### Added

- Implemented daily cron jobs for automated data management and summary finalization.
- Introduced a cron job to prune dashboard summaries older than 30 days, optimizing database size.
- Introduced a cron job to enforce website-specific data retention policies by automatically removing old sessions and events.
- Introduced a cron job to finalize daily dashboard summaries, calculating and updating metrics such as bounce rate and average session duration for the previous day.

#### Changed

- Refactored dashboard and report generation to utilize pre-calculated daily summary data (`dash_sum` collection), significantly improving performance and scalability by reducing direct queries on raw session and event data.
- Updated analytics utility functions to process and aggregate data efficiently from the new daily summary structure.
- Disabled PocketBase auto-cancellation during user login to enhance stability and prevent potential issues during authentication.

#### Removed

- Direct, real-time aggregation of all analytics metrics (page views, visitors, session duration, bounce rate) and detailed reports from raw session and event data within the dashboard and report controllers, as this is now handled by daily summaries.

---

# 0.2.0

#### Added

- Dark Mode: Introduced a new dark theme for the user interface, improving visual comfort and personalization.
- Customizable Dashboard Settings: Users can now configure dashboard refresh rate, data display period, and report result limits via a new global settings drawer.
- Detailed Report Views: Implemented interactive detail drawers for all dashboard report cards, offering paginated, sortable, and searchable tables for in-depth data analysis.
- Manual Dashboard Refresh: Added a button to manually trigger an immediate dashboard data refresh.

#### Changed

- Dashboard Metrics Calculation: Enhanced the "Active Users" metric calculation for improved real-time accuracy, now based on recent events.
- Dynamic Data Loading: Dashboard and report data fetching now dynamically adjust based on user-selected data periods and result limits.
- PDF Report Generation: Improved the layout and pagination for generated PDF reports to better handle extensive data, ensuring readability.
- User Interface Theming: Analytics charts and other UI elements now dynamically adapt their appearance based on the selected dark or light theme.
- Website Management Page: Redesigned the "Manage Websites" page layout for improved organization and refined the tracking ID copy functionality.
- Codebase Structure: Refactored JavaScript into separate global (main.js) and dashboard-specific (dashboard.js) files for better modularity and conditional loading.

#### Removed

- Hardcoded dashboard update intervals, replaced by user-configurable settings.
- Direct inline CSS transitions for the progress bar, now managed dynamically by JavaScript.
- Outdated CSS classes and structures related to previous report card and website list layouts, simplifying the stylesheet.

#### Fixed

- Adjusted responsive layouts for improved display on various screen sizes, especially for drawers and main content grids.
- Ensured website deletion redirects correctly to the websites list page after an action.
- Clarified the confirmation message when deleting a website to better reflect its impact on data.

---

# 0.1.0

- Initial release of the Skopos Web Analytics project.
