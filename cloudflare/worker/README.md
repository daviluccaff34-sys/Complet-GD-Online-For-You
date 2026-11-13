# Cloudflare prototype backend

This Worker provides the first server-side prototype for the Geode mod:

- Argon account-token validation and project sessions
- Gemini chat with D1 conversation history
- Durable Object WebSocket rooms with presence, chat and shared level-operation broadcasting
- Per-player cloud file metadata and R2 object storage (100 MB application limit)

## Create resources

1. Create a D1 database named \`complet-gd-online\`.
2. Create an R2 bucket named \`complet-gd-files\`.
3. Paste the D1 database ID into \`wrangler.toml\`.
4. From this directory, apply the schema: \`npx wrangler d1 execute complet-gd-online --remote --file=./schema.sql\`.
5. Set the Gemini secret: \`npx wrangler secret put GEMINI_API_KEY\`.
6. Deploy with \`npx wrangler deploy\`.

The Geode mod source is not yet wired to this API. Set a production \`ALLOWED_ORIGINS\` only if browser clients are used; native mod requests should not rely on CORS as an authentication mechanism.

## API

- \`GET /health\`
- \`POST /api/auth/argon\` with \`{ "accountId": 123, "token": "..." }\`
- \`POST /api/ai/chat\` with a Bearer project session and \`{ "message": "...", "conversationId": "optional" }\`
- \`GET /api/ai/conversations\`
- \`GET /api/ai/conversations/:id\`
- \`POST /api/rooms\`
- \`GET /api/rooms/:roomId/connect\` as an authenticated WebSocket upgrade
- \`GET /api/storage/files\`
- \`POST /api/storage/upload\` as a raw-body upload with \`x-file-name\`

## Prototype limitations

The shared editor currently stores and broadcasts a generic JSON object list. It does not yet read or write Geometry Dash's native level format, and its operation validation must be tightened before public use. Room membership, moderation, invite permissions, rate limits, abuse reporting, file downloads/deletion, and production observability are follow-up work. The Worker has not been deployed or tested against a real Cloudflare account.
