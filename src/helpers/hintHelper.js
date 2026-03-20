// Simple hint generator for music trivia tracks.
// Each question type maps to a deterministic single-purpose hint format,
// which makes the helper easier to unit test.

function getTrackMetadata(track = {}) {
  const releaseDate = new Date(track.releaseDate);
  const releaseYear = Number.isFinite(releaseDate.getFullYear())
    ? String(releaseDate.getFullYear())
    : "unknown";

  return {
    artist: track.artistName || "unknown",
    title: track.trackName || "unknown",
    album: track.collectionName || "unknown",
    genre: track.primaryGenreName || "unknown",
    year: releaseYear,
  };
}

function firstCharacterOf(value) {
  return String(value || "unknown").trim().charAt(0).toUpperCase() || "?";
}

function buildHintMessages(metadata) {
  return {
    artist: `Artist starts with **${firstCharacterOf(metadata.artist)}**`,
    genre: `Genre starts with **${firstCharacterOf(metadata.genre)}**`,
    album: `Album starts with **${firstCharacterOf(metadata.album)}**`,
    title: `Title starts with **${firstCharacterOf(metadata.title)}**`,
    year: `Year of release starts with **${firstCharacterOf(metadata.year)}**`,
  };
}

export function makeHint(track, type = "artist") {
  const hintMessages = buildHintMessages(getTrackMetadata(track));
  return hintMessages[type] || "Could not get a hint for this song.";
}

export const _test = {
  getTrackMetadata,
  buildHintMessages,
  firstCharacterOf,
};