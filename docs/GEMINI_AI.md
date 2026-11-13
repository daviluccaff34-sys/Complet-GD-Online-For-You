# Gemini AI architecture

## Product behavior

Gemini AI is a general-purpose conversational assistant available throughout the Geode mod, not only inside the level editor. It can also help with Geometry Dash topics such as triggers, groups, editor workflows, and gameplay.

Conversation history is stored in the cloud and remains available across sessions.

## Request flow

1. The Geode mod sends a chat request to the project's Cloudflare Worker.
2. The Worker authenticates the player and checks request limits.
3. The Worker loads the conversation history permitted for that player.
4. The Worker calls the Google Gemini API using a server-side secret.
5. The Worker stores the user message and assistant reply.
6. The Worker returns the reply and conversation identifier to the mod.

The Gemini API key must never be embedded in the APK, mod source, or public GitHub repository.

## Cloudflare responsibilities

- Workers: authenticated API endpoints and Gemini proxy.
- D1: structured player conversations and message history.
- Secrets: Gemini API key.
- R2: optional later use for attachments; not needed for text-only chat.

## Initial API contract

- `POST /api/ai/chat`: send a message and receive a reply.
- `GET /api/ai/conversations`: list the authenticated player's conversations.
- `GET /api/ai/conversations/:id`: retrieve one conversation belonging to the authenticated player.
- `DELETE /api/ai/conversations/:id`: delete one of the authenticated player's conversations (future UI capability).

Every endpoint must derive the player identity from a verified session/token. It must not trust a player ID supplied only in the request body or URL.

## Data model draft

- `players`: stable internal player identity and account metadata.
- `conversations`: conversation ID, player ID, title, created time, updated time.
- `messages`: message ID, conversation ID, role, content, created time.

Conversation and message queries must always be scoped to the authenticated player. Apply message length limits, rate limits, safe error handling, and retention limits before public launch.

## Geometry Dash account authentication

The selected account identity is the player's existing Geometry Dash account. The mod should integrate the Argon authentication library from Globed rather than asking the player to type their Geometry Dash password into this project's UI or sending a password/GJP to the project's Cloudflare services.

Proposed flow:

1. The mod starts Argon authentication using the supported library flow.
2. The mod receives the Argon authentication token and the associated Geometry Dash account ID from the authentication result.
3. The mod sends the token to the project's Cloudflare Worker over HTTPS.
4. The Worker validates the token against the Argon validation API and confirms it matches the supplied account ID.
5. Only after successful validation, the Worker maps the account ID to an internal player record and issues a short-lived project session.
6. The Worker stores conversations under that internal player record. The raw Argon token must not be stored in D1 or logs.

The Worker must never trust an account ID on its own. Every session must be bound to a validated Geometry Dash account, and every conversation query must be scoped to that session. If Argon validation is unavailable, sign-in must fail closed rather than silently accepting an unverified ID.

This is a proposed integration, not yet implemented. Before coding, review Argon's current Android/Geode integration instructions, license, token lifecycle, and server validation contract.

## Decisions still required

- Exact Gemini model and API version.
- Exact Gemini model and API version.
- Whether the player can clear individual conversations or all history.
- Usage limits and handling when Gemini is unavailable.


## Argon Android / Geode integration review

The official Argon client is a C++ library intended to be linked into the Geode mod; users do not need to install a separate dependency mod. The upstream README currently documents this CMake dependency:

```cmake
CPMAddPackage("gh:GlobedGD/argon@1.5.1")
target_link_libraries(${PROJECT_NAME} argon)
```

The client authentication entry point is `argon::startAuth()`, which resolves asynchronously to a `Result<std::string>` containing the Argon auth token. In Geode, the documented pattern uses `async::spawn` or an `async::TaskHolder`; do not block the game thread while authentication is running. Include `<argon/argon.hpp>`. If token/session validation fails, Argon documents `argon::clearToken()` as the recovery action before retrying authentication.

### Server validation

The Cloudflare Worker must validate the received token with the official Argon server at `https://argon.globed.dev/v1`. The basic endpoint is `GET /validation/check`, with `account_id` and `authtoken`; accept sign-in only when the HTTP status is successful and the JSON field `valid` is exactly true. Treat non-200 responses, rate limits, malformed JSON, timeouts, and unavailable Argon service as authentication failures. Never log the token, the full validation URL, or request bodies containing it.

If the project later needs the canonical Geometry Dash username and user ID, review Argon's `POST /validation/check-data-many` endpoint; its response includes the account ID, user ID, and username embedded in the validated token. Do not trust a username or user ID supplied only by the mod client.

### Session and privacy rules

- After successful Argon validation, issue the project's own short-lived session token.
- Store only the validated account identity and the project's session data in D1; do not persist the Argon token.
- Store a hash of the project's session token rather than its raw value where practical.
- Revalidate only when needed; use the project's own session to avoid calling Argon on every chat request.
- Never accept a player/account ID as proof of identity without a valid project session.
- Do not include tokens in logs, analytics, error reports, or client-visible messages.
- Use HTTPS for all requests and fail closed if validation cannot be completed.

### CMake integration gate

Do not change the root `CMakeLists.txt` yet. Before adding the Argon dependency, verify that the selected Geode SDK / project template provides `CPMAddPackage` and that the pinned Argon release supports the project's Android ABI and selected Geode toolchain. Then add the dependency and link target in a dedicated reviewed commit.

### Current status

This is an upstream-documentation review and architecture update only. Argon has not yet been added to the project's CMake configuration, no authentication UI or C++ integration has been written, and nothing has been compiled or tested on Android.

## Implementation status

Architecture only. No Worker, D1 database, Gemini API request, authentication, or mod chat UI has been implemented or tested yet. Do not treat this document as a deployed service.
