// Trivia Game Command - Main Entry Point
// This file contains the Discord slash command for starting a music trivia game.
// The game involves 10 rounds of song identification with voice previews.
// The code is organized into modular functions for better maintainability.

// Version 2.1 - Refactored for Maintainability
// Changes in this version:
// - Broke down the 600+ line execute function into 18 smaller, focused functions
// - Added comprehensive JSDoc documentation for all functions with parameter types and descriptions
// - Improved code readability with detailed inline comments explaining game flow phases
// - Enhanced error handling and resource cleanup
// - Preserved all existing bot functionality and user experience
// - Fixed test suite issues and import/export mismatches
// - Created missing powerup command that was referenced in tests
// - Modularized game phases: difficulty selection, channel validation, voice setup, game loop, scoring, cleanup
// - Better separation of concerns between UI, game logic, and data management

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

import { getGenre, getSession, setSession, clearSession } from "../gameState.js";
import { resetScores, addPoints, getGuildScoresSorted } from "../helpers/scoreStore.js";
import { addRoundPlayed, addRoundWon, addGamePlayed, addGameWon, addHintUsed } from "../helpers/statsStore.js";
import { makeHint } from "../helpers/hintHelper.js";
import { makeSongQuestion, createTriviaQuestion, createResultEmbed } from "../helpers/triviaHelper.js";
import { getRandomItunesTrack, downloadPreview } from "../helpers/itunes.js";
import { consumeFreeze , consumeDoublePoints, awardRandomPowerup} from "../helpers/powerup.js";

const VOICE_CHANNEL_NAME = "Game";
const TEXT_CHANNEL_NAME = "game";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Safely deletes a file, logging errors but not throwing them
 * Used for cleanup of temporary audio files
 * @param {string} filePath - Path to the file to delete
 */
async function safeUnlink(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.error(`Failed to delete file at ${filePath}:`, err);
    }
  }
}

/**
 * Calculates points for a correct answer based on difficulty and hint usage
 * @param {string} difficulty - Game difficulty level ('easy', 'medium', 'hard')
 * @param {boolean} hintsUsed - Whether hints were used this round
 * @returns {number} Points to award
 */
function calculatePoints(difficulty, hintsUsed) {
  const basePoints = { easy: 1, medium: 2, hard: 3 };
  let points = basePoints[difficulty] || 1;

  if (hintsUsed) {
    points = Math.max(1, points - 1); // Hint penalty (minimum 1 point)
  }
  return points;
}

/**
 * Finds the designated voice channel for the trivia game
 * @param {Guild} guild - The Discord guild to search in
 * @returns {VoiceChannel|null} The voice channel or null if not found
 */
function findVoiceChannel(guild) {
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name === VOICE_CHANNEL_NAME
  ) ?? null;
}

/**
 * Finds the designated text channel for the trivia game.
 * Falls back to the provided channel if the named channel doesn't exist.
 * @param {Guild} guild - The Discord guild to search in
 * @param {TextChannel} fallbackChannel - Channel to use if named channel not found
 * @returns {TextChannel|null} The text channel or null if neither exists
 */
function findTextChannel(guild, fallbackChannel) {
  const namedChannel = guild.channels.cache.find((c) => {
    const isTextType = c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement;
    return isTextType && c.name.toLowerCase() === TEXT_CHANNEL_NAME.toLowerCase();
  });

  return namedChannel ?? fallbackChannel ?? null;
}

/**
 * Validates that required channels exist for the game
 * @param {Guild} guild - The Discord guild
 * @param {Interaction} interaction - The Discord interaction
 * @returns {Object|null} Object with voiceChannel and textChannel, or null if validation fails
 */
function validateChannels(guild, interaction) {
  const voiceChannel = findVoiceChannel(guild);
  const textChannel = findTextChannel(guild, interaction.channel);

  if (!voiceChannel) {
    interaction.followUp({
      content: `❌ Missing voice channel **${VOICE_CHANNEL_NAME}**.`,
      ephemeral: true
    });
    return null;
  }

  if (!textChannel) {
    interaction.followUp({
      content: `❌ Missing text channel **#${TEXT_CHANNEL_NAME}**.`,
      ephemeral: true
    });
    return null;
  }

  return { voiceChannel, textChannel };
}

/**
 * Establishes and returns a voice connection and audio player for the game
 * @param {Guild} guild - The Discord guild
 * @param {VoiceChannel} voiceChannel - The voice channel to connect to
 * @returns {Object} Object containing connection and player
 */
async function setupVoiceConnection(guild, voiceChannel) {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 30000);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  connection.subscribe(player);
  return { connection, player };
}

/**
 * Plays a 30-second audio preview and handles cleanup
 * @param {AudioPlayer} player - The audio player to use
 * @param {string} filePath - Path to the audio file
 * @param {string} guildId - Guild ID for session management
 */
async function playAudioPreview(player, filePath, guildId) {
  const resource = createAudioResource(filePath, { inputType: StreamType.Arbitrary });
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 15000);

  // Auto-stop after 32 seconds to ensure clean cutoff
  const stopper = setTimeout(() => {
    try {
      player.stop(true);
    } catch (err) {
      console.error("Audio Playback Error:", err);
    }
  }, 32000);

  // Store stopper so /terminate can clear it instantly
  try {
    const session = getSession(guildId);
    if (session) {
      session.previewStopper = stopper;
      setSession(guildId, session);
    }
  } catch {}

  await new Promise((resolve) => player.once(AudioPlayerStatus.Idle, resolve));
  clearTimeout(stopper);

  // Clear stored stopper
  try {
    const session = getSession(guildId);
    if (session?.previewStopper === stopper) {
      session.previewStopper = null;
      setSession(guildId, session);
    }
  } catch {}
}

/**
 * Waits for a user to join a specific voice channel within a timeout period
 * @param {Guild} guild - The Discord guild
 * @param {string} userId - ID of the user to wait for
 * @param {string} voiceChannelId - ID of the voice channel
 * @param {number} timeoutMs - Timeout in milliseconds (default: 2 minutes)
 * @returns {boolean} True if user joined in time, false otherwise
 */
async function waitForUserInVoiceChannel(guild, userId, voiceChannelId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const inVoiceChannel = member?.voice?.channelId === voiceChannelId;
    if (inVoiceChannel) return true;
    await sleep(2500);
  }
  return false;
}

/**
 * Checks if the host is still in the voice channel and prompts them to rejoin if not
 * @param {Guild} guild - The Discord guild
 * @param {string} hostId - ID of the game host
 * @param {string} voiceChannelId - ID of the voice channel
 * @param {TextChannel} textChannel - The text channel for messages
 * @returns {boolean} True if host is present, false if they failed to rejoin
 */
async function validateHostPresence(guild, hostId, voiceChannelId, textChannel) {
  const stillInVoiceChannel = await waitForUserInVoiceChannel(guild, hostId, voiceChannelId, 60000);
  if (!stillInVoiceChannel) {
    await textChannel.send(`⚠️ <@${hostId}> please re-join **${VOICE_CHANNEL_NAME}** to continue...`);
    const rejoined = await waitForUserInVoiceChannel(guild, hostId, voiceChannelId, 120000);
    if (!rejoined) {
      await textChannel.send(`❌ Game cancelled (host didn't rejoin VC).`);
      return false;
    }
  }
  return true;
}

/**
 * Handles the difficulty selection phase of the game
 * @param {Interaction} interaction - The Discord interaction
 * @returns {string|null} Selected difficulty or null if timed out
 */
async function selectDifficulty(interaction) {
  // Create difficulty selection embed
  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setTitle("🎵 Music Trivia")
    .setDescription(
      `Welcome to Music Trivia! 🎵
      We hope you enjoy playing and testing your music knowledge when it comes to several **genres** of music!

      Here will be some of the commands available to you:

      - ✅ **/trivia**: Starts a new game of music trivia.

      - **/leaderboard**: Displays the top 10 leaderboard to show the top trivia players!

      - **/genre**: Sets the genre for the music trivia.

      - ❌ **/terminate**: Lets you **end** the game early!

      - **/stats**: Shows your personal trivia stats

      - **/activeplayers**: Shows the active players of the current game.

      - **/gameinfo**: Shows info about the current game, like difficulty, genre, and how many rounds left.

      - **/score**: Shows your current score in the current game

      **Now select a difficulty to start the game!**`
    )
    .addFields(
      { name: "Easy", value: "**1 point** • **artist** or **genre** questions", inline: true },
      { name: "Medium", value: "**2 points** • **album** or **track-title** questions", inline: true },
      { name: "Hard", value: "**3 points** • **release-year** questions", inline: true }
    );

  // Create difficulty selection buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("trivia_difficulty_easy").setLabel("Easy").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("trivia_difficulty_medium").setLabel("Medium").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("trivia_difficulty_hard").setLabel("Hard").setStyle(ButtonStyle.Danger)
  );

  // Send selection message and wait for response
  await interaction.reply({ embeds: [embed], components: [row] });
  const pickMsg = await interaction.fetchReply();

  // Set up collector for difficulty selection
  const difficulty = await new Promise((resolve) => {
    const collector = pickMsg.createMessageComponentCollector({
      time: 60000, // 60 second timeout
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

  // Disable buttons after selection or timeout
  try {
    const disabledRow = new ActionRowBuilder().addComponents(
      row.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
    );
    await pickMsg.edit({ components: [disabledRow] });
  } catch (err) {
    console.error("Failed to disable buttons:", err);
    await interaction.followUp({
      content: "⚠️ Selection failed. Please try again in a moment.",
      ephemeral: true,
    });
  }

  return difficulty;
}

/**
 * Initializes the game session with all necessary state
 * @param {Guild} guild - The Discord guild
 * @param {string} difficulty - Selected difficulty level
 * @param {string} hostId - ID of the user who started the game
 * @param {string} textChannelId - ID of the text channel
 * @param {string} voiceChannelId - ID of the voice channel
 * @returns {Object} The initialized session object
 */
function createGameSession(guild, difficulty, hostId, textChannelId, voiceChannelId) {
  resetScores(guild.id); // Reset scores for new game

  return {
    active: true,
    terminated: false,
    skipRequested: false,
    guildId: guild.id,
    hostId,
    difficulty,
    totalRounds: 10,
    round: 0,
    currentTrack: null,
    textChannelId,
    voiceChannelId,
    connection: null,
    player: null,
    roundCollector: null,
    timerInterval: null,
    previewStopper: null,
    roundMessageId: null,
    tmpFile: null,
  };
}

/**
 * Sends comprehensive game instructions to the text channel
 * @param {TextChannel} textChannel - The text channel to send instructions to
 * @param {string} difficulty - The selected difficulty
 * @param {string} genre - The current music genre
 */
async function sendGameInstructions(textChannel, difficulty, genre) {
  await textChannel.send(
    `📢 **Music Trivia started!**\n` +
    `The difficulty you chose was: **${difficulty.toUpperCase()}** • The current genre is: **${genre}**\n\n` +
    `Here are the rules of how to play the music trivia game!\n` +
    `➡️ **First**, join the voice channel **${VOICE_CHANNEL_NAME}** to hear the previews we will play to you.\n\n` +
    `✅ You'll hear **30s** of a song preview and have time to guess the correct answer after.\n\n` +
    `💬 When the preview ends you'll have **15 seconds** to answer the question using the **multiple-choice** buttons in <#${textChannel.id}>.\n\n` +
    `🔁 The **replay** button lets you hear the song one more time; using it restarts the timer (only once per round).\n\n` +
    `💡 The **hint** button provides one clue per round with a **penalty** applied **only** in the difficulty **Medium** of -1 point. **No hints for Hard difficulty**.\n\n` +
    `⚠️ Wrong answers will be marked with a red ❌ and correct answers with a green ✅.\n\n` +
    `🏅 Points are awarded based on difficulty: **Easy**: 1 point, **Medium**: 2 points, **Hard**: 3 points.\n\n` +
    `🏆 At the end of 10 rounds, the player with the most points wins! In case of a tie, the player who answered faster wins.\n\n` +
    `📊 Your score and stats will be tracked across games, so keep playing to climb the leaderboard and show off your music knowledge!`
  );
}

/**
 * Clears any active preview stoppers from previous rounds
 * @param {string} guildId - The guild ID
 */
function clearPreviewStopper(guildId) {
  const prevSession = getSession(guildId);
  if (prevSession?.previewStopper) {
    clearTimeout(prevSession.previewStopper);
    prevSession.previewStopper = null;
    setSession(guildId, prevSession);
  }
}

/**
 * Handles the preview phase of a round, including skip functionality
 * @param {TextChannel} textChannel - The text channel
 * @param {AudioPlayer} player - The audio player
 * @param {string} tmpFile - Path to the temporary audio file
 * @param {string} guildId - The guild ID
 * @param {string} difficulty - The game difficulty
 * @param {string} genre - The music genre
 * @param {number} round - Current round number
 * @returns {boolean} True if preview completed successfully, false if terminated
 */
async function handlePreviewPhase(textChannel, player, tmpFile, guildId, difficulty, genre, round) {
  // Send listening message with skip button
  const listenEmbed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`🎧 Round ${round}/10`)
    .setDescription(`Listening for **30 seconds**...`)
    .addFields(
      { name: "Difficulty", value: difficulty.toUpperCase(), inline: true },
      { name: "Genre", value: String(genre).toUpperCase(), inline: true }
    );

  const previewRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("skip_preview")
      .setLabel("Skip Preview")
      .setStyle(ButtonStyle.Primary)
  );

  const listenMsg = await textChannel.send({ embeds: [listenEmbed], components: [previewRow] });
  
  try {
    const session = getSession(guildId);
    if (session) {
      session.roundMessageId = listenMsg.id;
      setSession(guildId, session);
    }
  } catch {}

  // Set up preview skip collector
  const previewCollector = listenMsg.createMessageComponentCollector({
    time: 30000,
  });

  let skipped = false;
  previewCollector.on("collect", async (i) => {
    if (i.customId !== "skip_preview") return;
    await i.deferUpdate();
    try {
      player.stop(true);
    } catch {}
    previewCollector.stop("skipped");
    skipped = true;
  });

  try {
    await playAudioPreview(player, tmpFile, guildId);

    // Disable skip button after preview
    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        previewRow.components.map((b) =>
          ButtonBuilder.from(b).setDisabled(true)
        )
      );
      await listenMsg.edit({ components: [disabledRow] });
    } catch {}

        const session = getSession(guildId);

    if (session?.skipRequested) {
      await listenMsg.delete().catch(() => {});
      return false;
    }

    if (!session?.active || session?.terminated) {
      await safeUnlink(tmpFile);
      await listenMsg.delete().catch(() => {});
      return false;
    }
  } catch (err) {
    if (String(err.message).includes("FFmpeg/avconv not found")) {
      await textChannel.send(
        "❌ Audio playback failed: FFmpeg is not installed on the server. Please install it before running trivia."
      );
    } else {
      await textChannel.send(`❌ Audio playback err: ${err.message}`);
    }
    throw err;
  }

  return true;
}

/**
 * Handles the question and answer phase of a round
 * @param {TextChannel} textChannel - The text channel
 * @param {Object} question - The trivia question object
 * @param {Object} track - The track information
 * @param {string} difficulty - The game difficulty
 * @param {string} guildId - The guild ID
 * @param {AudioPlayer} player - The audio player
 * @param {string} tmpFile - Path to temporary audio file
 * @param {Message} listenMsg - The listening message to delete
 * @returns {Object} Result object with round statistics
 */
async function handleQuestionPhase(textChannel, question, track, difficulty, guildId, player, tmpFile, listenMsg) {
  const { embed: questionEmbed, actionRow: answerRow } = createTriviaQuestion(question);

  // Create control buttons (replay and hint)
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("trivia_replay")
      .setLabel("Replay")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId("trivia_hint")
      .setLabel("Hint")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(difficulty === "hard") // No hints for hard difficulty
  );

  const roundMsg = await textChannel.send({
    embeds: [questionEmbed],
    components: [answerRow, controlRow],
  });

  // Update session with round message ID
  const session = getSession(guildId);
  if (session) {
    session.roundMessageId = roundMsg.id;
    setSession(guildId, session);
  }

  // Round state tracking
  let roundState = { replayUsed: false, hintUsed: false };
  let winner = { correct: false, userId: null };
  const answeredUsers = new Set();

  // Check for active power-ups
  const freezeActive = consumeFreeze(guildId, session.hostId);
  const doublePtsActive = consumeDoublePoints(guildId, session.hostId);

  if (freezeActive) {
    await textChannel.send(`❄️ Freeze Time activated! No timer this round.`);
  }
  if (doublePtsActive) {
    await textChannel.send(`💰 **Double Points** activated! You will earn **${question.points * 2}** points if you guess right!`);
  }

  // Set up answer collector
  const collectorOptions = {};
  if (!freezeActive) {
    collectorOptions.time = 15000; // 15 seconds for answers
  }

  const componentCollector = roundMsg.createMessageComponentCollector(collectorOptions);

  // Store collector in session for termination
  const collectorSession = getSession(guildId);
  if (collectorSession) {
    collectorSession.roundCollector = componentCollector;
    setSession(guildId, collectorSession);
  }

  // Timer management
  let timeLeft = 15; // Base time for answers
  let timerInterval = null;

  /**
   * Starts or restarts the countdown timer for the round
   */
  function startTimer() {
    clearInterval(timerInterval);
    timeLeft = 15;
    timerInterval = setInterval(async () => {
      if (timeLeft <= 0) return;
      timeLeft--;

      try {
        const updatedEmbed = EmbedBuilder.from(questionEmbed).setFooter({
          text: `⏳ Time left: ${timeLeft}s`,
        });

        await roundMsg.edit({
          embeds: [updatedEmbed],
          components: [answerRow, controlRow],
        });
      } catch (err) {
        console.error("Failed to update timer UI", err);
      }
    }, 1000);

    // Store interval for cleanup
    try {
      const timerSession = getSession(guildId);
      if (timerSession) {
        timerSession.timerInterval = timerInterval;
        setSession(guildId, timerSession);
      }
    } catch {}
  }

  if (!freezeActive) startTimer();

  // Set up collector event handlers
  componentCollector.on("collect", async (i) => {
    const currentSession = getSession(guildId);
    if (!currentSession?.active || currentSession?.terminated) {
      try { await i.deferUpdate(); } catch {}
      return;
    }

    // Handle answer selections
    if (i.customId.startsWith("trivia_answer_")) {
      await handleAnswerSelection(i, answeredUsers, question, winner, answerRow, controlRow, roundMsg, timerInterval, componentCollector, freezeActive, guildId);
      return;
    }

    // Handle replay button
    if (i.customId === "trivia_replay") {
      await handleReplayRequest(i, roundState, player, roundMsg, answerRow, controlRow, questionEmbed, timeLeft, componentCollector, freezeActive, guildId);
      return;
    }

    // Handle hint button
    if (i.customId === "trivia_hint") {
      await handleHintRequest(i, roundState, difficulty, track, question, roundMsg, answerRow, controlRow, textChannel, guildId);
      return;
    }
  });

  // Return promise that resolves when round ends
  return new Promise((resolve) => {
    componentCollector.on("end", async (collected, reason) => {
      await finalizeRound(reason, question, winner, answerRow, controlRow, roundMsg, timerInterval, textChannel, doublePtsActive, roundState, difficulty, guildId, tmpFile, listenMsg, resolve);
    });
  });
}

/**
 * Handles user answer selections during a round
 * @param {Interaction} i - The button interaction
 * @param {Set} answeredUsers - Set of users who have already answered
 * @param {Object} question - The trivia question
 * @param {Object} winner - Winner tracking object
 * @param {ActionRowBuilder} answerRow - The answer buttons row
 * @param {ActionRowBuilder} controlRow - The control buttons row
 * @param {Message} roundMsg - The round message
 * @param {number} timerInterval - The timer interval ID
 * @param {InteractionCollector} componentCollector - The button collector
 * @param {boolean} freezeActive - Whether freeze power-up is active
 * @param {string} guildId - The guild ID
 */
async function handleAnswerSelection(i, answeredUsers, question, winner, answerRow, controlRow, roundMsg, timerInterval, componentCollector, freezeActive, guildId) {
  if (answeredUsers.has(i.user.id)) {
    await i.reply({ content: "You already answered this round.", ephemeral: true });
    return;
  }
  answeredUsers.add(i.user.id);
  addRoundPlayed(guildId, i.user.id);

  const idx = parseInt(i.customId.replace("trivia_answer_", ""), 10);
  const selected = question.options[idx];

  if (selected === question.correctAnswer) {
    // Correct answer
    winner.correct = true;
    winner.userId = i.user.id;
    winner.selected = selected;
    clearInterval(timerInterval);

    // Update UI to show correct answer
    const newAnswerRow = ActionRowBuilder.from(answerRow).setComponents(
      answerRow.components.map((b) =>
        b.data.custom_id === i.customId
          ? ButtonBuilder.from(b).setStyle(ButtonStyle.Success).setDisabled(true)
          : ButtonBuilder.from(b).setDisabled(true)
      )
    );

    const newControlRow = ActionRowBuilder.from(controlRow).setComponents(
      controlRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
    );

    await roundMsg.edit({ components: [newAnswerRow, newControlRow] }).catch(() => {});
    await i.deferUpdate();
    componentCollector.stop("correct");
  } else {
    // Wrong answer
    const newAnswerRow = ActionRowBuilder.from(answerRow).setComponents(
      answerRow.components.map((b) =>
        b.data.custom_id === i.customId
          ? ButtonBuilder.from(b).setStyle(ButtonStyle.Danger).setDisabled(true)
          : ButtonBuilder.from(b)
      )
    );

    await roundMsg.edit({ components: [newAnswerRow, controlRow] }).catch(() => {});
    await i.reply({ content: "❌ Wrong answer!", ephemeral: true });

    // End round immediately if freeze is active and answer was wrong
    if (freezeActive) {
      clearInterval(timerInterval);
      componentCollector.stop("freeze_wrong");
    }
  }
}

/**
 * Handles replay button functionality
 * @param {Interaction} i - The button interaction
 * @param {Object} roundState - Round state object containing replayUsed and hintUsed
 * @param {AudioPlayer} player - The audio player
 * @param {Message} roundMsg - The round message
 * @param {ActionRowBuilder} answerRow - The answer buttons row
 * @param {ActionRowBuilder} controlRow - The control buttons row
 * @param {EmbedBuilder} questionEmbed - The question embed
 * @param {number} timeLeft - Time remaining in the round
 * @param {InteractionCollector} componentCollector - The button collector
 * @param {boolean} freezeActive - Whether freeze power-up is active
 * @param {string} guildId - The guild ID
 */
async function handleReplayRequest(i, roundState, player, roundMsg, answerRow, controlRow, questionEmbed, timeLeft, componentCollector, freezeActive, guildId) {
  if (roundState.replayUsed) {
    await i.reply({ content: "Replay already used for this song.", ephemeral: true });
    return;
  }

  const session = getSession(guildId);
  if (!session?.active || session?.terminated || !session.tmpFile) {
    await i.reply({ content: "Replay unavailable.", ephemeral: true });
    return;
  }

  roundState.replayUsed = true;

  // Disable replay button
  try {
    const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
      controlRow.components.map((b) =>
        b.data.custom_id === "trivia_replay"
          ? ButtonBuilder.from(b).setDisabled(true)
          : ButtonBuilder.from(b)
      )
    );
    await roundMsg.edit({ components: [answerRow, disabledCtrl] }).catch(() => {});
  } catch {}

  await i.deferUpdate();

  // Play the preview again
  (async () => {
    try {
      player.stop(true);

      const resource = createAudioResource(session.tmpFile, { inputType: StreamType.Arbitrary });
      player.play(resource);

      const stopper = setTimeout(() => {
        try { player.stop(true); } catch {}
      }, 32000);

      try {
        const replaySession = getSession(guildId);
        if (replaySession) {
          replaySession.previewStopper = stopper;
          setSession(guildId, replaySession);
        }
      } catch {}

      await new Promise((resolve) => player.once(AudioPlayerStatus.Idle, resolve));
      clearTimeout(stopper);

      try {
        const cleanupSession = getSession(guildId);
        if (cleanupSession?.previewStopper === stopper) {
          cleanupSession.previewStopper = null;
          setSession(guildId, cleanupSession);
        }
      } catch {}
    } catch {}
  })();

  // Reset timer if freeze is not active
  if (!freezeActive) {
    timeLeft = Math.min(timeLeft + 15, 15); // Add 15 seconds, max 15
    componentCollector.resetTimer({ time: 15000 });

    try {
      const updatedEmbed = EmbedBuilder.from(questionEmbed).setFooter({
        text: `⏳ Time left: ${timeLeft}s`,
      });

      await roundMsg.edit({
        embeds: [updatedEmbed],
        components: [answerRow, controlRow],
      });
    } catch {}
  }
}

/**
 * Handles hint button functionality
 * @param {Interaction} i - The button interaction
 * @param {Object} roundState - Round state object containing replayUsed and hintUsed
 * @param {string} difficulty - The game difficulty
 * @param {Object} track - The track information
 * @param {Object} question - The trivia question
 * @param {Message} roundMsg - The round message
 * @param {ActionRowBuilder} answerRow - The answer buttons row
 * @param {ActionRowBuilder} controlRow - The control buttons row
 * @param {TextChannel} textChannel - The text channel
 * @param {string} guildId - The guild ID
 */
async function handleHintRequest(i, roundState, difficulty, track, question, roundMsg, answerRow, controlRow, textChannel, guildId) {
  if (difficulty === "hard") {
    await i.reply({ content: "Hints are not allowed for hard difficulty.", ephemeral: true });
    return;
  }

  if (roundState.hintUsed) {
    await i.reply({ content: "Hint already used this round.", ephemeral: true });
    return;
  }

  roundState.hintUsed = true;
  addHintUsed(guildId, i.user.id);

  // Disable hint button
  try {
    const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
      controlRow.components.map((b) =>
        b.data.custom_id === "trivia_hint"
          ? ButtonBuilder.from(b).setDisabled(true)
          : ButtonBuilder.from(b)
      )
    );
    await roundMsg.edit({ components: [answerRow, disabledCtrl] }).catch(() => {});
  } catch {}

  const hint = makeHint(track, question.type);
  const hintMessage = difficulty === "medium"
    ? `💡 Hint: ${hint}\n⚠️**Hint used**: points deducted by 1`
    : `💡 Hint: ${hint}`;

  await i.reply({ content: hintMessage, ephemeral: true }).catch(async () => {
    await textChannel.send(`💡 Hint: ${hint}`).catch(() => {});
  });
}

/**
 * Handles the end of a round, including scoring and UI updates
 * @param {string} reason - Reason the collector ended
 * @param {Object} question - The trivia question
 * @param {Object} winner - Winner information
 * @param {ActionRowBuilder} answerRow - The answer buttons row
 * @param {ActionRowBuilder} controlRow - The control buttons row
 * @param {Message} roundMsg - The round message
 * @param {number} timerInterval - The timer interval ID
 * @param {TextChannel} textChannel - The text channel
 * @param {boolean} doublePtsActive - Whether double points power-up is active
 * @param {Object} roundState - Round state object containing replayUsed and hintUsed
 * @param {string} difficulty - The game difficulty
 * @param {string} guildId - The guild ID
 * @param {string} tmpFile - Path to temporary audio file
 * @param {Message} listenMsg - The listening message to delete
 * @param {Function} resolve - Promise resolve function
 */
async function finalizeRound(reason, question, winner, answerRow, controlRow, roundMsg, timerInterval, textChannel, doublePtsActive, roundState, difficulty, guildId, tmpFile, listenMsg, resolve) {
  const endSession = getSession(guildId);
  const wasSkipped = Boolean(endSession?.skipRequested); 

  if (reason === "terminated" || !endSession?.active || endSession?.terminated) {
    clearInterval(timerInterval);

    // Disable all buttons
    try {
      const disabledAnswer = ActionRowBuilder.from(answerRow).setComponents(
        answerRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
      );
      const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
        controlRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
      );
      await roundMsg.edit({ components: [disabledAnswer, disabledCtrl] }).catch(() => {});
    } catch {}

    // Cleanup
    try {
      const cleanupSession = getSession(guildId);
      if (cleanupSession?.tmpFile) {
        await safeUnlink(cleanupSession.tmpFile);
        cleanupSession.tmpFile = null;
        setSession(guildId, cleanupSession);
      }
    } catch {}

    try { await listenMsg.delete().catch(() => {}); } catch {}

    resolve();
    return;
  }

    if (reason === "skipped" || wasSkipped) {
    clearInterval(timerInterval);

    try {
      const disabledAnswer = ActionRowBuilder.from(answerRow).setComponents(
        answerRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
      );
      const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
        controlRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
      );
      await roundMsg.edit({ components: [disabledAnswer, disabledCtrl] }).catch(() => {});
    } catch {}

    await textChannel.send(`⏭️ **Round skipped by administrator.**\n✅ **Correct answer:** ${question.correctAnswer}`);

    try {
      const cleanupSession = getSession(guildId);
      if (cleanupSession) {
        cleanupSession.skipRequested = false;
        if (cleanupSession.tmpFile) {
          await safeUnlink(cleanupSession.tmpFile);
          cleanupSession.tmpFile = null;
        }
        setSession(guildId, cleanupSession);
      }
    } catch {}

    try { await listenMsg.delete().catch(() => {}); } catch {}

    await sleep(3000);
    resolve();
    return;
  }

  // Highlight correct answer if nobody got it right
  try {
    const highlighted = ActionRowBuilder.from(answerRow).setComponents(
      answerRow.components.map((b) => {
        const idx = parseInt(b.data.custom_id.replace("trivia_answer_", ""), 10);
        if (question.options[idx] === question.correctAnswer) {
          return ButtonBuilder.from(b).setStyle(ButtonStyle.Success);
        }
        return ButtonBuilder.from(b).setDisabled(true);
      })
    );

    const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
      controlRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
    );

    await roundMsg.edit({ components: [highlighted, disabledCtrl] }).catch(() => {});
  } catch {}

  const answerLine = `✅ **Correct answer:** ${question.correctAnswer}`;

  if (winner.correct && winner.userId) {
    // Calculate points
    let pts = calculatePoints(difficulty, roundState.hintUsed);
    if (doublePtsActive) {
      pts *= 2;
    }
    question.points = pts;

    // Send winner message
    const session = getSession(guildId);
    const isLastRound = session.round >= 10;
    if (!isLastRound) {
      await textChannel.send(`🎉 <@${winner.userId}> got it right and earned **${pts}** points! Get ready for the next round...`);

      // Award random power-up
      const powerupWon = awardRandomPowerup(guildId, winner.userId);
      if (powerupWon) {
        const powerupName = powerupWon === "freeze" ? "❄️ Freeze Time" : "💰 Double Points";
        await textChannel.send(`🎁 **Bonus!** <@${winner.userId}> won a **${powerupName}** for the next round!`);
      } else {
        await textChannel.send(`🎁 <@${winner.userId}> did not win a power-up this time. Better luck next round!`);
      }
    } else {
      await textChannel.send(`🎉 <@${winner.userId}> got it right and earned **${pts}** points!`);
    }

    // Update scores and stats
    addPoints(guildId, winner.userId, pts);
    addRoundWon(guildId, winner.userId);

    // Show top scores
    const top = getGuildScoresSorted(guildId).slice(0, 5);
    const topLines = top.map(([uid, p], idx) => `${idx + 1}. <@${uid}> — **${p}**`).join("\n");
    const resultEmbed = createResultEmbed(question, winner.selected, {
      username: `<@${winner.userId}>`,
    });

    await textChannel.send({ embeds: [resultEmbed] });
    await textChannel.send(`🏆 **Top Scores**\n${topLines}`);
  } else {
    await textChannel.send(`❌ Time! No correct guesses.\n${answerLine}`);
  }

  // Wait before next round
  await sleep(5000);

  // Cleanup
  try {
    const cleanupSession = getSession(guildId);
    if (cleanupSession?.tmpFile) {
      await safeUnlink(cleanupSession.tmpFile);
      cleanupSession.tmpFile = null;
      setSession(guildId, cleanupSession);
    }
  } catch {}

  try { await listenMsg.delete().catch(() => {}); } catch {}

  resolve();
}

/**
 * Runs the main game loop for 10 rounds
 * @param {Guild} guild - The Discord guild
 * @param {Interaction} interaction - The Discord interaction
 * @param {TextChannel} textChannel - The text channel
 * @param {VoiceChannel} voiceChannel - The voice channel
 * @param {AudioPlayer} player - The audio player
 * @param {string} difficulty - The game difficulty
 * @param {string} genre - The music genre
 * @returns {Set} Set of all players who participated
 */
async function runGameRounds(guild, interaction, textChannel, voiceChannel, player, difficulty, genre) {
  const playersAcrossAllRounds = new Set();

  // Update session with voice connection info
  const voiceSession = getSession(guild.id);
  if (voiceSession) {
    voiceSession.connection = voiceChannel.guild.voiceAdapterCreator;
    voiceSession.player = player;
    setSession(guild.id, voiceSession);
  }

  // Main game loop - 10 rounds
  for (let round = 1; round <= 10; round++) {
    const session = getSession(guild.id);

    // Check for termination
    if (session?.terminated) break;
    if (!session?.active) break;

    // Verify host is still in voice channel
    const hostPresent = await validateHostPresence(guild, interaction.user.id, voiceChannel.id, textChannel);
    if (!hostPresent) break;

    // Clear any leftover preview stoppers
    clearPreviewStopper(guild.id);

    // Get random track and download preview
    const track = await getRandomItunesTrack(genre);
    const tmpFile = await downloadPreview(track.previewUrl);

    // Update session with current round info
    const updatedSession = getSession(guild.id);
    updatedSession.round = round;
    updatedSession.currentTrack = track;
    updatedSession.tmpFile = tmpFile;
    setSession(guild.id, updatedSession);

    // Handle preview phase
    const previewSuccess = await handlePreviewPhase(textChannel, player, tmpFile, guild.id, difficulty, genre, round);

    const afterPreviewSession = getSession(guild.id);
    if (afterPreviewSession?.skipRequested) {
      await textChannel.send("⏭️ Round skipped. Moving to the next round...");
      afterPreviewSession.skipRequested = false;
      setSession(guild.id, afterPreviewSession);
      continue;
    }

    if (!previewSuccess) break;

    // Create and handle question
    const question = await makeSongQuestion(track, difficulty);
    await handleQuestionPhase(textChannel, question, track, difficulty, guild.id, player, tmpFile, null);

    // Check if game was terminated during the round
    const afterRoundSession = getSession(guild.id);
    if (afterRoundSession?.terminated || !afterRoundSession?.active) break;
  }

  return playersAcrossAllRounds;
}

/**
 * Handles end-of-game logic and displays final scoreboard
 * @param {Guild} guild - The Discord guild
 * @param {TextChannel} textChannel - The text channel
 * @param {Set} playersAcrossAllRounds - Set of all participating players
 */
async function finalizeGame(guild, textChannel, playersAcrossAllRounds) {
  // Update stats for all players
  for (const userId of playersAcrossAllRounds) {
    addGamePlayed(guild.id, userId);
  }

  const finalSession = getSession(guild.id);
  if (!finalSession?.terminated) {
    const final = getGuildScoresSorted(guild.id);
    if (!final.length) {
      await textChannel.send("🏁 Game over! No points scored.");
    } else {
      const highestScorer = final[0];
      addGameWon(guild.id, highestScorer[0]);
      const lines = final.slice(0, 10).map(([uid, p], idx) => `${idx + 1}. <@${uid}> — **${p}**`);
      await textChannel.send(`🏁 **Game over! Final scoreboard:**\n${lines.join("\n")}`);
    }
  }
}

/**
 * Performs comprehensive cleanup of game resources
 * @param {string} guildId - The guild ID
 * @param {AudioPlayer} player - The audio player
 * @param {VoiceConnection} connection - The voice connection
 */
async function cleanupGameResources(guildId, player, connection) {
  try {
    const session = getSession(guildId);
    if (session?.timerInterval) clearInterval(session.timerInterval);
  } catch {}

  try { player?.stop(true); } catch {}
  try { connection?.destroy(); } catch {}

  try {
    const session = getSession(guildId);
    if (session?.tmpFile) await safeUnlink(session.tmpFile);
  } catch {}

  clearSession(guildId);
}

// Test utilities (not part of main game logic)
function normalize(str) {
  return String(str)
    .replace(/\([^\)]*\)/g, "")
    .replace(/[\p{P}$+<=>^`|~]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const _test = {
  calculatePoints,
  normalize,
};

/**
 * This is the main command export in which the user can invoke to run
 * a game of trivia. The command handler manages the whole gameplay flow, including:
 * - Difficulty selection
 * - Voice channel connection
 * - Round management (playing previews, collecting answers, scoring)
 * - Final scoreboard display
 * 
 * The command relies heavily on the helper functions and game state management
 * to keep track of the current session, scores, and question generation. Essentially following
 * OOP principles. (Note: the code does need to be simplified and cleaned up)
 */
export default {
  data: new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("Start a 10-question music trivia game (requires VC: Game, text: #game)."),

  async execute(interaction) {
    // Ensure the command is run in a guild (server)
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: "Guild only.", ephemeral: true });

    // Prevent multiple games from running simultaneously in the same guild
    const existing = getSession(guild.id);
    if (existing?.active) {
      return interaction.reply({
        content: "⚠️ Trivia is already running in this server.",
        ephemeral: true
      });
    }

    // Phase 1: Let the user select game difficulty (easy/medium/hard)
    const difficulty = await selectDifficulty(interaction);
    if (!difficulty) {
      return interaction.followUp({
        content: "⏱️ Difficulty selection timed out. Run **/trivia** again to play again!",
        ephemeral: true,
      });
    }

    // Phase 2: Validate that required voice and text channels exist
    const channels = validateChannels(guild, interaction);
    if (!channels) return; // Error messages already sent
    const { voiceChannel, textChannel } = channels;

    // Phase 3: Create and store the game session with all necessary state
    const session = createGameSession(guild, difficulty, interaction.user.id, textChannel.id, voiceChannel.id);
    setSession(guild.id, session);

    // Phase 4: Send game instructions and rules to the text channel
    const genre = getGenre(guild.id);
    await sendGameInstructions(textChannel, difficulty, genre);

    // Phase 5: Wait for the game host to join the voice channel
    const hostInVC = await waitForUserInVoiceChannel(guild, interaction.user.id, voiceChannel.id, 120000);
    if (!hostInVC) {
      clearSession(guild.id);
      return textChannel.send(`❌ <@${interaction.user.id}> didn't join **${VOICE_CHANNEL_NAME}** in time. Game cancelled.`);
    }

    // Phase 6: Establish voice connection and audio player for playing song previews
    let connection = null;
    let player = null;
    let playersAcrossAllRounds = new Set();

    try {
      const voiceSetup = await setupVoiceConnection(guild, voiceChannel);
      connection = voiceSetup.connection;
      player = voiceSetup.player;

      // Phase 7: Run the 10-round trivia game loop with questions, answers, and scoring
      playersAcrossAllRounds = await runGameRounds(guild, interaction, textChannel, voiceChannel, player, difficulty, genre);

      // Phase 8: Display final scoreboard and game statistics
      await finalizeGame(guild, textChannel, playersAcrossAllRounds);

    } finally {
      // Phase 9: Clean up voice connections, audio files, and session data
      await cleanupGameResources(guild.id, player, connection);
    }
  },
};