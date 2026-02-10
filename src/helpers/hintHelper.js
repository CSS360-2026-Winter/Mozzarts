function safeYear(releaseDate) {
  try {
    const d = new Date(releaseDate);
    return Number.isFinite(d.getFullYear()) ? String(d.getFullYear()) : "Unknown";
  } catch {
    return "Unknown";
  }
}

function stripParensAndDash(title) {
  if (!title) return "";
  // remove "(...)" and "- ..." variants for simpler guessing/hints
  return String(title)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*-\s*.*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function maskLetters(s, reveal = 1) {
  const out = [];
  for (const word of s.split(/\s+/)) {
    if (!word) continue;
    out.push(word.slice(0, Math.max(1, reveal)) + "•".repeat(Math.max(0, word.length - Math.max(1, reveal))));
  }
  return out.join(" ");
}

export function makeHint(track, stage = 1, difficulty = "easy") {
  const titleRaw = track?.trackName ?? "Unknown Title";
  const artist = track?.artistName ?? "Unknown Artist";
  const genre = track?.primaryGenreName ?? "Unknown Genre";
  const year = safeYear(track?.releaseDate);

  const title = stripParensAndDash(titleRaw);
  const titleWords = title.split(/\s+/).filter(Boolean);
  const titleInitials = titleWords.map(w => w[0]?.toUpperCase() ?? "?").join(" ");

  // stage-based hint progression
  if (stage === 1) {
    // always safe hint
    if (difficulty === "easy") return `Genre: **${genre}** • Year: **${year}**`;
    if (difficulty === "medium") return `Title initials: **${titleInitials}**`;
    return `Genre: **${genre}**`;
  }

  if (stage === 2) {
    if (difficulty === "easy") return `Artist: **${artist}**`;
    if (difficulty === "medium") return `Title masked: **${maskLetters(title, 2)}**`;
    return `Year: **${year}**`;
  }

  // stage 3+
  if (difficulty === "easy") return `Title masked: **${maskLetters(title, 2)}**`;
  if (difficulty === "medium") return `Artist masked: **${maskLetters(artist, 2)}**`;
  return `Title initials: **${titleInitials}**`;
}
