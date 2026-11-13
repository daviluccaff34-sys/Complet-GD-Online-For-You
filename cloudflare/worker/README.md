# Cloudflare prototype backend

This Worker provides the first server-side prototype for the Geode mod:

- Argon account-token validation and project sessions
- Gemini chat with D1 conversation history
- Durable Object RPC rooms with presence snapshots, chat events and shared level-operation storage
- Per-player cloud file metadata and R2 object storage (100 MB application limit)

## Create resources

1. Create a D1 database named complet-gd-online.
2. Create an R2 bucket named complet-gd-files.
3. Paste the D1 database ID into wrangler.toml.
4. From this directory, apply the schema: npx wrangler d1 execute complet-gd-online --remote --file=./schema.sql.
5. Set the Gemini secret: npx wrangler secret put GEMINI_API_KEY.
6. Deploy with npx wrangler deploy.

The Geode mod source is not yet live-tested against this API. Set the production API_BASE in src/net/ApiClient.hpp to the exact workers.dev URL after deployment. Native mod requests do not rely on CORS for authentication.

## API

- GET /health
- POST /api/auth/argon with { "accountId": 123, "token": "..." }
- POST /api/ai/chat with a Bearer project session and { "message": "...", "conversationId": "optional" }
- GET /api/ai/conversations
- GET /api/ai/conversations/:id
- POST /api/rooms
- GET /api/rooms/:roomId/state?since=<revision>
- POST /api/rooms/:roomId/events
- GET /api/storage/files
- POST /api/storage/upload as a raw-body upload with x-file-name

## Prototype limitations

The shared editor currently stores generic JSON objects and broadcasts them through two-second HTTP polling. It does not yet translate Geometry Dash native editor objects or level files. Actual live player movement/gameplay synchronization is not implemented. A persistent native WebSocket client, room invites/ownership, moderation, rate limits, abuse reporting, file downloads/deletion and a complete admin dashboard remain future work. The Worker has not been deployed or tested against a live Cloudflare account.
