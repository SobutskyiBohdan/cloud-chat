import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw new Error("REDIS_URL environment variable is required");

let _redis: Redis | null = null;
let _pub: Redis | null = null;
let _sub: Redis | null = null;

function addErrorHandler(client: Redis): Redis {
  client.on("error", (err) => console.error("[Redis] error:", err.message));
  return client;
}

export function getRedis(): Redis {
  if (!_redis) _redis = addErrorHandler(new Redis(REDIS_URL, { maxRetriesPerRequest: 3 }));
  return _redis;
}

export function getPubClient(): Redis {
  if (!_pub) _pub = addErrorHandler(new Redis(REDIS_URL, { maxRetriesPerRequest: null }));
  return _pub;
}

export function getSubClient(): Redis {
  if (!_sub) _sub = addErrorHandler(new Redis(REDIS_URL, { maxRetriesPerRequest: null }));
  return _sub;
}

export const REDIS_KEYS = {
  session: (userId: string) => `session:${userId}`,
  blocked: (userId: string) => `blocked:${userId}`,
  activeSockets: "active_sockets",
  activeConnections: "stats:active_connections",
  messagesCount: "stats:messages_today",
};

export const REDIS_CHANNELS = {
  blockUser: "admin:block_user",
  unblockUser: "admin:unblock_user",
  globalSettings: "admin:global_settings",
};
