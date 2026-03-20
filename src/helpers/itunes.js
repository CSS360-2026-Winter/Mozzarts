import https from "node:https";
import http from "node:http";
import zlib from "node:zlib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const GENRE_TERMS = {
  pop: ["pop", "top hits", "dance pop", "summer hits", "viral pop"],
  hiphop: ["hip hop", "rap", "trap", "drill", "r&b hip hop"],
  rock: ["rock", "alt rock", "indie rock", "classic rock", "punk rock"],
  country: ["country", "country pop", "americana", "outlaw country"],
  classical: ["classical", "piano", "orchestra", "symphony", "violin"],
  random: [
    "jazz",
    "lofi",
    "edm",
    "hip hop",
    "indie",
    "rock",
    "pop",
    "soundtrack",
    "synthwave",
    "night drive",
    "chill",
  ],
};

function decompressIfNeeded(buf, encoding) {
  try {
    if (!encoding) return buf;
    const enc = String(encoding).toLowerCase();
    if (enc.includes("gzip")) return zlib.gunzipSync(buf);
    if (enc.includes("deflate")) return zlib.inflateSync(buf);
    if (enc.includes("br")) return zlib.brotliDecompressSync(buf);
    return buf;
  } catch {
    return buf;
  }
}

function requestBuffer(urlStr, { timeoutMs = 30000, maxBytes = 12_000_000, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;

    const req = lib.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirects > 0) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          return resolve(requestBuffer(next, { timeoutMs, maxBytes, redirects: redirects - 1 }));
        }

        if (status < 200 || status >= 300) {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8").slice(0, 500);
            reject(new Error(`HTTP ${status}: ${body}`));
          });
          return;
        }

        const chunks = [];
        let size = 0;

        res.on("data", (d) => {
          size += d.length;
          if (size > maxBytes) {
            req.destroy(new Error(`Response too large (> ${maxBytes} bytes)`));
            return;
          }
          chunks.push(d);
        });

        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          const out = decompressIfNeeded(raw, res.headers["content-encoding"]);
          resolve(out);
        });
      }
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

async function requestJson(urlStr) {
  const buf = await requestBuffer(urlStr, { timeoutMs: 25000 });
  return JSON.parse(buf.toString("utf8"));
}

function getGenreTerms(genre) {
  return GENRE_TERMS[genre] ?? GENRE_TERMS.random;
}

function buildItunesSearchUrl(term) {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "50");
  url.searchParams.set("country", "US");
  return url.toString();
}

function getPreviewCandidates(results) {
  return results.filter(
    (result) => typeof result?.previewUrl === "string" && result.previewUrl.startsWith("http")
  );
}

function sanitizeTrack(track) {
  return {
    previewUrl: track.previewUrl,
    trackName: track.trackName ?? "Unknown track",
    artistName: track.artistName ?? "Unknown artist",
    primaryGenreName: track.primaryGenreName ?? "Unknown genre",
    releaseDate: track.releaseDate ?? null,
    collectionName: track.collectionName ?? null,
  };
}

async function fetchTrackForTerm(term) {
  const data = await requestJson(buildItunesSearchUrl(term));
  const results = Array.isArray(data?.results) ? data.results : [];
  const candidates = getPreviewCandidates(results);

  if (!candidates.length) {
    throw new Error("No previewUrl results.");
  }

  return sanitizeTrack(pick(candidates));
}

export async function getRandomItunesTrack(genre) {
  const terms = getGenreTerms(genre);

  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await fetchTrackForTerm(pick(terms));
    } catch {
      await sleep(350);
    }
  }

  throw new Error("Failed to get iTunes track after retries.");
}

export async function downloadPreview(previewUrl) {
  const buf = await requestBuffer(previewUrl, { timeoutMs: 35000, maxBytes: 12_000_000 });
  if (buf.length < 25_000) throw new Error(`Preview too small (${buf.length} bytes)`);

  const ext = path.extname(new URL(previewUrl).pathname) || ".m4a";
  const tmpPath = path.join(
    os.tmpdir(),
    `itunes_preview_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`
  );

  await fs.promises.writeFile(tmpPath, buf);
  return tmpPath;
}

export const _test = {
  getGenreTerms,
  buildItunesSearchUrl,
  getPreviewCandidates,
  sanitizeTrack,
};