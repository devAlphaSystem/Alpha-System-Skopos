The Skopos NodeJS SDK is the core server-side component that receives, processes, and securely stores analytics data in your PocketBase database. It handles session management, visitor identification, data aggregation, and batching for efficient and reliable event tracking.

## Installation

```bash
npm install @alphasystem/skopos
```

## Initialization

Initialize the SDK asynchronously using `SkoposSDK.init()` when your server starts. Store and reuse the single instance throughout your application.

```javascript
// server.js
import { SkoposSDK } from "@alphasystem/skopos";
import express from "express";

const app = express();
let skopos;

async function startServer() {
  try {
    skopos = await SkoposSDK.init({
      siteId: process.env.SKOPOS_SITE_ID, // Your Website Tracking ID
      pocketbaseUrl: process.env.POCKETBASE_URL,
      adminEmail: process.env.POCKETBASE_ADMIN_EMAIL,
      adminPassword: process.env.POCKETBASE_ADMIN_PASSWORD,
      batch: true, // Recommended for production
    });
    console.log("Skopos SDK initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize Skopos SDK:", error);
    process.exit(1);
  }

  // ... rest of your server setup
}

startServer();
```

### Configuration Options

The `init` method accepts the following options:

| Option                 | Type      | Required | Description                                                                                             | Default                  |
| :--------------------- | :-------- | :------- | :------------------------------------------------------------------------------------------------------ | :----------------------- |
| `siteId`               | `string`  | **Yes**  | The tracking ID for your website, found on the "Websites" page of your Skopos dashboard.                |                          |
| `pocketbaseUrl`        | `string`  | **Yes**  | The full URL to your PocketBase instance (e.g., `http://127.0.0.1:8090`).                               |                          |
| `adminEmail`           | `string`  | **Yes**  | The email for a PocketBase admin or superuser account. Required for the SDK to write data.              |                          |
| `adminPassword`        | `string`  | **Yes**  | The password for the PocketBase admin account.                                                          |                          |
| `batch`                | `boolean` | No       | Set to `true` to enable event batching for improved performance. Recommended for production.            | `false`                  |
| `batchInterval`        | `number`  | No       | The interval in milliseconds to send batched events.                                                    | `10000` (10 seconds)     |
| `maxBatchSize`         | `number`  | No       | The maximum number of events to queue before flushing, regardless of the interval.                      | `100`                    |
| `sessionTimeoutMs`     | `number`  | No       | Duration in milliseconds before a visitor's session is considered expired due to inactivity.            | `1800000` (30 minutes)   |
| `jsErrorBatchInterval` | `number`  | No       | The interval in milliseconds to send batched JavaScript error reports.                                  | `300000` (5 minutes)     |
| `debug`                | `boolean` | No       | Set to `true` to enable verbose debug logging. Error logs are always enabled regardless of this setting. | `false`                |

**Best Practices:**
- Store credentials in environment variables, never commit them to version control
- Enable batching in production to reduce database load
- Adjust `batchInterval` based on your traffic volume (lower for high traffic sites)
- Use `debug: true` during development to troubleshoot issues

## Security & Validation

The SDK is designed with security as a priority and automatically performs several checks on incoming data from the client-side script.

1.  **Payload Validation:** Incoming data is strictly validated against the expected shape and types. Any payload that does not conform is immediately rejected.
2.  **Domain Enforcement:** The SDK retrieves the `domain` you set for the website in the dashboard. It then compares this against the origin of incoming requests. Any event from an unrecognized or mismatched domain is dropped, preventing data spoofing.
3.  **Data Sanitization:** All data is sanitized before processing. Strings are trimmed and constrained to reasonable lengths, numbers are clamped to valid ranges, and large `customData` blobs are rejected to protect your database.
4.  **Dashboard-Controlled Settings:** The SDK subscribes to your website's configuration in real-time. Changes made in the dashboard, such as updating the IP blacklist or toggling localhost tracking, are applied instantly without needing a server restart.

## Tracking Events

### 1. Client-Side Events (via API Endpoint)

This is the primary method for tracking events from a user's browser. Create an API endpoint that receives the payload from the client-side script and passes it to the SDK's `trackApiEvent` method.

**Key Points:**
- This method is **fire-and-forget** - it returns immediately and processes in the background
- All validation and sanitization happens automatically
- Events from mismatched domains are rejected
- Bot traffic is automatically filtered out
- IP blacklist and localhost settings are enforced

**Example: Express API Route**

```javascript
// In your routes file (e.g., api.js)
import express from "express";
const router = express.Router();

// Middleware to parse JSON (if not already applied globally)
router.use(express.json());

// This endpoint URL should match `data-endpoint` in the client script
router.post("/api/event", (req, res) => {
  // trackApiEvent is fire-and-forget and processes in the background.
  skopos.trackApiEvent(req, req.body);
  
  // Respond immediately with 204 No Content
  res.status(204).send();
});

export default router;
```

**Important:** Always respond with a 2xx status code immediately. Don't wait for the SDK to finish processing, as this would slow down the user's browsing experience.

### 2. Server-Side Events

Use `trackServerEvent` to record events that happen exclusively on your backend, such as:
- User registration or login
- Subscription or payment processing
- API calls from external services
- Scheduled tasks or cron jobs
- File uploads or exports

**Example: Tracking a User Signup**

```javascript
app.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  
  // Your business logic
  const newUser = await createUserInDatabase(email, password, name);

  // Track the server-side event
  skopos.trackServerEvent(
    req,
    "user_signup", // Descriptive event name
    { 
      plan: "free_tier", 
      userName: name,
      referralSource: req.query.ref 
    } // Optional custom data
  );

  res.status(201).json({ message: "User created", userId: newUser.id });
});
```

**Example: Tracking a Payment Webhook**

```javascript
app.post("/webhooks/stripe", async (req, res) => {
  const event = req.body;
  
  if (event.type === "payment_intent.succeeded") {
    // Track the successful payment
    skopos.trackServerEvent(
      req,
      "payment_completed",
      {
        amount: event.data.object.amount,
        currency: event.data.object.currency,
        customerId: event.data.object.customer,
      }
    );
  }
  
  res.json({ received: true });
});
```

**Example: Tracking API Calls**

```javascript
app.get("/api/data/export", authenticate, async (req, res) => {
  const data = await generateExportData(req.user.id);
  
  // Track the export event
  skopos.trackServerEvent(
    req,
    "data_export",
    {
      userId: req.user.id,
      format: "csv",
      rowCount: data.length,
    }
  );
  
  res.json(data);
});
```

### 3. User Identification

Use the `identify` method to associate an anonymous visitor with your internal user data. This enables powerful features:
- Track users across multiple sessions and devices
- Link analytics data to your CRM or user database
- Segment users by account properties
- Provide personalized support based on user history

**Note on SEO Data:** When you add a new website through the dashboard, Skopos automatically triggers a background SEO analysis. This initial scan provides baseline SEO metrics, including recommendations, performance scores, and technical health checks. Additionally, weekly automated SEO scans run every Tuesday at 3:00 AM UTC for all active websites. You don't need to configure anything in the SDK - the dashboard handles this automatically.

**Note on IP Address Storage:** Version 0.28.0 introduces optional IP address storage. By default, Skopos only stores hashed visitor IDs for privacy. If you enable "Store Raw IP Addresses" in Settings → Privacy & Data Collection, full IP addresses will be stored and displayed in session details. The SDK automatically detects this setting and stores IPs accordingly. No SDK configuration changes are needed.

**When to Call `identify()`:
- After successful user login
- After user registration
- When a user updates their profile
- When you learn new information about a user

**Example: Login Handler**

```javascript
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  
  // Authenticate the user
  const user = await authenticateUser(email, password);
  
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  
  // Identify the visitor as this user
  await skopos.identify(req, user.id, {
    name: user.name,
    email: user.email,
    phone: user.phone,
    metadata: {
      accountTier: user.subscription?.tier || "free",
      signupDate: user.createdAt,
      isVerified: user.emailVerified,
    },
  });
  
  res.json({ success: true, user });
});
```

**Example: Registration Handler**

```javascript
app.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  
  // Create the new user
  const newUser = await createUser({ email, password, name });
  
  // Identify the visitor as this new user
  await skopos.identify(req, newUser.id, {
    name: newUser.name,
    email: newUser.email,
    metadata: {
      accountTier: "free",
      signupDate: new Date().toISOString(),
    },
  });
  
  res.status(201).json({ success: true, user: newUser });
});
```

**Example: Profile Update**

```javascript
app.patch("/api/user/profile", authenticate, async (req, res) => {
  const updates = req.body;
  
  // Update user in your database
  const updatedUser = await updateUser(req.user.id, updates);
  
  // Update the identification data
  await skopos.identify(req, req.user.id, {
    name: updatedUser.name,
    email: updatedUser.email,
    phone: updatedUser.phone,
    metadata: {
      accountTier: updatedUser.subscription?.tier,
      lastProfileUpdate: new Date().toISOString(),
    },
  });
  
  res.json({ success: true, user: updatedUser });
});
```

**Important Notes:**
- The `identify()` method is async and returns a Promise
- If the visitor doesn't exist yet, it will be created automatically
- All fields in `userData` are optional
- The `metadata` field can store any JSON-serializable data (max 8KB)
- Email addresses are automatically validated and normalized

## SDK Version Tracking

Starting with version 0.28.0, the dashboard displays which SDK version is connected to each website:

**Automatic Detection:**
- The SDK reports its version number during initialization
- No manual configuration required
- Updates automatically when you restart with a new SDK version

**Dashboard Display:**
- Visible on website cards in the "Manage Websites" page
- Shows "Not connected" if the SDK hasn't reported yet
- Useful for tracking which sites need SDK updates

**How it works:**
1. SDK sends version information when connecting to the dashboard
2. Dashboard stores and displays this information per website
3. Updates persist until the next SDK connection

**Benefits:**
- Identify outdated SDK versions at a glance
- Plan SDK upgrades across multiple websites
- Troubleshoot version-specific issues
- Monitor deployment status

## Graceful Shutdown

To prevent data loss, you **must** call the `shutdown()` method when your application is terminating. This:
- Clears all interval timers
- Flushes any remaining events in the queue
- Flushes JavaScript error reports
- Flushes dashboard summary updates
- Closes the real-time subscription connection

**Example: Node.js Process Handlers**

```javascript
async function gracefulShutdown() {
  console.log("Shutting down gracefully...");
  
  if (skopos) {
    await skopos.shutdown();
    console.log("Skopos SDK flushed and shut down.");
  }
  
  // Close other resources (database connections, etc.)
  // ...
  
  process.exit(0);
}

// Handle Ctrl+C
process.on("SIGINT", gracefulShutdown);

// Handle kill commands
process.on("SIGTERM", gracefulShutdown);

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown();
});
```

**Example: Express Server with Proper Shutdown**

```javascript
import express from "express";
import { SkoposSDK } from "@alphasystem/skopos";

const app = express();
let skopos;
let server;

async function startServer() {
  try {
    // Initialize SDK
    skopos = await SkoposSDK.init({
      siteId: process.env.SKOPOS_SITE_ID,
      pocketbaseUrl: process.env.POCKETBASE_URL,
      adminEmail: process.env.POCKETBASE_ADMIN_EMAIL,
      adminPassword: process.env.POCKETBASE_ADMIN_PASSWORD,
      batch: true,
    });
    
    console.log("Skopos SDK initialized successfully.");
    
    // Start HTTP server
    server = app.listen(3000, () => {
      console.log("Server running on port 3000");
    });
  } catch (error) {
    console.error("Failed to initialize:", error);
    process.exit(1);
  }
}

async function shutdown() {
  console.log("Shutting down gracefully...");
  
  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log("HTTP server closed.");
    });
  }
  
  // Flush SDK data
  if (skopos) {
    await skopos.shutdown();
    console.log("Skopos SDK shut down.");
  }
  
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();
```

## Best Practices

### 1. Environment Variables
Never hardcode credentials. Use environment variables:

```javascript
// .env file
POCKETBASE_URL=https://pb.example.com
SKOPOS_SITE_ID=abc123xyz
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=your-secure-password

// In your code
import dotenv from "dotenv";
dotenv.config();

const skopos = await SkoposSDK.init({
  siteId: process.env.SKOPOS_SITE_ID,
  pocketbaseUrl: process.env.POCKETBASE_URL,
  adminEmail: process.env.POCKETBASE_ADMIN_EMAIL,
  adminPassword: process.env.POCKETBASE_ADMIN_PASSWORD,
});
```

### 2. Enable Batching in Production
Batching significantly reduces database load:

```javascript
const skopos = await SkoposSDK.init({
  // ... other options
  batch: true,
  batchInterval: 10000, // 10 seconds
  maxBatchSize: 100,
});
```

**When to adjust batching:**
- High traffic sites: Decrease `batchInterval` to 5000ms
- Low traffic sites: Increase to 30000ms to reduce overhead
- Real-time dashboards: Use smaller intervals for fresher data

### 3. Error Handling
The SDK handles most errors internally, but you should still monitor initialization:

```javascript
try {
  skopos = await SkoposSDK.init(options);
  console.log("SDK initialized successfully");
} catch (error) {
  console.error("Failed to initialize Skopos SDK:", error);
  // Decide if you want to exit or continue without analytics
  // process.exit(1); // Critical: exit if analytics is required
  // OR
  // skopos = null; // Non-critical: continue without analytics
}
```

### 4. Avoid Blocking the Response
Never await `trackApiEvent` or `trackServerEvent` (except `identify`):

```javascript
// ❌ Bad: Blocks the response
app.post("/api/event", async (req, res) => {
  await skopos.trackApiEvent(req, req.body); // Don't await!
  res.status(204).send();
});

// ✅ Good: Fire and forget
app.post("/api/event", (req, res) => {
  skopos.trackApiEvent(req, req.body);
  res.status(204).send();
});

// ✅ Also good: identify() should be awaited
app.post("/auth/login", async (req, res) => {
  const user = await authenticateUser(req.body);
  await skopos.identify(req, user.id, { name: user.name }); // Await is fine here
  res.json({ success: true });
});
```

### 5. Session Timeout Tuning
The default 30-minute session timeout works for most sites, but you can adjust it:

```javascript
const skopos = await SkoposSDK.init({
  // ... other options
  sessionTimeoutMs: 1000 * 60 * 15, // 15 minutes for high-activity sites
  // OR
  sessionTimeoutMs: 1000 * 60 * 60, // 60 minutes for reading-heavy sites
});
```

### 6. Debug Mode for Development
Enable debug logging during development:

```javascript
const skopos = await SkoposSDK.init({
  // ... other options
  debug: process.env.NODE_ENV === "development",
});
```

## Troubleshooting

### SDK Initialization Fails

**Problem:** `SkoposSDK.init()` throws an error.

**Common Causes:**
1. **Invalid credentials**: Verify `adminEmail` and `adminPassword`
2. **PocketBase not accessible**: Check that `pocketbaseUrl` is correct and the server is running
3. **Wrong siteId**: Ensure the tracking ID matches a website in your dashboard
4. **Network issues**: Check firewall rules and network connectivity

**Solution:**
```javascript
try {
  const skopos = await SkoposSDK.init({
    debug: true, // Enable debug logging
    // ... other options
  });
} catch (error) {
  console.error("Init error:", error.message);
  // Check the error message for specific details
}
```

### Events Not Appearing in Dashboard

**Problem:** Events are sent but don't show up in the dashboard.

**Checklist:**
1. ✅ Verify the SDK is initialized with the correct `siteId`
2. ✅ Check that the website domain matches the origin of incoming requests
3. ✅ Ensure the client-side script has the correct `data-endpoint`
4. ✅ Look for validation errors in your server logs (enable `debug: true`)
5. ✅ Check if the IP is in the blacklist
6. ✅ Verify localhost tracking isn't disabled (if testing locally)
7. ✅ Confirm PocketBase collections are accessible

**Debug Command:**
```javascript
// Enable debug mode temporarily
skopos.debug = true;
```

### High Memory Usage

**Problem:** The SDK is consuming too much memory.

**Causes:**
- Event queue growing too large (batch size too high)
- Session cache not cleaning up properly
- Too many pending events

**Solutions:**
```javascript
const skopos = await SkoposSDK.init({
  batch: true,
  maxBatchSize: 50, // Reduce from default 100
  batchInterval: 5000, // Flush more frequently
  sessionTimeoutMs: 1000 * 60 * 15, // Reduce session lifetime
});

// Manually flush if needed
await skopos.flushEvents();
```

### Authentication Expired Errors

**Problem:** SDK logs "Admin token expired" errors.

**Explanation:** The SDK automatically re-authenticates when tokens expire. However, if re-authentication fails:

**Solutions:**
1. Verify admin credentials are still valid
2. Check PocketBase admin password hasn't changed
3. Ensure PocketBase is accessible from your server
4. Check for network connectivity issues

### Events Being Rejected

**Problem:** Events are being dropped with "domain mismatch" warnings.

**Cause:** The SDK validates that incoming events originate from your configured domain.

**Solution:**
1. Go to the Websites page in your dashboard
2. Verify the domain is correctly set (e.g., `example.com`, not `https://example.com`)
3. The SDK strips `www.` and compares hostnames, so `www.example.com` and `example.com` are treated as the same

### Real-Time Updates Not Working

**Problem:** Dashboard settings changes don't apply to the SDK.

**Causes:**
- WebSocket connection failed
- PocketBase real-time not enabled
- Network firewall blocking WebSocket connections

**Solution:**
1. Check PocketBase logs for WebSocket errors
2. Verify your server can establish WebSocket connections to PocketBase
3. Check firewall rules for outbound WebSocket connections
4. Restart the SDK (it re-establishes the connection on init)

## Performance Optimization

### High-Traffic Scenarios

For sites with millions of page views:

```javascript
const skopos = await SkoposSDK.init({
  batch: true,
  batchInterval: 5000, // Flush every 5 seconds
  maxBatchSize: 200, // Larger batches
  jsErrorBatchInterval: 60000, // Only flush errors every minute
});
```

### Low-Traffic Scenarios

For sites with minimal traffic:

```javascript
const skopos = await SkoposSDK.init({
  batch: false, // Disable batching, send immediately
});
```

### Database Optimization

- **Enable data retention**: Set appropriate retention periods to prevent unbounded database growth
- **Monitor collection sizes**: Regularly check your PocketBase database size
- **Use indexes**: PocketBase automatically indexes key fields like `visitorId`, `sessionId`, etc.

## Advanced Usage

### Multiple Websites from One SDK Instance

You can track multiple websites with a single SDK instance using the optional `siteId` parameter:

```javascript
// Initialize with default site
const skopos = await SkoposSDK.init({
  siteId: "main-site-id",
  // ... other options
});

// Track to default site
skopos.trackServerEvent(req, "event_name");

// Track to a different site
skopos.trackServerEvent(req, "event_name", {}, "other-site-id");
```

### Custom Visitor Identification

The SDK generates visitor IDs by hashing IP + User-Agent + Site ID. If you need custom visitor identification logic, you'll need to modify the SDK source code (it's open source!).

### Accessing Raw PocketBase

If you need direct access to PocketBase for custom queries:

```javascript
// Not officially supported, but possible:
// skopos.pb gives you access to the PocketBase client
// Use with caution as this bypasses SDK logic
```

## API Reference Summary

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `SkoposSDK.init(options)` | `SkoposSDKOptions` | `Promise<SkoposSDK>` | Initialize and authenticate the SDK |
| `trackApiEvent(req, payload)` | `IncomingMessage`, `ApiEventPayload` | `void` | Track client-side events (fire-and-forget) |
| `trackServerEvent(req, name, data?, siteId?)` | `IncomingMessage`, `string`, `object`, `string` | `void` | Track backend events (fire-and-forget) |
| `identify(req, userId, userData?)` | `IncomingMessage`, `string`, `IdentifyData` | `Promise<void>` | Associate visitor with user data |
| `flushEvents()` | - | `Promise<void>` | Manually flush event queue |
| `shutdown()` | - | `Promise<void>` | Gracefully shut down SDK |