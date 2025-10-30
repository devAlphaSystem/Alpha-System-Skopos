The Skopos Dashboard is your central hub for viewing and understanding the analytics data collected from your website. This guide explains the different components of the dashboard and how to interpret the information presented.

## Getting Started

### Login

Access your dashboard by navigating to its URL and logging in with the user credentials configured for your Skopos instance.

### Website Navigation

After logging in, you will land on the **Global Overview**, which aggregates data from all your active websites. You can view a specific website's dashboard by selecting it from the "Websites" list in the left-hand sidebar.

## The Dashboard View

Whether on the Global Overview or a specific website's dashboard, the main view gives you an at-a-glance summary of performance.

### Header Controls

-   **Page Title:** Shows "Global Overview" or the name of the currently viewed website.
-   **Data Period:** Shows the time frame for the data being displayed (e.g., "last 7 days"). This can be changed in the general **Settings** drawer.
-   **Active Users:** A live count of users who have been active on your site(s) in the last 5 minutes.
-   **Refresh Button:** Manually refreshes all the data on the dashboard.
-   **Website Settings Button (Website View Only):** Opens a drawer for managing settings specific to the selected website.

### Metrics Grid

This grid displays key performance indicators (KPIs). Each card shows the total value for the selected period and a percentage change compared to the previous period.

-   **Page Views:** The total number of times pages were viewed.
-   **Visitors:** The total number of unique visitor sessions. A visitor is identified by a combination of IP address and User-Agent.
-   **Engagement:** The percentage of sessions with more than one event or lasting longer than 10 seconds.
-   **Avg. Session:** The average duration of a visitor's session from their first to last activity.

### Report Cards

The dashboard is populated with various report cards that break down your data into specific categories.

-   **Visitors by Country:** A world map and a list showing the geographic distribution of your visitors.
-   **Top Pages:** The most frequently viewed pages.
-   **Entry/Exit Pages:** The first and last pages visitors see in their sessions.
-   **Top Referrers:** The external websites sending you the most traffic. "Direct" means the user typed your URL or used a bookmark.
-   **Top JS Errors:** The most common JavaScript errors.
-   **Custom Events:** A list of the custom events you are tracking and their frequencies.
-   **Devices / Browsers / Languages:** Breakdowns of your audience by device type, browser, and language.

## Interacting with Reports

### Opening the Detail Drawer

On a website-specific dashboard, **click on any report card** (e.g., "Top Pages") to open a "Detail Drawer." This provides a complete, searchable, and sortable list of all items in that category.

### Viewing Item Details (Errors & Events)

When viewing the detail drawer for "Top JS Errors" or "Custom Events," you can go one level deeper.
-   **JS Errors:** Click an error row to open a second drawer displaying the full **stack trace** for debugging.
-   **Custom Events:** If an event has custom data (indicated by an info icon), click the row to see the unique `eventData` payloads that were sent for that event.

## Managing Websites

Click the **Websites** link in the sidebar to add, view, and manage your sites.

-   **Add New Website:** Fill out the form to start tracking a new site. The `domain` field is crucial for security and should be the primary domain where the tracking script will run (e.g., `example.com`).
-   **Archive/Restore:** You can archive a website to temporarily disable tracking. Archived sites can be restored or permanently deleted.
-   **Delete a Website:** Permanently deletes a website and, optionally, all of its associated analytics data. This action is irreversible.
-   **Tracking ID:** Each website card displays its unique `trackingId`, which is required for the SDK configuration.

## Settings

### General Settings (Sidebar)

Click the **Settings** button in the main sidebar to customize your dashboard experience.

-   **Appearance:** Toggle between Light and Dark mode.
-   **Dashboard Updates:** Control auto-refresh behavior and frequency.
-   **Data Display:** Set the time frame for all analytics (e.g., last 7, 30 days) and the number of items on dashboard report cards.

### Website-Specific Settings (Header)

When viewing a specific website, click the **Website Settings** button in the header.

-   **Disable tracking on localhost:** Prevents the SDK from processing events from `localhost`.
-   **IP Blacklist:** Manage a list of IP addresses from which events will be ignored.
-   **Data Retention:** Set how many days to keep analytics data for this site (0 for forever).