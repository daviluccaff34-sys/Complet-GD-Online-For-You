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

### Remaining integration checks

The dependency declaration is now committed, but the exact Argon 1.5.1 tag has not yet been independently fetched for source-by-source review, and no Android configure/build has been run. Confirm the dependency resolves to the intended release and supports the selected Android ABI before treating the integration as build-verified.

### Current status

Argon is now declared and linked in the root CMake configuration. No authentication UI, C++ login flow, Cloudflare Worker, D1 database, or Gemini API request has been implemented. Nothing has been configured, compiled, or tested on Android.


## Verified Geode / Argon build integration

The exact Geode SDK tag `v5.11.2` was inspected. Its root `CMakeLists.txt` includes `cmake/CPM.cmake`, uses CPM-managed dependencies, and declares Geometry Dash version `2.2081` for Android. The SDK's CMake minimum is 3.25, so this project now declares CMake 3.25 as its minimum too.

The official Argon README documents this pinned dependency pattern:

```cmake
CPMAddPackage("gh:GlobedGD/argon@1.5.1")
target_link_libraries(${PROJECT_NAME} argon)
```

Argon's CMake project defines a static C++ library named `argon`, exposes its `include` directory, links against `geode-sdk`, and does not contain platform-specific exclusions in the reviewed CMake file. The dependency is added after the Geode SDK's `add_subdirectory`, following the same general CPM ordering used by the Globed project.

### Repository change

The root `CMakeLists.txt` now:
- Requires CMake 3.25.
- Adds the pinned Argon 1.5.1 package through CPM after loading the Geode SDK.
- Links the mod target against `argon`.

This is a source/configuration change only. It has not been configured or compiled, so Android ABI compatibility is not yet proven by a build. The next verification step is to inspect the exact Argon 1.5.1 tag contents and then run non-release validation/build checks only after the project owner approves that stage.

### Safer server-side token validation

Argon's server API documents `POST /v1/validation/check-data-many`, which accepts account ID and token in a JSON request body and returns validated account ID, user ID, and username. Prefer this endpoint for the Worker rather than placing the token in a GET query string. The Worker must redact request bodies and never log the token. Check for HTTP 200 and require the returned `valid` field to be exactly true before issuing a project session.

## Implementation status

Architecture and dependency configuration only. The Argon CMake dependency is committed, but authentication, Worker, D1, Gemini requests, and chat UI are not implemented. Nothing has been built or deployed.
