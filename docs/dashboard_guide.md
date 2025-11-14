The Skopos Dashboard is your central hub for viewing and understanding the analytics data collected from your website. This guide explains the different components of the dashboard and how to interpret the information presented.

## Getting Started

### Login

Access your dashboard by navigating to its URL and logging in with the user credentials configured for your Skopos instance.

### Website Navigation

After logging in, you will land on the **Global Overview**, which aggregates data from all your active websites. You can view a specific website's dashboard by selecting it from the "Websites" list in the left-hand sidebar.

### Sidebar Management

**Collapsible Sidebar:**
The dashboard sidebar can be collapsed to maximize your workspace:
- Click the collapse button (←) in the sidebar header to toggle between full and collapsed view
- In collapsed mode, only icons are visible with the sidebar narrowing to 70px
- Hover tooltips help identify menu items when collapsed
- Your preference is saved automatically in browser localStorage
- On mobile devices (screens ≤992px), the sidebar always displays at full width when opened
- The sidebar slides in from the left on mobile and can be dismissed by tapping outside

**Mobile Behavior:**
On smaller screens, the sidebar is hidden by default. Tap the hamburger menu icon to open it.

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

### SEO Summary Card (Website Dashboard Only)

When viewing a specific website's dashboard, an SEO Summary Card appears at the top if SEO data is available. This provides at-a-glance insights into your site's search engine optimization health:

#### SEO Score Gauge
- **Visual Score**: Circular gauge displaying your overall SEO score (0-100)
- **Score Label**: 
  - Excellent (90+): Green badge
  - Strong (75-89): Green badge
  - Good (60-74): Yellow badge
  - Needs Work (45-59): Yellow badge
  - Critical (<45): Red badge
- **Last Analyzed**: Timestamp of the most recent SEO scan

#### Quick Stats
- **Critical Issues**: Count of critical-priority problems requiring immediate attention
- **High Priority Issues**: Count of high-priority optimization opportunities
- **Performance Score**: Lighthouse performance score (0-100) if available
- **HTTPS Status**: Whether SSL/HTTPS is enabled (Yes/No)
- **Sitemap Status**: Whether sitemap.xml is accessible (Yes/No)
- **Mobile Responsive**: Whether the site has proper viewport configuration (Yes/No)

**Note:** Click the website name in the sidebar to access the full SEO Analytics page with detailed recommendations and analysis.

### Report Cards

The dashboard is populated with various report cards that break down your data into specific categories.

-   **Visitors by Country:** A world map and a list showing the geographic distribution of your visitors. Click any country to drill into its top states or provinces when that data is available.
-   **Top Pages:** The most frequently viewed pages.
-   **Entry/Exit Pages:** The first and last pages visitors see in their sessions.
-   **Top Referrers:** The external websites sending you the most traffic. "Direct" means the user typed your URL or used a bookmark.
-   **Top JS Errors:** The most common JavaScript errors.
-   **Custom Events:** A list of the custom events you are tracking and their frequencies.
-   **Devices / Browsers / Languages:** Breakdowns of your audience by device type, browser, and language.

## Interacting with Reports

### Opening the Detail Drawer

On a website-specific dashboard, **click on any report card** (e.g., "Top Pages") to open a "Detail Drawer." This provides a complete, searchable, and sortable list of all items in that category.

### Viewing Item Details (Errors, Events & Geo)

When viewing the detail drawer for "Top JS Errors," "Custom Events," or "Visitors by Country," you can go one level deeper.
-   **JS Errors:** Click an error row to open a second drawer displaying the full **stack trace** for debugging.
-   **Custom Events:** If an event has custom data (indicated by an info icon), click the row to see the unique `eventData` payloads that were sent for that event.
-   **Geo Drilldown:** Selecting a country opens a second drawer with detailed state/province counts and percentages.

## Managing Websites

Click the **Websites** link in the sidebar to add, view, and manage your sites.

### Adding a New Website

1. Click the "Add Website" button
2. Fill out the following required fields:
   - **Name**: A friendly name for your website (e.g., "My Blog", "E-commerce Store")
   - **Domain**: The primary domain where the tracking script will run (e.g., `example.com` or `www.example.com`)
   - **Description** (optional): Additional notes about this website

**Important Security Note:** The `domain` field is critical for security. The SDK will reject any events that don't originate from this domain or its subdomains. This prevents data spoofing and ensures only legitimate traffic is tracked.

### Website Cards

Each website card displays key information:
- **Website Name**: The friendly name you assigned
- **Domain**: The primary domain being tracked
- **Retention Policy**: How long data is kept (or "Forever" if no limit)
- **SDK Version**: The version of the SDK currently connected
  - Shows "Not connected" if the SDK hasn't reported in yet
  - Updates automatically when the SDK connects
  - Useful for tracking which sites need SDK updates
- **Tracking ID**: Unique identifier needed for SDK initialization

### Website Settings

Each website has its own configuration that can be accessed by clicking the settings icon on the website card or via the header button when viewing that website's dashboard.

#### Tracking ID
Every website has a unique `trackingId` displayed on its card. You'll need this ID when initializing the SDK on your server.

#### Disable Tracking on Localhost
When enabled, the SDK will ignore any events coming from `localhost` or `127.0.0.1`. This is useful during development to prevent test traffic from polluting your analytics data.

#### IP Blacklist
Add IP addresses that should be excluded from tracking. This is useful for:
- Filtering out your own office IPs
- Excluding known bot IPs
- Blocking specific users if needed

Enter one IP address per line in the format `192.168.1.100`. Both IPv4 and IPv6 addresses are supported.

#### Data Retention
Set how many days to keep analytics data for this website:
- **0**: Keep data forever (default)
- **30, 60, 90, 365**: Automatically delete data older than the specified number of days

**Note:** Data retention is enforced by automatic cleanup jobs that run periodically. Deleted data cannot be recovered.

### Archiving and Deleting Websites

#### Archive a Website
Archiving temporarily disables tracking for a website while preserving all historical data. Archived websites:
- Stop accepting new events from the SDK
- Remain visible in the "Archived Websites" section
- Can be restored at any time with all data intact

#### Restore an Archived Website
Click the restore button in the archived websites section to re-enable tracking.

#### Delete a Website
Permanently deletes a website and optionally all of its associated data. You'll be prompted to choose:
- **Delete website only**: Removes the website configuration but keeps all analytics data
- **Delete website and all data**: Permanently removes the website and all sessions, events, errors, and summaries

**⚠️ This action is irreversible!**

## Settings

### General Settings (Sidebar)

Click the **Settings** button in the main sidebar to customize your dashboard experience.

#### Appearance
- **Theme**: Toggle between Light and Dark mode for comfortable viewing in any environment
- **Toast Notifications**: Enable or disable toast notifications that provide immediate feedback when you update settings. When enabled, you'll see brief notification popups confirming your changes (e.g., "Theme Updated", "Refresh Rate Updated").

#### Dashboard Updates
- **Auto-refresh**: Enable or disable automatic data updates
- **Refresh Interval**: Choose how often the dashboard refreshes (30s, 1m, 2m, 5m)
- **Refresh on focus**: Automatically refresh data when you return to the dashboard tab

#### Data Display
- **Time Frame**: Set the default time period for all analytics reports:
  - Last 7 days (default)
  - Last 14 days
  - Last 30 days
  - Last 90 days
  - All time
- **Results Limit**: Control how many items appear on dashboard report cards (5, 10, 15, 20, 25, 50)

**Note:** Time frame and results limit settings apply to all websites. The active users counter always shows the last 5 minutes regardless of the selected time frame.

#### API Keys
- **Per-User Storage**: Keys are private to the currently signed-in user and can be rotated or removed at any time.
- **AES-256-GCM Encryption**: All API keys are encrypted at rest using industry-standard AES-256-GCM encryption with authentication tags.
  - Requires the server to be configured with a 64-character hex `ENCRYPTION_KEY` environment variable
  - Generate a secure key with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **Supported Services**:
  - **Google PageSpeed Insights**: Required for Lighthouse performance scores in SEO analysis
  - **Chapybara IP Intelligence**: Provides advanced IP analysis, threat detection, and geolocation data
  - **Resend Email Service**: Required for email notification features (needs API key + verified sender email)
  - Future services can be added as needed
- **Usage Analytics**: Track when each key was last used and total usage count
- **Key Management**:
  - Add new keys through the Settings → API Keys interface
  - Update existing keys (overwrites encrypted value)
  - Deactivate keys without deleting them
  - View usage statistics for each key
- **Fallback Support**: If no dashboard key is configured, the system will try the `PAGESPEED_API_KEY` environment variable instead.
- **Security Features**:
  - Keys never appear in logs or error messages
  - Each user's keys are isolated from other users
  - Encryption uses authenticated encryption (AEAD) to prevent tampering
  - Keys are only decrypted when actively used by services
  - Initialization vectors (IV) are unique for each encryption operation
  - Authentication tags verify data integrity

**Using API Keys:**
When you run an SEO analysis, the system automatically retrieves your stored Google PageSpeed Insights key and uses it for Lighthouse performance scoring. When you view session details with stored IP addresses, the system uses your Chapybara key to fetch IP intelligence data on-demand. No additional configuration needed after adding the keys.

**Chapybara Integration:**
The IP Intelligence feature is seamlessly integrated into the session details page. When a Chapybara API key is detected and IP storage is enabled, you'll see a dedicated tab with the Chapybara logo for accessing IP intelligence data. The tab only appears for sessions that have stored IP addresses.

#### Privacy & Data Collection
- **Store Raw IP Addresses**: Toggle to enable/disable IP address storage
  - **Disabled (Default)**: Only hashed visitor IDs are stored for privacy
  - **Enabled**: Full IP addresses are stored and displayed in session details
  - Applies to all websites globally
  - Changes take effect immediately for new sessions
  - Existing sessions retain their current IP storage state

**Privacy Considerations:**
- IP addresses are considered personal data under GDPR and similar regulations
- Enabling IP storage requires disclosure in your privacy policy
- Use only if you have a legitimate business need (security, fraud prevention, compliance)
- Consider implementing data retention policies for stored IPs
- When disabled, visitor tracking relies on hashed identifiers only

#### Email Notifications

**Note:** The Notifications tab appears in Settings only when you have configured a Resend API key.

Receive real-time email alerts for important events happening on your websites.

**Setup Requirements:**
1. Create a Resend account at [resend.com](https://resend.com)
2. Verify your sending domain (or use Resend's test domain for development)
3. Generate an API key from your Resend dashboard
4. Add the API key in Settings → API Keys → Resend Email Service
5. Provide a verified "from" email address (e.g., `notifications@yourdomain.com`)

**Creating Notification Rules:**
Click the "Add Rule" button to configure a new notification:

- **Rule Name**: Descriptive name (e.g., "New Visitor Alert", "Purchase Event")
- **Event Type**: Choose what triggers the notification:
  - **New Visitor**: First-time visitors to your site
  - **New Session**: Any new session starts
  - **Custom Event**: A specific custom event you're tracking (requires event name)
  - **Daily Summary**: Daily analytics report (future feature)
  - **Error Threshold**: When errors exceed a limit (future feature)
  - **Traffic Spike**: Unusual traffic increases (future feature)
  - **Website Uptime Change**: Alerts when monitored websites go down or come back online
- **Custom Event Name**: Required when monitoring a specific custom event
- **Recipient Email**: Where to send the notification
- **Website**: Apply to all websites or filter to a specific one
- **Uptime Alert Options**: When choosing *Website Uptime Change*, select whether to notify on downtime, recovery, or both. The default is to alert only when a site is detected as down.

**Managing Rules:**
- **Toggle On/Off**: Use the switch to activate or deactivate rules without deleting them
- **View Triggers**: See how many times each rule has fired
- **Delete Rules**: Permanently remove rules you no longer need

**Email Templates:**
Notifications include beautifully formatted HTML emails with:
- Event-specific styling and color-coding
- Detailed information about the event
- Timestamps and location data
- Structured data tables for easy reading
- Device, browser, and OS information
- For custom events: full event data payloads

**Real-Time Delivery:**
Notifications are triggered instantly when events occur via PocketBase real-time subscriptions. Email delivery depends on Resend's service (typically within seconds).

**Troubleshooting:**
- If the Notifications tab doesn't appear, verify your Resend API key is configured
- Check Resend dashboard for delivery status and errors
- Ensure your "from" email domain is verified in Resend
- Review trigger counts to confirm rules are firing

### Website-Specific Settings (Header)

When viewing a specific website, click the **Website Settings** button in the header to access configuration options.

-   **Disable tracking on localhost:** Prevents the SDK from processing events from `localhost` or `127.0.0.1`. Useful during development.
-   **IP Blacklist:** Manage a list of IP addresses from which events will be ignored. Add one IP per line.
-   **Data Retention:** Set how many days to keep analytics data for this site (0 = forever, or choose 30, 60, 90, 365 days).
-   **Uptime Monitoring:** Configure uptime monitoring settings including check intervals. The system maintains a rolling 7-day window of uptime checks for efficient storage and fast access.

## Sessions

The Sessions page provides detailed insights into individual user journeys on your website.

### Viewing All Sessions

Navigate to the Sessions page from the sidebar to see all visitors and their sessions for the current website. The page displays:

- **Visitor ID**: A unique, anonymized identifier for each visitor
- **User Information**: If you've called the `identify()` method, you'll see:
  - User ID (your internal identifier)
  - Name
  - Email
  - Additional metadata
- **Session Count**: How many times this visitor has returned
- **Most Recent Session**: Timestamp of their last visit

### Session Details

Click on any session to view comprehensive information:

#### Session Overview Metrics
- **Page Views**: Total number of pages viewed in this session
- **Custom Events**: Number of custom events triggered
- **Duration**: Time from first to last event in the session (formatted as MM:SS)
- **New/Returning**: Whether this was the visitor's first session

#### Session Information
- **Session ID**: Unique identifier for this session
- **Visitor ID**: Anonymized visitor identifier
- **User Data**: If identified, displays user ID, name, email, phone, and metadata
- **Browser**: User's web browser
- **OS**: Operating system
- **Device**: Device type (Desktop, Mobile, Tablet)
- **Country**: Detected from IP address via GeoIP
- **IP Address**: Raw IP address (only visible if IP storage is enabled)
  - Click to copy the IP address to your clipboard
  - Visual confirmation appears when copied successfully
  - Shows as "Not stored (privacy mode)" if IP storage is disabled
  - Privacy-first default: IP storage is disabled unless explicitly enabled in Settings
- **Entry Page**: First page viewed in the session
- **Exit Page**: Last page viewed before the session ended
- **Referrer**: Source that brought the user to your site (or "Direct" if they typed the URL)
- **Screen Resolution**: Width and height in pixels
- **Language**: Browser language setting
- **Start Time**: When the session began
- **End Time**: When the session ended (based on last activity)

#### Session Reports
- **Top Pages**: Pages viewed during this session with visit counts and percentages
- **Top Custom Events**: Custom events triggered during this session with counts

#### Event Timeline
A chronological list of all events in the session, showing:
- Event type (Page View or Custom)
- Event name or path
- Timestamp
- Custom event data (if available)

#### IP Intelligence Tab (Premium Feature)
When you have a Chapybara API key configured and IP storage enabled, an additional "IP Intelligence" tab appears on the session details page. This tab provides:

**Geolocation Information:**
- Continent, country, region, and city
- Geographic coordinates (latitude/longitude)
- Time zone information

**Network Details:**
- Autonomous System Number (ASN)
- Internet Service Provider (ISP)
- Organization name
- Network usage type (residential, business, hosting, etc.)
- Mobile network detection and carrier brand

**Security Analysis:**
- **Threat Level**: Categorized as none, low, medium, or high
- **Proxy Detection**: Identifies proxy usage and proxy type
- **VPN Detection**: Flags VPN connections
- **Tor Detection**: Identifies Tor exit nodes
- **Datacenter IPs**: Detects hosting/datacenter IP addresses
- **Spam Detection**: Flags known spam sources

**Additional Data:**
- Reverse DNS hostnames
- Ad targeting categories

The data is presented with color-coded badges for quick threat assessment. All information is loaded on-demand when you click the IP Intelligence tab.

**Error Handling:**
- Clear error messages for API key issues
- Quota and rate limit notifications
- Retry functionality if loading fails

### Deleting Sessions

You can delete individual sessions or all sessions for a visitor:

**Delete Single Session**
- Click the delete button on the session details page
- Confirm the action in the dialog prompt
- Session data is permanently removed
- Dashboard metrics are automatically updated
- Loading indicator shows deletion progress

**Delete All Visitor Sessions**
- Click the delete button on the sessions list for a visitor
- Confirm deletion of all sessions in the dialog
- All sessions for that visitor are permanently removed
- Dashboard summaries reflect the changes
- Visual feedback during the deletion process

**Important:** Deleting sessions also updates the dashboard summaries to reflect the removed data accurately. The system uses enhanced deletion logic that:
- Properly handles events with invalid timestamps by using session creation date as fallback
- Maintains accurate event ordering for correct metric adjustments
- Validates all date keys to prevent processing errors
- Logs detailed information for troubleshooting if issues occur
- Ensures all metrics (page views, custom events, engagement, etc.) are correctly decremented

**Safety Features:**
- Confirmation dialogs prevent accidental deletions
- Clear indication of which data will be deleted
- Loading modals provide visual feedback
- Cannot be undone - deleted data is permanently removed

## SEO Analytics

The SEO Analytics page provides comprehensive insights into your website's search engine optimization with actionable recommendations. Access it from the sidebar when viewing a specific website.

### SEO Analysis Workflow

#### Automated Analysis
When you add a new website through the dashboard, Skopos automatically triggers a background SEO analysis. This initial scan provides baseline SEO metrics without any manual intervention.

#### Manual Analysis with Strategy Selection
You can trigger an on-demand SEO scan anytime by clicking the "Run SEO Analysis" button on the SEO Analytics page. When you start an analysis, you'll be prompted to select a strategy:

**Mobile Strategy (Default)**
- Simulates mobile devices with slower 4G networks
- Throttled CPU and network conditions
- Optimized for mobile-first indexing
- Recommended for most websites

**Desktop Strategy**
- Simulates desktop browsers with faster connections
- Higher performance expectations
- Useful for desktop-focused applications
- Tests different optimization scenarios

The selected strategy is displayed alongside the results, so you always know which conditions were tested. This is useful:
- After making SEO improvements to verify changes
- Before launching a new website version
- When investigating specific issues
- To compare mobile vs desktop performance

#### PageSpeed Credentials
Performance scoring requires a Google PageSpeed Insights API key. Add yours under **Settings → API Keys** (keys are stored per-user and encrypted) or configure the `PAGESPEED_API_KEY` environment variable as a fallback. Without a key, SEO analyses still run, but Lighthouse metrics will display as "N/A".

**Reliability Features:**
- Automatic retry logic for failed PageSpeed API requests (up to 2 retries per strategy)
- 45-second timeout per request to prevent hanging
- Detailed error messages and warnings when issues occur
- Fallback to partial results if one strategy fails
- All errors are logged for troubleshooting

### SEO Score

The overall SEO score (0-100) is calculated based on multiple factors:

**Scoring Breakdown:**
- **Meta Tags** (25 points): Title, description, canonical URL
- **Social Meta Tags** (10 points): Open Graph and Twitter Card tags
- **Headings** (15 points): Proper H1-H6 structure
- **Images** (15 points): Alt text coverage and quality
- **Technical SEO** (25 points): HTTPS, sitemap, robots.txt, mobile responsiveness, structured data
- **Performance** (10 points): Lighthouse performance score

**Score Ranges:**
- **90-100**: Excellent - Outstanding SEO health
- **75-89**: Strong - Good SEO with minor improvements possible
- **60-74**: Good - Solid foundation with some optimization needed
- **45-59**: Needs Work - Multiple issues requiring attention
- **0-44**: Critical - Significant problems affecting search visibility

### Recommendations System

The SEO analyzer generates intelligent, priority-based recommendations:

#### Priority Levels
- **Critical** (Red): Issues severely impacting SEO that require immediate attention
  - Missing title tag or meta description
  - No HTTPS/SSL
  - Missing sitemap
  - Not mobile responsive
  - Missing H1 heading
  - Performance score below 50

- **High** (Orange): Important issues affecting search rankings
  - Title or description too short
  - Missing canonical URL
  - Missing robots.txt
  - Multiple H1 headings
  - Broken internal links
  - More than 50% images missing alt text

- **Medium** (Yellow): Moderate issues worth addressing
  - Title or description too long
  - No H2 headings
  - Poor quality alt text
  - Oversized images
  - Links with empty anchor text
  - Missing structured data
  - No compression enabled
  - Performance score 50-79

- **Low** (Gray): Minor improvements for optimization
  - Suspicious/placeholder links
  - Missing cache headers

#### Recommendation Categories
- **Meta**: Title tags, descriptions, canonical URLs
- **Security**: HTTPS, SSL certificates
- **Technical**: Sitemap, robots.txt, structured data
- **Mobile**: Viewport configuration, responsiveness
- **Content**: Heading structure, text optimization
- **Images**: Alt text, titles, size optimization
- **Links**: Broken links, anchor text, link quality
- **Performance**: Compression, caching, load speed

### Detailed Analysis Components

#### Meta Tags Analysis
- Title tag presence, length (50-60 characters optimal)
- Meta description presence, length (150-160 characters optimal)
- Canonical URL configuration
- Viewport meta tag for mobile
- Character set declaration

#### Social Media Tags
- Open Graph tags (og:title, og:description, og:image, og:url)
- Twitter Card tags (twitter:card, twitter:title, twitter:description, twitter:image)

#### Content Analysis
- **Heading Structure**: H1-H6 distribution and hierarchy
- **Image Optimization**: 
  - Alt text coverage percentage
  - Missing alt text (list of images)
  - Empty alt attributes
  - Poor quality alt text (generic terms like "image1")
  - Images without title attributes
  - Oversized images (>2000px width or height)
- **Link Health**:
  - Internal vs. external link ratio
  - Nofollow link detection
  - Broken internal links (checks up to 20 links)
  - Empty anchor text detection
  - Suspicious links (# or javascript:void(0))

#### Technical SEO
- **HTTPS/SSL**: Secure connection verification
- **Sitemap.xml**: Accessibility check
- **Robots.txt**: Presence verification
- **Structured Data**: JSON-LD detection
- **Mobile Responsive**: Viewport meta tag validation
- **Compression**: Gzip/Brotli detection
- **Caching**: Cache-Control header verification

#### Performance Scores (via Google PageSpeed Insights)
- **Performance**: Load speed and optimization (0-100)
- **Accessibility**: WCAG compliance and usability (0-100)
- **Best Practices**: Web development standards (0-100)
- **SEO**: Search engine optimization basics (0-100)

**Note:** PageSpeed Insights requires a Google API key. Add it in Settings → API Keys (encrypted at rest) or set the `PAGESPEED_API_KEY` environment variable. Without a key, performance scores will show as "N/A" but all other SEO analysis will function normally.

#### Analysis Warnings
If any issues occur during the SEO scan (e.g., network timeouts, API failures), they're logged as warnings and displayed on the SEO Analytics page. This helps you understand if the analysis is complete or partial.

### Using SEO Recommendations

1. **Review by Priority**: Start with critical and high-priority issues first
2. **Check Impact Level**: Focus on high-impact recommendations for maximum benefit
3. **Read Descriptions**: Each recommendation includes specific guidance on how to fix the issue
4. **Implement Changes**: Make the suggested improvements to your website
5. **Re-analyze**: Run a manual SEO scan to verify your fixes
6. **Monitor Progress**: Schedule periodic manual scans to ensure improvements persist and catch regressions early

### SEO Data Retention

SEO data is stored separately from analytics data and is not affected by data retention policies. When you delete a website, its SEO data is automatically deleted as well.

## User Identification

When you use the SDK's `identify()` method to link anonymous visitors to known users, additional information becomes available throughout the dashboard:

### On the Sessions Page
- User ID column shows your internal identifier
- User name and email are displayed if provided
- Click on any user to see all their sessions across devices

### On the Session Details Page
- Full user profile information
- Custom metadata you've attached to the user
- User's phone number if provided

### Benefits of User Identification
- Track user journeys across multiple devices and sessions
- Understand behavior of specific user segments
- Connect analytics data to your CRM or user database
- Provide better customer support with full activity history

## Understanding Metrics

### User Interface Features

**Custom Modals and Dialogs:**
The dashboard uses custom-built modal dialogs for a consistent user experience:
- **Confirmation Dialogs**: Safety prompts before destructive actions (deletions, resets)
- **Loading Modals**: Visual feedback during long-running operations
- **Alert Modals**: Important notifications and error messages
- **Custom Styling**: Themed to match the dashboard's light/dark mode

**Interactive Elements:**
- Click-to-copy functionality for IPs, tracking IDs, and other identifiers
- Visual feedback on hover and interaction
- Smooth transitions and animations
- Responsive design for all screen sizes

### Page Views
The total count of times any page was loaded or viewed on your site. In SPAs, this includes both initial loads and client-side navigation events.

### Visitors
The number of unique visitor sessions. A visitor is identified by a combination of:
- IP address (anonymized via hashing)
- User-Agent string
- Your site ID

**Session Duration:** A session remains active as long as there's activity within 30 minutes (configurable). After 30 minutes of inactivity, the next event starts a new session.

**New vs. Returning:** 
- **New Visitors**: First-time visitors to your site (no previous sessions)
- **Returning Visitors**: Visitors who have had at least one previous session

### Engagement Rate
The percentage of sessions that show meaningful user interaction. A session is considered "engaged" if:
- It contains 2 or more events (e.g., viewing multiple pages), OR
- The duration exceeds 10 seconds

High engagement rates indicate visitors are actively exploring your content rather than immediately bouncing.

### Average Session Duration
The mean time between a visitor's first and last activity in a session. This is calculated from the `created` and `updated` timestamps of session records.

**Note:** Very short sessions (single-page views where the user leaves immediately) may show as 0 seconds.

### Percentage Change
All metric cards show a percentage change comparing:
- **Current Period**: Your selected time frame (e.g., last 7 days)
- **Previous Period**: An equal time frame immediately before the current one

- 🟢 **Green with ↑**: Improvement over the previous period
- 🔴 **Red with ↓**: Decline compared to the previous period
- ⚪ **Gray with →**: No significant change

## Real-Time Data

### Active Users Counter
Located in the header, this shows visitors who have been active in the **last 5 minutes**. It updates automatically and provides an at-a-glance view of current site traffic.

**How it works:** Any visitor who triggered an event (page view or custom event) within the last 5 minutes is counted as active. The counter updates every time the dashboard refreshes.

### Real-Time Configuration Updates
The SDK subscribes to real-time changes from your dashboard via WebSocket connections. When you update settings like the IP blacklist or localhost tracking, the changes are applied immediately without requiring a server restart.

## Data Privacy & Compliance

Skopos is designed with privacy as a core principle:

### No Cookies
The client-side script doesn't set or read any cookies, making it compliant with cookie consent laws in many jurisdictions.

### Visitor Anonymization
Visitors are identified using a cryptographic hash of their IP + User-Agent + Site ID. The original IP address is only used for:
- GeoIP country lookup
- IP blacklist checking
- Bot detection

After processing, IP addresses are not stored in the raw form in your analytics database.

### GDPR Compliance
- **No PII by Default**: The script doesn't automatically collect names, emails, or other personally identifiable information
- **Data Retention Controls**: Set automatic data deletion periods
- **Right to Deletion**: You can manually delete individual visitors or sessions
- **Data Portability**: All data is stored in your own PocketBase instance, which you control

### User Identification & Consent
If you use the `identify()` method to link visitors to user accounts, ensure you:
- Have proper consent from users
- Disclose analytics tracking in your privacy policy
- Provide users with a way to request data deletion
- Comply with applicable data protection regulations in your jurisdiction

## Troubleshooting

### Data Not Appearing
1. Verify the SDK is properly initialized with the correct `siteId`
2. Check that your website domain is correctly configured
3. Ensure the client-side script is loading and the `data-endpoint` is correct
4. Look for errors in your server logs or browser console
5. Verify your PocketBase instance is running and accessible

### Incorrect Metrics
- **Inflated page views**: Check if you're accidentally tracking duplicate page views in your SPA
- **Low engagement rate**: Verify that your engagement tracking is configured properly
- **Missing geographic data**: Ensure your server can access the GeoIP database

### Real-Time Updates Not Working
- Check that WebSocket connections are allowed through your firewall
- Verify your PocketBase instance supports real-time subscriptions
- Ensure you're using a compatible PocketBase version

### Performance Issues
- Consider enabling event batching in the SDK to reduce database load
- Increase batch intervals if you have very high traffic
- Set appropriate data retention policies to limit database size
- Use database indexes (PocketBase handles this automatically for most collections)