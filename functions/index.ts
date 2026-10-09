// The Vault backend (Cloudflare Worker). Hosts the live Arena: matchmaking, rooms, stats and admin tools.
// Players are identified by their Supabase session, verified server-side on every request.

export { ArenaHub } from "./arena/hub";
export { ArenaRoom } from "./arena/room";

type Env = {
  DO: Fetcher & {
    setAlarm(className: string, id: string, scheduledTime: number | Date): Promise<void>;
  };
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

interface Identity {
  userId: string;
  name: string;
  email: string | null;
  token: string;
}

const PRIVATE_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const PUBLIC_ID = /^pub-[a-z0-9]{6}$/;
const QUALIFIER_ID = /^q-[a-z0-9]{10}$/;
const FINAL_ID = /^f-[a-z0-9]{8}$/;
const TOURNAMENT_ID = /^t-[a-z0-9]{8}$/;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function supabaseConfig(env: Env): { url: string; key: string } | null {
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

/** Verifies a Supabase access token with the auth server and returns the player's identity. */
async function identify(request: Request, env: Env): Promise<Identity | null> {
  const url = new URL(request.url);
  const header = request.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("token");
  const config = supabaseConfig(env);
  if (!token || !config) return null;
  try {
    const res = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.key, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string; email?: string; user_metadata?: { display_name?: unknown } };
    if (!user.id) return null;
    const meta = user.user_metadata?.display_name;
    const name = typeof meta === "string" && meta.trim() ? meta.trim() : (user.email?.split("@")[0] ?? "Player");
    return { userId: user.id, name: name.slice(0, 32), email: user.email?.toLowerCase() ?? null, token };
  } catch (err) {
    console.warn("[arena] identify failed", String(err));
    return null;
  }
}

async function isAdmin(identity: Identity, env: Env): Promise<boolean> {
  const config = supabaseConfig(env);
  if (!config) return false;
  try {
    const res = await fetch(`${config.url}/rest/v1/rpc/my_admin_role`, {
      method: "POST",
      headers: { apikey: config.key, Authorization: `Bearer ${identity.token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) return false;
    const role = (await res.json()) as unknown;
    return role === "founder" || role === "admin";
  } catch {
    return false;
  }
}

function toDo(env: Env, className: string, id: string, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("X-Rork-DO-Class", className);
  headers.set("X-Rork-DO-Id", id);
  if (init?.body) headers.set("Content-Type", "application/json");
  return env.DO.fetch(new Request(`https://internal${path}`, { ...init, headers }));
}

const hub = (env: Env, path: string, init?: RequestInit) => toDo(env, "ArenaHub", "global", path, init);

function newPrivateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function validRoomId(id: string): boolean {
  return PRIVATE_CODE.test(id) || PUBLIC_ID.test(id) || QUALIFIER_ID.test(id) || FINAL_ID.test(id);
}

/** Private codes are uppercase; public, qualifier and final room ids are lowercase. */
function normalizeRoomId(raw: string): string {
  const lower = raw.toLowerCase();
  return /^(pub|q|f)-/.test(lower) ? lower : raw.toUpperCase();
}

function userQuery(identity: Identity | null): string {
  if (!identity) return "";
  const q = new URLSearchParams({ userId: identity.userId, name: identity.name });
  if (identity.email) q.set("email", identity.email);
  return q.toString();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/ping") return json({ ok: true, now: Date.now() });

      // Live room socket: /arena/room/<id>/ws?token=<supabase access token>
      const wsMatch = path.match(/^\/arena\/room\/([^/]+)\/ws$/);
      if (wsMatch && request.headers.get("Upgrade") === "websocket") {
        const normalized = normalizeRoomId(decodeURIComponent(wsMatch[1]));
        if (!validRoomId(normalized)) return new Response("invalid room", { status: 400 });
        const identity = await identify(request, env);
        if (!identity) return new Response("sign in required", { status: 401 });
        const forwardUrl = new URL(request.url);
        forwardUrl.searchParams.delete("token");
        const headers = new Headers(request.headers);
        headers.set("X-Rork-DO-Class", "ArenaRoom");
        headers.set("X-Rork-DO-Id", normalized);
        headers.set("X-Arena-User-Id", identity.userId);
        headers.set("X-Arena-User-Name", identity.name);
        headers.delete("Authorization");
        return env.DO.fetch(new Request(forwardUrl.toString(), { method: "GET", headers }));
      }

      if (path === "/arena/overview" && request.method === "GET") {
        const identity = await identify(request, env);
        const q = identity ? `?userId=${encodeURIComponent(identity.userId)}` : "";
        return json(await (await hub(env, `/overview${q}`)).json());
      }

      const identity = await identify(request, env);

      // Tournaments: anyone can browse; playing needs a session.
      if (path === "/arena/tournaments" && request.method === "GET") {
        return hub(env, `/t/list?${userQuery(identity)}`);
      }
      const tMatch = path.match(/^\/arena\/tournaments\/([^/]+)(?:\/(register|run|checkin))?$/);
      if (tMatch) {
        const tid = tMatch[1].toLowerCase();
        if (!TOURNAMENT_ID.test(tid)) return json({ error: "That tournament doesn't exist." }, 404);
        if (!tMatch[2] && request.method === "GET") return hub(env, `/t/detail?id=${tid}&${userQuery(identity)}`);
        if (tMatch[2] && request.method === "POST") {
          if (!identity) return json({ error: "Sign in to enter tournaments." }, 401);
          const body = (await request.json().catch(() => ({}))) as { code?: unknown };
          const code = typeof body.code === "string" ? body.code.slice(0, 16) : null;
          return hub(env, `/t/${tMatch[2]}?${userQuery(identity)}`, { method: "POST", body: JSON.stringify({ id: tid, code }) });
        }
      }

      if (!identity) return json({ error: "Sign in to play in the Arena." }, 401);

      if (path === "/arena/public/join" && request.method === "POST") {
        const res = await hub(env, "/assign", { method: "POST", body: JSON.stringify({ userId: identity.userId }) });
        return json(await res.json());
      }

      if (path === "/arena/private" && request.method === "POST") {
        const code = newPrivateCode();
        await toDo(env, "ArenaRoom", code, "/init", { method: "POST", body: JSON.stringify({ hostId: identity.userId }) });
        return json({ roomId: code });
      }

      const infoMatch = path.match(/^\/arena\/room\/([^/]+)$/);
      if (infoMatch && request.method === "GET") {
        const id = normalizeRoomId(decodeURIComponent(infoMatch[1]));
        if (!validRoomId(id)) return json({ exists: false });
        return json(await (await toDo(env, "ArenaRoom", id, "/info")).json());
      }

      if (path === "/arena/leaderboard" && request.method === "GET") {
        return json(await (await hub(env, `/leaderboard?userId=${encodeURIComponent(identity.userId)}`)).json());
      }

      if (path.startsWith("/arena/admin/")) {
        if (!(await isAdmin(identity, env))) return json({ error: "Admins only." }, 403);
        if (path === "/arena/admin/tournaments" && request.method === "GET") {
          return hub(env, "/t/admin/list");
        }
        const adminT = path.match(/^\/arena\/admin\/tournaments\/(save|invites|action)$/);
        if (adminT && request.method === "POST") {
          return hub(env, `/t/admin/${adminT[1]}`, { method: "POST", body: await request.text() });
        }
        if (path === "/arena/admin/state" && request.method === "GET") {
          return json(await (await hub(env, "/admin/state")).json());
        }
        if (path === "/arena/admin/exclusions" && request.method === "POST") {
          return json(await (await hub(env, "/admin/exclusions", { method: "POST", body: await request.text() })).json());
        }
        if ((path === "/arena/admin/close" || path === "/arena/admin/kick") && request.method === "POST") {
          const body = (await request.json()) as { roomId?: string; userId?: string };
          const roomId = body.roomId ?? "";
          if (!validRoomId(roomId)) return json({ error: "Unknown room." }, 400);
          if (path === "/arena/admin/close") {
            await toDo(env, "ArenaRoom", roomId, "/admin/close", { method: "POST", body: "{}" });
          } else {
            if (!body.userId) return json({ error: "Missing player." }, 400);
            await toDo(env, "ArenaRoom", roomId, "/admin/kick", { method: "POST", body: JSON.stringify({ userId: body.userId }) });
          }
          return json({ ok: true });
        }
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      console.error("[arena] request failed", path, String(err));
      return json({ error: "Something went wrong in the Arena." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
