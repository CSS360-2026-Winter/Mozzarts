import { SlashCommandBuilder, ChannelType, MessageFlags } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  generateDependencyReport,
} from "@discordjs/voice";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import zlib from "node:zlib";
import rules from "../events/rules.js";

// This is so that the bot can know which channel to join and play music in.
const VOICE_CHANNEL_NAME = "Game";
const TEXT_CHANNEL_NAME = "game"; // your channel is #game


const activeGuilds = new Set();
// Genres/terms to search for songs
const TERMS = [
  "jazz", "lofi", "edm", "hip hop", "indie", "rock", "pop",
  "soundtrack", "synthwave", "night drive", "chill"
];
// sleep helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// picker helper
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// logging helpers
function log(...args) {
  console.log(`[game] ${new Date().toISOString()}`, ...args);
}
function logErr(...args) {
  console.error(`[game] ${new Date().toISOString()} ERROR`, ...args);
}
// finds the voice channel by the VOICE_CHANNEL_NAME
function findVoiceChannel(guild) {
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name === VOICE_CHANNEL_NAME
  ) ?? null;
}
// finds the text channel by the TEXT_CHANNEL_NAME
function findTextChannel(guild, fallbackChannel) {
  const tc =
    guild.channels.cache.find((c) => {
      const okType =
        c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement;
      return okType && c.name.toLowerCase() === TEXT_CHANNEL_NAME.toLowerCase();
    }) ?? null;
  return tc ?? fallbackChannel ?? null;
}
// Decompression helper for the request buffer
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

        // redirects
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
// This functions gets a random preview url from the iTunes API
async function getRandomItunesPreview() {
  // Has 6 attempts to get a valid preview url.
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const term = pick(TERMS);
      const url = new URL("https://itunes.apple.com/search");
      // The following are the search parameters for the iTunes API
      url.searchParams.set("term", term);
      url.searchParams.set("media", "music");
      url.searchParams.set("entity", "song");
      url.searchParams.set("limit", "50");
      url.searchParams.set("country", "US");
      // Log the attempt, helpful for debugging.
      log(`iTunes search attempt ${attempt} term="${term}"`);
      // Request the json data from the iTunes API
      const data = await requestJson(url.toString());

      // Checks if the results are valid and contain a preview(prevents crashes)
      const results = Array.isArray(data?.results) ? data.results : [];
      // filters out the invalid results that do not have a previewUrl or preview is not a valid url 
      // that starts with https.
      const candidates = results.filter(
        (r) => typeof r?.previewUrl === "string" && r.previewUrl.startsWith("http")
      );
      // if no candidates, throw an error (signals a retry)
      if (!candidates.length) throw new Error("No previewUrl results.");
      // pick a random track from the candidates
      const track = pick(candidates);
      //returns a preview url, track name, and artist name.
      return {
        previewUrl: track.previewUrl,
        trackName: track.trackName ?? "Unknown track",
        artistName: track.artistName ?? "Unknown artist",
      };
      // we catch and retry on failure
    } catch (e) {
      logErr(`iTunes search failed attempt ${attempt}:`, e?.stack || e);
      await sleep(400);
    }
  }
  // all attempts have failed, throw an error.
  throw new Error("Failed to get iTunes previewUrl after retries.");
}

// download a preview from iTunes to a temp file that we can play taken from a valid url.
async function downloadToTempFile(previewUrl) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      log(`download attempt ${attempt}: ${previewUrl}`);
      const buf = await requestBuffer(previewUrl, { timeoutMs: 35000, maxBytes: 12_000_000 });

      if (buf.length < 25_000) throw new Error(`Preview too small (${buf.length} bytes)`);

      const ext = path.extname(new URL(previewUrl).pathname) || ".m4a";
      // Create a temp file path
      const tmpPath = path.join(
        os.tmpdir(),
        `itunes_preview_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`
      );

      await fs.promises.writeFile(tmpPath, buf);
      log(`saved temp file: ${tmpPath} (${buf.length} bytes)`);
      return tmpPath;
    } catch (e) {
      logErr(`download failed attempt ${attempt}:`, e?.stack || e);
      await sleep(600);
    }
  }
  throw new Error("Failed to download preview after retries.");
}

async function safeUnlink(p) {
  try { await fs.promises.unlink(p); } catch {}
}
// Plays a song in the vc provided by the file path
async function playFileInVoice(guild, vc, filePath) {
  log("voice dependency report:\n" + generateDependencyReport());

  const connection = joinVoiceChannel({
  channelId: vc.id,
  guildId: guild.id,
  adapterCreator: vc.guild.voiceAdapterCreator,
  selfDeaf: false,
});


  connection.on("stateChange", (oldState, newState) => {
    log(`VC state: ${oldState.status} -> ${newState.status}`);
  });

  try {
    // fails in terminal
    await entersState(connection, VoiceConnectionStatus.Ready, 10000);

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
    });

    player.on("stateChange", (o, n) => log(`Player state: ${o.status} -> ${n.status}`));
    player.on("error", (e) => logErr("Player error:", e?.stack || e));

    const resource = createAudioResource(filePath, { inputType: StreamType.Arbitrary });

    const sub = connection.subscribe(player);
    if (!sub) throw new Error("Failed to subscribe player to connection.");

    player.play(resource);

    await entersState(player, AudioPlayerStatus.Playing, 15000);

    const hardStop = setTimeout(() => {
      log("hard stop");
      try { player.stop(true); } catch {}
    }, 35_000);

    await new Promise((resolve, reject) => {
      player.once(AudioPlayerStatus.Idle, resolve);
      player.once("error", reject);
    });

    clearTimeout(hardStop);
    log("playback finished");
  } finally {
    try { connection.destroy(); } catch {}
    log("left voice");
  }
}

// Maybe better organizations? 
// Essentially have the actual game logic run on a command named music_trivia?
export default {
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Downloads a random 30s preview, plays it, then does a 30s countdown."),

  async execute(interaction) {
    
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: "Guild only.", flags: MessageFlags.Ephemeral });
    }
    
    if (activeGuilds.has(guild.id)) {
      return interaction.reply({ content: "Already running.", flags: MessageFlags.Ephemeral });
    }
    activeGuilds.add(guild.id);

    let statusMsg = null;
    let tempFile = null;

    try {
      await interaction.deferReply({ ephemeral: true });

      const vc = findVoiceChannel(guild);
      if (!vc) throw new Error(`Missing voice channel "${VOICE_CHANNEL_NAME}"`);

      const tc = findTextChannel(guild, interaction.channel);

      if (tc) {
        // added rules explanation
        await rules.execute(tc, true);
        // Just the amount of time the user has to read
        // the rules
        statusMsg = await tc.send("Game will start soon! Make sure to read over the rules!");
        for (let c = 20; c >= 0; c--) {
          await statusMsg.edit(`Time before game starts: ${c}`);
          // one second delay
          await sleep(1000);
        }
        statusMsg = await tc.send("Downloading song...");
      } 

      log("starting /game");

      const track = await getRandomItunesPreview();
      tempFile = await downloadToTempFile(track.previewUrl);

      // play then leave
      await playFileInVoice(guild, vc, tempFile);

      // delete temp file
      await safeUnlink(tempFile);
      tempFile = null;

      // countdown AFTER playback
      if (statusMsg) {
        for (let r = 20; r >= 0; r--) {
          await statusMsg.edit(`⏳ ${r}`);
          // one second delay
          await sleep(1000);
        }
        // TODO: have a guessing phase before revealing the answer,
        // Key component for the game, High priority.
        // reveal track name ONLY after countdown
        await statusMsg.edit(`✅ ${track.trackName} — ${track.artistName}`);
      }

      await interaction.editReply("Done.");
    } catch (err) {
      logErr("COMMAND FAILED:", err?.stack || err);
      // keep channel clean, detailed error stays in terminal
      try { if (statusMsg) await statusMsg.edit("❌ Failed"); } catch {}
      try { await interaction.editReply("❌ Failed"); } catch {}
    } finally {
      if (tempFile) await safeUnlink(tempFile);
      activeGuilds.delete(guild.id);
      log("finished /game");
    }
  },
};
