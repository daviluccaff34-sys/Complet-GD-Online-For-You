const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_CHAT_CHARS = 4000;
const MAX_ROOM_MESSAGE = 64 * 1024;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}
function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : (allowed.length ? "null" : "*");
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-file-name",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}
function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors(request, env))) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
async function bodyJson(request, max = 16_384) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > max) throw new Error("REQUEST_TOO_LARGE");
  const raw = await request.text();
  if (raw.length > max) throw new Error("REQUEST_TOO_LARGE");
  return JSON.parse(raw);
}
function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function bearer(request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}
async function playerFromSession(request, env) {
  const token = bearer(request);
  if (!token || token.length > 256) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT s.player_id, p.account_id, p.username FROM sessions s JOIN players p ON p.id=s.player_id WHERE s.token_hash=? AND s.expires_at>?"
  ).bind(hash, Date.now()).first();
  return row || null;
}
function safeName(value) {
  return String(value || "level.gmd").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "level.gmd";
}
async function authenticateArgon(request, env) {
  const body = await bodyJson(request, 12_000);
  const accountId = Number(body.accountId);
  const token = String(body.token || "");
  if (!Number.isSafeInteger(accountId) || accountId <= 0 || token.length < 8 || token.length > 8192) {
    return json({ error: "Dados de autenticação inválidos." }, 400);
  }

  // Argon's documented validation API is GET /v1/validation/check.
  // The token is sent only to Argon's official HTTPS endpoint; never log this URL.
  const validationUrl = new URL("https://argon.globed.dev/v1/validation/check");
  validationUrl.searchParams.set("account_id", String(accountId));
  validationUrl.searchParams.set("authtoken", token);
  let validation;
  try {
    const response = await fetch(validationUrl, { method: "GET", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return json({ error: "Não foi possível validar a conta agora." }, 502);
    validation = await response.json();
  } catch {
    return json({ error: "Serviço de autenticação indisponível." }, 502);
  }
  if (validation.valid !== true) return json({ error: "A autenticação da conta Geometry Dash falhou." }, 401);

  const session = randomToken();
  const tokenHash = await sha256(session);
  const now = Date.now();
  const expires = now + 7 * 24 * 60 * 60 * 1000;
  await env.DB.prepare(
    "INSERT INTO players (id, account_id, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET username=excluded.username, updated_at=excluded.updated_at"
  ).bind(crypto.randomUUID(), accountId, String(validation.username || "GD Player").slice(0, 32), now, now).run();
  const player = await env.DB.prepare("SELECT id, account_id, username FROM players WHERE account_id=?").bind(accountId).first();
  await env.DB.prepare("INSERT INTO sessions (token_hash, player_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, player.id, expires, now).run();
  return json({ sessionToken: session, expiresAt: expires, player: { accountId: player.account_id, username: player.username } });
}
async function aiChat(request, env, player) {
  if (!env.GEMINI_API_KEY) return json({ error: "IA ainda não configurada no servidor." }, 503);
  const body = await bodyJson(request, 24_000);
  const message = String(body.message || "").trim();
  if (!message || message.length > MAX_CHAT_CHARS) return json({ error: "A mensagem deve ter entre 1 e 4000 caracteres." }, 400);

  let conversationId = String(body.conversationId || "");
  if (conversationId) {
    const owned = await env.DB.prepare("SELECT id FROM conversations WHERE id=? AND player_id=?")
      .bind(conversationId, player.player_id).first();
    if (!owned) return json({ error: "Conversa não encontrada." }, 404);
  } else {
    conversationId = crypto.randomUUID();
    const title = message.slice(0, 80);
    await env.DB.prepare("INSERT INTO conversations (id, player_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(conversationId, player.player_id, title, Date.now(), Date.now()).run();
  }

  const recent = await env.DB.prepare(
    "SELECT role, content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 20"
  ).bind(conversationId).all();
  const history = (recent.results || []).reverse().map(row => ({
    role: row.role === "assistant" ? "model" : "user",
    parts: [{ text: row.content }]
  }));
  await env.DB.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)")
    .bind(crypto.randomUUID(), conversationId, message, Date.now()).run();

  const systemInstruction = "Você é a assistente do Complet GD Online For You!, um mod comunitário de Geometry Dash. Converse naturalmente em português quando o jogador usar português. Ajude com Geometry Dash, editor, triggers, grupos, objetos, gameplay e também assuntos gerais. Explique passo a passo e não invente recursos que não existem. Se não souber, diga.";
  let answer = "";
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [...history, { role: "user", parts: [{ text: message }] }],
          generationConfig: { maxOutputTokens: 1200 }
        }),
        signal: AbortSignal.timeout(30_000)
      }
    );
    if (!response.ok) return json({ error: "A IA não conseguiu responder agora." }, 502);
    const data = await response.json();
    answer = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
    if (!answer) return json({ error: "A IA retornou uma resposta vazia." }, 502);
  } catch {
    return json({ error: "Não foi possível conectar à IA." }, 502);
  }
  const now = Date.now();
  await env.DB.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)")
    .bind(crypto.randomUUID(), conversationId, answer, now).run();
  await env.DB.prepare("UPDATE conversations SET updated_at=? WHERE id=? AND player_id=?")
    .bind(now, conversationId, player.player_id).run();
  return json({ conversationId, answer });
}
async function listConversations(env, player) {
  const result = await env.DB.prepare(
    "SELECT id, title, created_at, updated_at FROM conversations WHERE player_id=? ORDER BY updated_at DESC LIMIT 50"
  ).bind(player.player_id).all();
  return json({ conversations: result.results || [] });
}
async function getConversation(env, player, id) {
  const conversation = await env.DB.prepare("SELECT id, title FROM conversations WHERE id=? AND player_id=?")
    .bind(id, player.player_id).first();
  if (!conversation) return json({ error: "Conversa não encontrada." }, 404);
  const result = await env.DB.prepare(
    "SELECT role, content, created_at FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 200"
  ).bind(id).all();
  return json({ conversation, messages: result.results || [] });
}
async function storageUpload(request, env, player) {
  if (!env.FILES) return json({ error: "Armazenamento ainda não configurado." }, 503);
  const length = Number(request.headers.get("content-length") || 0);
  if (!length || length > MAX_FILE_BYTES) return json({ error: "Arquivo vazio ou acima do limite de 100 MB." }, 413);
  const name = safeName(request.headers.get("x-file-name"));
  const key = player.player_id + "/" + crypto.randomUUID() + "/" + name;
  await env.FILES.put(key, request.body, {
    httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" },
    customMetadata: { playerId: player.player_id, fileName: name }
  });
  await env.DB.prepare("INSERT INTO files (id, player_id, object_key, file_name, size, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), player.player_id, key, name, length, Date.now()).run();
  return json({ name, size: length });
}
async function storageList(env, player) {
  const result = await env.DB.prepare("SELECT id, file_name, size, created_at FROM files WHERE player_id=? ORDER BY created_at DESC LIMIT 100")
    .bind(player.player_id).all();
  return json({ files: result.results || [] });
}

export class RoomHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Map();
  }
  async fetch(request) {
    const url = new URL(request.url);
    const player = {
      playerId: request.headers.get("x-player-id") || "",
      username: request.headers.get("x-player-name") || "Player"
    };
    if (!player.playerId) return new Response("Unauthorized", { status: 401 });

    if (url.pathname === "/state" && request.method === "GET") {
      const now = Date.now();
      const presence = (await this.state.storage.get("presence")) || {};
      presence[player.playerId] = { ...player, seenAt: now };
      for (const [id, member] of Object.entries(presence)) if (now - member.seenAt > 30_000) delete presence[id];
      await this.state.storage.put("presence", presence);
      const levelState = (await this.state.storage.get("levelState")) || { objects: [], revision: 0 };
      const events = (await this.state.storage.get("events")) || [];
      const since = Math.max(0, Number(url.searchParams.get("since") || 0));
      return Response.json({
        state: levelState,
        revision: levelState.revision || 0,
        members: Object.values(presence),
        events: events.filter(event => event.revision > since).slice(-200)
      });
    }

    if (url.pathname === "/events" && request.method === "POST") {
      const raw = await request.text();
      if (raw.length > MAX_ROOM_MESSAGE) return new Response("Message too large", { status: 413 });
      let message;
      try { message = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
      if (!message || !["chat", "level_operation"].includes(message.type)) return new Response("Invalid event", { status: 400 });
      const events = (await this.state.storage.get("events")) || [];
      const levelState = (await this.state.storage.get("levelState")) || { objects: [], revision: 0 };
      const event = { ...message, player, at: Date.now(), revision: Number(levelState.revision || 0) + 1 };
      if (message.type === "chat") event.text = String(message.text || "").trim().slice(0, 500);
      if (message.type === "level_operation") {
        const op = message.operation;
        if (!op || !["add", "update", "delete"].includes(op.action)) return new Response("Invalid operation", { status: 400 });
        if (op.action === "add" && levelState.objects.length < 20_000) levelState.objects.push(op.object);
        if (op.action === "update") {
          const index = levelState.objects.findIndex(x => x && x.id === op.id);
          if (index >= 0) levelState.objects[index] = op.object;
        }
        if (op.action === "delete") levelState.objects = levelState.objects.filter(x => x && x.id !== op.id);
        levelState.revision = event.revision;
        await this.state.storage.put("levelState", levelState);
      } else {
        levelState.revision = event.revision;
        await this.state.storage.put("levelState", levelState);
      }
      events.push(event);
      await this.state.storage.put("events", events.slice(-1000));
      this.broadcast(event);
      return Response.json({ ok: true, revision: event.revision });
    }

    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket required", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.clients.set(server, player);
    server.addEventListener("message", event => this.onMessage(server, event.data));
    server.addEventListener("close", () => this.clients.delete(server));
    server.addEventListener("error", () => this.clients.delete(server));
    server.send(JSON.stringify({ type: "welcome", player, members: [...this.clients.values()] }));
    this.broadcast({ type: "presence", members: [...this.clients.values()] }, server);
    const saved = await this.state.storage.get("levelState");
    if (saved) server.send(JSON.stringify({ type: "level_snapshot", state: saved }));
    return new Response(null, { status: 101, webSocket: client });
  }
  async onMessage(sender, raw) {
    if (typeof raw !== "string" || raw.length > MAX_ROOM_MESSAGE) return;
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    const player = this.clients.get(sender);
    if (!player || !message || typeof message.type !== "string") return;
    if (message.type === "ping") {
      sender.send(JSON.stringify({ type: "pong", at: Date.now() }));
      return;
    }
    if (message.type === "level_operation") {
      const operation = message.operation;
      if (!operation || typeof operation !== "object" || !["add", "update", "delete"].includes(operation.action)) return;
      // The prototype broadcasts operations and persists the latest shared state.
      // A production editor must translate/validate every GD object field before accepting it.
      const state = (await this.state.storage.get("levelState")) || { objects: [], revision: 0 };
      if (operation.action === "add" && state.objects.length < 20_000) state.objects.push(operation.object);
      if (operation.action === "update") {
        const index = state.objects.findIndex(x => x && x.id === operation.id);
        if (index >= 0) state.objects[index] = operation.object;
      }
      if (operation.action === "delete") state.objects = state.objects.filter(x => x && x.id !== operation.id);
      state.revision = Number(state.revision || 0) + 1;
      await this.state.storage.put("levelState", state);
      this.broadcast({ type: "level_operation", player, operation, revision: state.revision });
      return;
    }
    if (message.type === "chat") {
      const text = String(message.text || "").trim().slice(0, 500);
      if (text) this.broadcast({ type: "chat", player, text, at: Date.now() });
    }
  }
  broadcast(message, except = null) {
    const payload = JSON.stringify(message);
    for (const socket of this.clients.keys()) {
      if (socket === except) continue;
      try { socket.send(payload); } catch { this.clients.delete(socket); }
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), request, env);
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      let response;
      if (path === "/health" && request.method === "GET") response = json({ ok: true, service: "complet-gd-api", version: "prototype" });
      else if (path === "/api/auth/argon" && request.method === "POST") response = await authenticateArgon(request, env);
      else {
        const player = await playerFromSession(request, env);
        if (!player) response = json({ error: "Sessão inválida ou expirada." }, 401);
        else if (path === "/api/ai/chat" && request.method === "POST") response = await aiChat(request, env, player);
        else if (path === "/api/ai/conversations" && request.method === "GET") response = await listConversations(env, player);
        else if (path.startsWith("/api/ai/conversations/") && request.method === "GET") response = await getConversation(env, player, path.split("/").pop());
        else if (path === "/api/rooms" && request.method === "POST") {
          const roomId = randomToken(6).toUpperCase().replaceAll("_", "A").replaceAll("-", "B").slice(0, 8);
          response = json({ roomId });
        } else if (path.startsWith("/api/rooms/")) {
          const parts = path.split("/");
          const roomId = parts[3];
          const action = parts[4];
          if (!/^[A-Za-z0-9_-]{4,32}$/.test(roomId || "") || !["connect", "state", "events"].includes(action)) {
            response = json({ error: "Código de sala ou ação inválida." }, 400);
          } else {
            const id = env.ROOMS.idFromName(roomId);
            const stub = env.ROOMS.get(id);
            const target = action === "connect" ? "connect" : action;
            const forwarded = new Request("https://room.internal/" + target + url.search, request);
            const headers = new Headers(forwarded.headers);
            headers.set("x-player-id", player.player_id);
            headers.set("x-player-name", player.username || "Player");
            response = await stub.fetch(new Request(forwarded, { headers }));
          }
        } else if (path === "/api/storage/files" && request.method === "GET") response = await storageList(env, player);
        else if (path === "/api/storage/upload" && request.method === "POST") response = await storageUpload(request, env, player);
        else response = json({ error: "Rota não encontrada." }, 404);
      }
      return withCors(response, request, env);
    } catch (error) {
      const status = error?.message === "REQUEST_TOO_LARGE" ? 413 : 400;
      return withCors(json({ error: status === 413 ? "Requisição muito grande." : "Não foi possível processar a requisição." }, status), request, env);
    }
  }
};
