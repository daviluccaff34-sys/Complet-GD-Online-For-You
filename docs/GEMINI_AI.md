# Gemini AI and account architecture

## Behavior

Gemini is a general-purpose assistant available from the mod hub, not only inside the level editor. It should answer ordinary conversation naturally and help with Geometry Dash topics such as triggers, groups, editor workflows, objects and gameplay. Conversation history is stored in D1 and scoped to the authenticated Geometry Dash account.

## Client-to-server flow

1. The mod calls Argon from the game thread and receives an authentication token asynchronously.
2. The mod sends the token and account ID to the Cloudflare Worker over HTTPS.
3. The Worker validates them with the official Argon endpoint.
4. The Worker creates an internal player record and a random project session. Only a SHA-256 hash of the project session is stored in D1.
5. The mod sends the project session as a Bearer token for later API requests.
6. The Worker loads only the authenticated player's conversation history and calls Gemini using a server-side secret.

The mod never asks the player to type their Geometry Dash password or GJP. The raw Argon token is not stored in D1 or written to logs. The project session currently remains in memory for the running mod and expires after seven days on the server.

## Argon validation

The pinned client library is GlobedGD/argon v1.5.1. Its header defines argon::AccountData with account ID, user ID, username and private login data. The wrapper exposes only the account ID, user ID, username and the asynchronous token result; it does not expose the full AccountData object to the UI.

The Worker currently calls the documented Argon endpoint:

- GET https://argon.globed.dev/v1/validation/check
- Query parameters: account_id and authtoken
- Sign-in is accepted only when the HTTP response succeeds and JSON valid is exactly true.

The token is sent only to Argon's HTTPS endpoint. Never log the validation URL or token. Fail closed on timeouts, invalid responses, non-success HTTP status or invalid tokens.

## Worker endpoints

- POST /api/auth/argon
- POST /api/ai/chat
- GET /api/ai/conversations
- GET /api/ai/conversations/:id
- POST /api/rooms
- GET /api/rooms/:roomId/state?since=<revision>
- POST /api/rooms/:roomId/events
- GET /api/storage/files
- POST /api/storage/upload

All endpoints except health and Argon sign-in require a valid project session. Player identity is derived from the session, never from a client-supplied account ID.

## Gemini

The Worker calls Gemini's gemini-3.8-flash generateContent endpoint. Set GEMINI_API_KEY as a Cloudflare Worker secret; never put it in mod.json, C++, GitHub Actions logs or the public repository. The prompt asks the assistant to speak naturally, prefer the player's language, explain GD concepts step by step and admit uncertainty.

The initial client UI keeps one conversation ID in memory while the hub remains open. D1 stores the conversation and message history. Conversation listing and retrieval endpoints exist for the next history-screen iteration.

## Cloudflare services

- Workers: API and Gemini proxy.
- D1: player records, hashed sessions, conversations, messages and file metadata.
- Durable Objects: per-room state, member presence, event revisions and shared editor-operation transport.
- R2: private per-player file objects.

The Worker enforces a 100 MB application upload limit. The initial UI uploads a text note as a smoke-test path; native level-file import/export, download and deletion are not implemented yet.

## Prototype boundaries and next work

- Room communication uses authenticated HTTP polling every two seconds. A persistent native WebSocket client is not connected yet.
- The shared editor stores generic JSON marker objects; it is not integrated with Geometry Dash's native editor object model or level serialization.
- The prototype does not synchronize actual live player movement or gameplay state.
- Add room invite permissions, ownership, moderation, rate limits, quotas and stronger validation before public launch.
- Add native level import/export and a full file browser.
- Add a persistent conversation list and delete-history controls.
- Deploy Worker, D1, R2 and Durable Object bindings, then set the real workers.dev URL in src/net/ApiClient.hpp.

No Android build or live Cloudflare test has been run yet. Source-level integration is not the same as a tested release.
