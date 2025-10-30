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
| `batch`                | `boolean` | No       | Set to `true` to enable event batching for improved performance.                                        | `false`                  |
| `batchInterval`        | `number`  | No       | The interval in milliseconds to send batched events.                                                    | `10000` (10 seconds)     |
| `maxBatchSize`         | `number`  | No       | The maximum number of events to queue before flushing.                                                  | `100`                    |
| `sessionTimeoutMs`     | `number`  | No       | Duration in milliseconds before a visitor's session is considered expired due to inactivity.            | `1800000` (30 minutes)   |
| `jsErrorBatchInterval` | `number`  | No       | The interval in milliseconds to send batched JavaScript error reports.                                  | `300000` (5 minutes)     |

## Security & Validation

The SDK is designed with security as a priority and automatically performs several checks on incoming data from the client-side script.

1.  **Payload Validation:** Incoming data is strictly validated against the expected shape and types. Any payload that does not conform is immediately rejected.
2.  **Domain Enforcement:** The SDK retrieves the `domain` you set for the website in the dashboard. It then compares this against the origin of incoming requests. Any event from an unrecognized or mismatched domain is dropped, preventing data spoofing.
3.  **Data Sanitization:** All data is sanitized before processing. Strings are trimmed and constrained to reasonable lengths, numbers are clamped to valid ranges, and large `customData` blobs are rejected to protect your database.
4.  **Dashboard-Controlled Settings:** The SDK subscribes to your website's configuration in real-time. Changes made in the dashboard, such as updating the IP blacklist or toggling localhost tracking, are applied instantly without needing a server restart.

## Tracking Events

### 1. Client-Side Events (via API Endpoint)

This is the primary method for tracking events from a user's browser. Create an API endpoint that receives the payload from the client-side script and passes it to the SDK's `trackApiEvent` method.

**Example: Express API Route**

```javascript
// In your routes file (e.g., api.js)
// Assuming 'skopos' is your initialized SDK instance

// This endpoint URL should match `data-endpoint` in the client script
app.post("/api/event", (req, res) => {
  // trackApiEvent is fire-and-forget and processes in the background.
  skopos.trackApiEvent(req, req.body);
  res.status(204).send();
});
```

### 2. Server-Side Events

Use `trackServerEvent` to record events that happen exclusively on your backend, such as a user signup or a subscription payment.

**Example: Tracking a User Signup**

```javascript
app.post("/signup", async (req, res) => {
  const { email, password, name } = req.body;
  const newUser = await createUserInDatabase(email, password, name);

  // Track the server-side event
  skopos.trackServerEvent(
    req,
    "user_signup", // Descriptive event name
    { plan: "free_tier", userName: name } // Optional custom data
  );

  res.status(201).json({ message: "User created", userId: newUser.id });
});
```

## Graceful Shutdown

To prevent data loss, you **must** call the `shutdown()` method when your application is terminating. This flushes any remaining events in the queues to the database.

```javascript
async function gracefulShutdown() {
  console.log("Shutting down gracefully...");
  if (skopos) {
    await skopos.shutdown();
    console.log("Skopos SDK flushed and shut down.");
  }
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown); // Catches Ctrl+C
process.on("SIGTERM", gracefulShutdown); // Catches kill commands
```