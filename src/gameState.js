export const activeSessions = new Map(); // guildId -> session
export const guildPrefs = new Map();     // guildId -> { genre }

export function getGenre(guildId) {
  return guildPrefs.get(guildId)?.genre ?? "random";
}

export function setGenre(guildId, genre) {
  guildPrefs.set(guildId, { genre });
}

export function getSession(guildId) {
  return activeSessions.get(guildId) ?? null;
}

export function setSession(guildId, session) {
  activeSessions.set(guildId, session);
}

export function clearSession(guildId) {
  activeSessions.delete(guildId);
}
