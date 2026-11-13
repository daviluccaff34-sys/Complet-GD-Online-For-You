# Complet GD Online For You!

A Geode mod for Geometry Dash, developed first for Android 64-bit.

## Target compatibility

- Geode: **v5.11.2**
- Geometry Dash: **2.2081**
- Platform: **Android 64-bit** (initial target)

## Prototype modules

- Native hub button on the Geometry Dash main menu.
- Argon-based Geometry Dash account authentication.
- Cloudflare Worker API with D1 sessions, conversations and file metadata.
- Gemini chat endpoint with server-side API key.
- Online room creation, membership snapshots and collaborative event transport through Durable Objects.
- Shared editor-operation prototype and room chat.
- R2-backed cloud file upload endpoint with a 100 MB application limit.

## Important prototype boundaries

The shared editor currently sends and stores generic JSON marker objects. It is not yet connected to Geometry Dash's native level editor or native object serialization. The room client currently uses authenticated HTTP polling every two seconds rather than a persistent native WebSocket connection. The hub includes room chat, a shared-marker operation, cloud file listing and a text-note upload; native GD level serialization plus file download/delete UI are still pending.

The Worker must be deployed and its D1/R2/Durable Object resources created before online features can work. After deployment, replace `API_BASE` in `src/net/ApiClient.hpp` with the exact workers.dev URL. Add `GEMINI_API_KEY` as a Cloudflare secret. Never put that key in the mod or this repository.

## Development policy

The project is developed through GitHub. Compilation and release are intentionally postponed until the source and configuration have been reviewed. No build or live-server test is claimed yet.

This is an independent community project and is not affiliated with RobTop Games or the Geode team.
