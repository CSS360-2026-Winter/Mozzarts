const store = new Map(); // guildId -> Map(userId -> points)

export function resetScores(guildId) {
  store.set(guildId, new Map());
}

export function addPoints(guildId, userId, points) {
  if (!store.has(guildId)) store.set(guildId, new Map());
  const g = store.get(guildId);
  g.set(userId, (g.get(userId) ?? 0) + points);
}

export function getUserPoints(guildId, userId) {
  return store.get(guildId)?.get(userId) ?? 0;
}

export function getGuildScoresSorted(guildId) {
  const g = store.get(guildId) ?? new Map();
  return [...g.entries()].sort((a, b) => b[1] - a[1]); // [userId, points]
}

export function getTotalScore(guildId) {
  const g = store.get(guildId) ?? new Map();
  let total = 0;
  for (const v of g.values()) total += v;
  return total;
}
