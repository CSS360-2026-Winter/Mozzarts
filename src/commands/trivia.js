import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
} from "discord.js";

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
} from "@discordjs/voice";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import zlib from "node:zlib";

import { getGenre, getSession, setSession, clearSession } from "../gameState.js";
import { resetScores, addPoints, getGuildScoresSorted } from "../scoreStore.js";
import { makeHint } from "../helpers/hintHelper.js";

const VOICE_CHANNEL_NAME = "Game";
const TEXT_CHANNEL_NAME = "game";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function findVoiceChannel(guild) {
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name === VOICE_CHANNEL_NAME
  ) ?? null;
}

function findTextChannel(guild, fallbackChannel) {
  const tc =
    guild.channels.cache.find((c) => {
      const okType = c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement;
      return okType && c.name.toLowerCase() === TEXT_CHANNEL_NAME.toLowerCase();
    }) ?? null;
  return tc ?? fallbackChannel ?? null;
}

function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTitleVariants(title) {
  const t = String(title ?? "");
  const noParens = t.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const noDash = noParens.replace(/\s*-\s*.*$/g, "").trim();
  return [t, noParens, noDash].filter(Boolean);
}

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

const GENRE_TERMS = {
  pop: ["pop", "top hits", "dance pop", "summer hits", "viral pop"],
  hiphop: ["hip hop", "rap", "trap", "drill", "r&b hip hop"],
  rock: ["rock", "alt rock", "indie rock", "classic rock", "punk rock"],
  country: ["country", "country pop", "americana", "outlaw country"],
  classical: ["classical", "piano", "orchestra", "symphony", "violin"],
  random: ["jazz", "lofi", "edm", "hip hop", "indie", "rock", "pop", "soundtrack", "synthwave", "night drive", "chill"],
};

async function getRandomItunesTrack(genre) {
  const terms = GENRE_TERMS[genre] ?? GENRE_TERMS.random;

  for (let attempt = 1; attempt <= 6; attempt++) {
    const term = pick(terms);
    const url = new URL("https://itunes.apple.com/search");
    url.searchParams.set("term", term);
    url.searchParams.set("media", "music");
    url.searchParams.set("entity", "song");
    url.searchParams.set("limit", "50");
    url.searchParams.set("country", "US");

    try {
      const data = await requestJson(url.toString());
      const results = Array.isArray(data?.results) ? data.results : [];
      const candidates = results.filter(
        (r) => typeof r?.previewUrl === "string" && r.previewUrl.startsWith("http")
      );
      if (!candidates.length) throw new Error("No previewUrl results.");
      const track = pick(candidates);

      return {
        previewUrl: track.previewUrl,
        trackName: track.trackName ?? "Unknown track",
        artistName: track.artistName ?? "Unknown artist",
        primaryGenreName: track.primaryGenreName ?? "Unknown genre",
        releaseDate: track.releaseDate ?? null,
        collectionName: track.collectionName ?? null,
      };
    } catch {
      await sleep(350);
    }
  }

  throw new Error("Failed to get iTunes track after retries.");
}

async function downloadToTempFile(previewUrl) {
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

async function safeUnlink(p) {
  try { await fs.promises.unlink(p); } catch {}
}

async function waitForUserInVC(guild, userId, vcId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const inVc = member?.voice?.channelId === vcId;
    if (inVc) return true;
    await sleep(2500);
  }
  return false;
}

async function ensureVoice(guild, vc) {
  const connection = joinVoiceChannel({
    channelId: vc.id,
    guildId: guild.id,
    adapterCreator: vc.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 30000);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  connection.subscribe(player);
  return { connection, player };
}

async function playPreview(player, filePath) {
  const resource = createAudioResource(filePath, { inputType: StreamType.Arbitrary });
  player.play(resource);

  await entersState(player, AudioPlayerStatus.Playing, 15000);

  // hard stop at ~32s to match “30 seconds”
  const stopper = setTimeout(() => {
    try { player.stop(true); } catch {}
  }, 32000);

  await new Promise((resolve) => player.once(AudioPlayerStatus.Idle, resolve));
  clearTimeout(stopper);
}

function pointsFor(difficulty, hintsUsed) {
  const base = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
  return Math.max(1, base - (hintsUsed ?? 0));
}

function maxHintsFor(difficulty) {
  if (difficulty === "easy") return 2;
  if (difficulty === "medium") return 1;
  return 1; // hard still allows 1 hint (flowchart shows hint path)
}

function isCorrectGuess(msgContent, track, difficulty) {
  const guess = normalize(msgContent);

  const titleVariants = stripTitleVariants(track.trackName).map(normalize).filter(Boolean);
  const artistNorm = normalize(track.artistName);

  const titleHit = titleVariants.some(v => v && (guess === v || guess.includes(v)));
  const artistHit = artistNorm && (guess === artistNorm || guess.includes(artistNorm));

  // Difficulty tuning:
  // Easy: title OR artist
  // Medium: title
  // Hard: title AND artist
  if (difficulty === "easy") return titleHit || artistHit;
  if (difficulty === "medium") return titleHit;
  return titleHit && artistHit;
}

export default {
  data: new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("Start a 10-question music trivia game (requires VC: Game, text: #game)."),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: "Guild only.", ephemeral: true });

    const existing = getSession(guild.id);
    if (existing?.active) {
      return interaction.reply({ content: "⚠️ Trivia is already running in this server.", ephemeral: true });
    }

    // Difficulty selection UI
    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setTitle("🎵 Music Trivia")
      .setDescription("Select a difficulty to begin (10 questions).")
      .addFields(
        { name: "Easy", value: "1 point • accepts title OR artist", inline: true },
        { name: "Medium", value: "2 points • accepts title", inline: true },
        { name: "Hard", value: "3 points • requires title AND artist", inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("trivia_difficulty_easy").setLabel("Easy").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("trivia_difficulty_medium").setLabel("Medium").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("trivia_difficulty_hard").setLabel("Hard").setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    const pickMsg = await interaction.fetchReply();

    const difficulty = await new Promise((resolve) => {
      const collector = pickMsg.createMessageComponentCollector({
        time: 60000,
        max: 1,
        filter: (i) =>
          i.user.id === interaction.user.id &&
          i.customId.startsWith("trivia_difficulty_"),
      });

      collector.on("collect", async (i) => {
        await i.deferUpdate();
        resolve(i.customId.replace("trivia_difficulty_", ""));
      });

      collector.on("end", async (collected) => {
        if (!collected.size) resolve(null);
      });
    });

    // disable difficulty buttons
    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        row.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
      );
      await pickMsg.edit({ components: [disabledRow] });
    } catch {}

    if (!difficulty) {
      return interaction.followUp({ content: "⏱️ Difficulty selection timed out. Run **/trivia** again.", ephemeral: true });
    }

    const vc = findVoiceChannel(guild);
    const tc = findTextChannel(guild, interaction.channel);

    if (!vc) {
      return interaction.followUp({ content: `❌ Missing voice channel **${VOICE_CHANNEL_NAME}**.`, ephemeral: true });
    }
    if (!tc) {
      return interaction.followUp({ content: `❌ Missing text channel **#${TEXT_CHANNEL_NAME}**.`, ephemeral: true });
    }

    // Session init (flowchart: instructions given)
    resetScores(guild.id);

    const session = {
      active: true,
      guildId: guild.id,
      hostId: interaction.user.id,
      difficulty,
      totalRounds: 10,
      round: 0,
      currentTrack: null,
      hintStage: 0,
      hintsUsed: 0,
      maxHints: maxHintsFor(difficulty),
      textChannelId: tc.id,
      voiceChannelId: vc.id,
    };
    setSession(guild.id, session);

    const genre = getGenre(guild.id);

    await tc.send(
      `📢 **Music Trivia started!**\n` +
      `Difficulty: **${difficulty.toUpperCase()}** • Genre: **${genre}**\n\n` +
      `➡️ Join voice channel **${VOICE_CHANNEL_NAME}**.\n` +
      `✅ You’ll hear **30s** of a song preview.\n` +
      `💬 Type your guess in <#${tc.id}>.\n` +
      `💡 Use **/hint** (or the Hint button) if available.\n`
    );

    // flowchart: User in Game channel? (loop)
    const ok = await waitForUserInVC(guild, interaction.user.id, vc.id, 120000);
    if (!ok) {
      clearSession(guild.id);
      return tc.send(`❌ <@${interaction.user.id}> didn’t join **${VOICE_CHANNEL_NAME}** in time. Game cancelled.`);
    }

    // Connect once for all 10 rounds
    let connection = null;
    let player = null;
    try {
      const voice = await ensureVoice(guild, vc);
      connection = voice.connection;
      player = voice.player;

      for (let round = 1; round <= 10; round++) {
        const s = getSession(guild.id);
        if (!s?.active) break;

        // flowchart: Prepare next song + ensure still in VC
        const stillInVc = await waitForUserInVC(guild, interaction.user.id, vc.id, 60000);
        if (!stillInVc) {
          await tc.send(`⚠️ <@${interaction.user.id}> please re-join **${VOICE_CHANNEL_NAME}** to continue...`);
          const back = await waitForUserInVC(guild, interaction.user.id, vc.id, 120000);
          if (!back) {
            await tc.send(`❌ Game cancelled (host didn’t rejoin VC).`);
            break;
          }
        }

        // Round state
        const track = await getRandomItunesTrack(genre);
        const tmp = await downloadToTempFile(track.previewUrl);

        const updated = getSession(guild.id);
        updated.round = round;
        updated.currentTrack = track;
        updated.hintStage = 0;
        updated.hintsUsed = 0;
        updated.maxHints = maxHintsFor(difficulty);
        setSession(guild.id, updated);

        const listenEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(`🎧 Round ${round}/10`)
          .setDescription(`Listening for **30 seconds**...`)
          .addFields(
            { name: "Difficulty", value: difficulty.toUpperCase(), inline: true },
            { name: "Genre", value: String(genre).toUpperCase(), inline: true }
          );

        const listenMsg = await tc.send({ embeds: [listenEmbed] });

        // flowchart: User listens to song for 30 seconds
        await playPreview(player, tmp);
        await safeUnlink(tmp);

        // Guess phase + hint controls
        const hintRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("trivia_hint")
            .setLabel("Hint")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(updated.maxHints <= 0),
          new ButtonBuilder()
            .setCustomId("trivia_skip")
            .setLabel("Skip")
            .setStyle(ButtonStyle.Danger)
        );

        const guessEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`⌨️ Guess time! (Round ${round}/10)`)
          .setDescription(
            `Type your guess in <#${tc.id}>.\n` +
            `You can use **/hint** or press **Hint**.\n`
          )
          .addFields({ name: "Hints available", value: `${updated.maxHints}`, inline: true });

        const roundMsg = await tc.send({ embeds: [guessEmbed], components: [hintRow] });

        let revealedHints = [];

        const componentCollector = roundMsg.createMessageComponentCollector({
          time: 30000,
        });

        let skipped = false;

        componentCollector.on("collect", async (i) => {
          if (i.customId === "trivia_skip") {
            skipped = true;
            await i.deferUpdate();
            componentCollector.stop("skipped");
            return;
          }

          if (i.customId === "trivia_hint") {
            const ss = getSession(guild.id);
            if (!ss?.active || !ss.currentTrack) {
              await i.reply({ content: "No active round.", ephemeral: true });
              return;
            }
            if (ss.hintsUsed >= ss.maxHints) {
              await i.reply({ content: "No more hints available.", ephemeral: true });
              return;
            }

            ss.hintsUsed += 1;
            ss.hintStage += 1;
            setSession(guild.id, ss);

            const hint = makeHint(ss.currentTrack, ss.hintStage, ss.difficulty);
            revealedHints.push(hint);

            const newEmbed = EmbedBuilder.from(guessEmbed).setFields(
              { name: "Hints used", value: `${ss.hintsUsed}/${ss.maxHints}`, inline: true },
              ...(revealedHints.length
                ? [{ name: "Hints", value: revealedHints.map((h, idx) => `${idx + 1}. ${h}`).join("\n") }]
                : [])
            );

            await i.deferUpdate();
            await roundMsg.edit({ embeds: [newEmbed] });
          }
        });

        const winner = await new Promise((resolve) => {
          const msgCollector = tc.createMessageCollector({
            time: 30000,
            filter: (m) => !m.author.bot && m.content && m.channelId === tc.id,
          });

          msgCollector.on("collect", (m) => {
            if (skipped) return;

            const ss = getSession(guild.id);
            if (!ss?.active || !ss.currentTrack) return;

            if (isCorrectGuess(m.content, ss.currentTrack, ss.difficulty)) {
              msgCollector.stop("correct");
              resolve({ correct: true, userId: m.author.id });
            }
          });

          msgCollector.on("end", () => resolve({ correct: false, userId: null }));
        });

        componentCollector.stop("round_done");

        // Disable buttons
        try {
          const disabled = new ActionRowBuilder().addComponents(
            hintRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
          );
          await roundMsg.edit({ components: [disabled] });
        } catch {}

        const ss = getSession(guild.id);
        const answerLine = `✅ **${track.trackName}** — **${track.artistName}**`;

        // flowchart: Correct? -> Points displayed / Incorrect message
        if (winner.correct && winner.userId) {
          const pts = pointsFor(difficulty, ss?.hintsUsed ?? 0);
          addPoints(guild.id, winner.userId, pts);

          const top = getGuildScoresSorted(guild.id).slice(0, 5);
          const topLines = top.map(([uid, p], idx) => `${idx + 1}. <@${uid}> — **${p}**`).join("\n");

          await tc.send(
            `🎉 Correct! <@${winner.userId}> gets **${pts}** point(s).\n${answerLine}\n\n🏆 **Top Scores**\n${topLines}`
          );
        } else {
          await tc.send(`❌ Time! No correct guesses.\n${answerLine}`);
        }

        await sleep(1200);
        try { await listenMsg.delete().catch(() => {}); } catch {}
      }

      // flowchart: Answered 10 questions? -> end
      const final = getGuildScoresSorted(guild.id);
      if (!final.length) {
        await tc.send("🏁 Game over! No points scored.");
      } else {
        const lines = final.slice(0, 10).map(([uid, pts], i) => `${i + 1}. <@${uid}> — **${pts}**`);
        await tc.send(`🏁 **Game over! Final scoreboard:**\n${lines.join("\n")}`);
      }
    } catch (e) {
      console.error("[trivia] CRASH:", e?.stack || e);
      try {
        await tc.send(`❌ Trivia crashed: \`${String(e?.message || e).slice(0, 180)}\``);
      } catch {}
    } finally {
      // cleanup
      try { connection?.destroy(); } catch {}
      clearSession(guild.id);
    }
  },
};
