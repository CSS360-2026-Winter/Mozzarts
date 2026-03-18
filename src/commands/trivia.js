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
 * Looks for the vc w/specified name.
 * @param {*} guild
 * @returns the vc with the name specified, or null if not found. specified name is required.
 */
function findVoiceChannel(guild) {
  return (
    guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildVoice && c.name === VOICE_CHANNEL_NAME
    ) ?? null
  );
}

/**
 * Finds the tc for the game, first looks for the channel with the specified name,
 * if not found it falls back to the channel the command was invoked in.
 * null if neither is found which is handled later to let the user know they need to set up a tc for the game.
 *
 * @param {*} guild
 * @param {*} fallbackChannel
 * @returns the tc or fallback on the channel
 */
function findTextChannel(guild, fallbackChannel) {
  const tc =
    guild.channels.cache.find((c) => {
      const okType = c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement;
      return okType && c.name.toLowerCase() === TEXT_CHANNEL_NAME.toLowerCase();
    }) ?? null;
  return tc ?? fallbackChannel ?? null;
}

/**
 * This function attempts to delete the file at the given path, but catches and logs any errors that occur during deletion.
 * Used to clean up temp files.
 * @param {*} p file path
 */
async function safeUnlink(p) {
  try {
    await fs.promises.unlink(p);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Failed to delete file at ${p}:`, err);
    }
  }
}

/**
 * Waits for the user to be in the specified vc by checking every 2.5 s or until the timeout is reached.
 * If the user is in the vc then it returns true, else false after timeout.
 * @param {*} guild
 * @param {*} userId
 * @param {*} vcId
 * @param {*} timeoutMs
 * @returns false if the user is not in vc and true if they are, it checks
 * every 2.5 s until timeout which is 2 min by default
 */
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

/**
 * This function ensures that the bot is connected to the vc and that the audio player is set up to play previews.
 * This will be called at the start of the game to establish a connection that can be used throughout the game
 * to play previews without reconnecting each time.
 * @param {*} guild
 * @param {*} vc
 * @returns the connection and the player which is used to play the previews and manage the audio in the vc.
 */
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
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  connection.subscribe(player);
  return { connection, player };
}

/**
 * Creates an audio resource from the given file path and plays the preview for
 * for 30 seconds. It waits for the audio player to play before proceeding and
 * then it hard stops the preview at around 32 seconds to make sure it doesn't play
 * longer than 30s and also prevents any issues.
 * Then it waits until the player finishes or is stopped before resolving and continuing w/the game flow.
 *
 * @param {*} player
 * @param {*} filePath
 */
async function playPreview(player, filePath, guildId) {
  const resource = createAudioResource(filePath, { inputType: StreamType.Arbitrary });
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 15000);

  const stopper = setTimeout(() => {
    try {
      player.stop(true);
    } catch (err) {
      console.error("Audio Playback Error:", err);
    }
  }, 32000);

  // store stopper so /terminate can clear it instantly
  try {
    const ss = getSession(guildId);
    if (ss) {
      ss.previewStopper = stopper;
      setSession(guildId, ss);
    }
  } catch {}

  await new Promise((resolve) => player.once(AudioPlayerStatus.Idle, resolve));
  clearTimeout(stopper);

  // clear stored stopper
  try {
    const ss2 = getSession(guildId);
    if (ss2?.previewStopper === stopper) {
      ss2.previewStopper = null;
      setSession(guildId, ss2);
    }
  } catch {}
}

/**
 * Determines the number of points to award based on difficulty( not hints used yet).
 * @param {*} difficulty
 * @param {*} hintsUsed
 * @returns
 */
function pointsFor(difficulty, hintsUsed) {
  const basePts = {
    easy: 1,
    medium: 2,
    hard: 3,
  }
  let pts = basePts[difficulty] || 1;

  if (hintsUsed) {
    pts = Math.max(1, pts - hintsUsed);
  }
  return pts;
}

// utility used by tests; not part of the command logic itself
function normalize(str) {
  return String(str)
    .replace(/\([^\)]*\)/g, "")
    .replace(/[\p{P}$+<=>^`|~]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const _test = {
  pointsFor,
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
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: "Guild only.", ephemeral: true });

    const existing = getSession(guild.id);
    if (existing?.active) {
      return interaction.reply({ content: "⚠️ Trivia is already running in this server.", ephemeral: true });
    }
    // Difficulty selection buttons for users to select 
    // Difficulty selection UI
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
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("trivia_difficulty_easy").setLabel("Easy").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("trivia_difficulty_medium").setLabel("Medium").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("trivia_difficulty_hard").setLabel("Hard").setStyle(ButtonStyle.Danger)
    );
    // Send the message and wait for the user to select a difficulty.
    await interaction.reply({ embeds: [embed], components: [row] });
    const pickMsg = await interaction.fetchReply();
    /**
     * The collector listens for the button and resolves with the selected difficulty
     * and also handles the case where the user takes too long to respond(timeout, and aborts game).
     * Once selection is made or timeout, we disable the buttons.
     */
    const difficulty = await new Promise((resolve) => {
      const collector = pickMsg.createMessageComponentCollector({
        // Timeout limit(60 sec)
        time: 60000,
        max: 1,
        // Filter to ensure the user who initiated the command can click the buttons and only those buttons.
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
    // Disable difficulty buttons, if not already disabled. Prevents multiple selections and
    // also provides feedback that selection was received or timed out.
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
    // If the difficulty selection timeout occurs, we tell the user
    // and abort the game setup. They can run the command again to start again
    if (!difficulty) {
      return interaction.followUp({
        content: "⏱️ Difficulty selection timed out. Run **/trivia** again to play again!",
        ephemeral: true,
      });
    }
    // Finds the vc that the bot will enter to play the music previews and the tc 
    // where the questions will be posted. The vc is required to play the game, 
    // but for the tc we can fall back to the channel where the command was invoked 
    // if a channel with the specified name is not found.
    const vc = findVoiceChannel(guild);
    const tc = findTextChannel(guild, interaction.channel);
    // If the required vc and tc are not found we abort and let the user know to set them up.
    if (!vc) {
      return interaction.followUp({ content: `❌ Missing voice channel **${VOICE_CHANNEL_NAME}**.`, ephemeral: true });
    }
    if (!tc) {
      return interaction.followUp({ content: `❌ Missing text channel **#${TEXT_CHANNEL_NAME}**.`, ephemeral: true });
    }
    // Session init (flowchart: instructions given)
    // This resets scores for all users in the guild,
    // TODO: find a way to preserve scores across multiple games while still allowing for new players to join with 0 points.
    // Have a admin manually reset scores command so that scores can persist across games?
    resetScores(guild.id);
     // This session object will be used to keep track of the current game state.
    const session = {
      active: true,
      terminated: false,
      guildId: guild.id,
      hostId: interaction.user.id,
      difficulty,
      totalRounds: 10,
      round: 0,
      currentTrack: null,
      textChannelId: tc.id,
      voiceChannelId: vc.id,

      // runtime handles for instant termination
      connection: null,
      player: null,
      roundCollector: null,
      timerInterval: null,
      previewStopper: null,
      roundMessageId: null,
      tmpFile: null,
    };
    // Sets the session in the global game state 
    // so that it can be accessed by other parts of the code to manage the games flow and state.
    setSession(guild.id, session);
    // Gets the genre preference for the guild, maybe have it just for the game and add a genre picker?
    const genre = getGenre(guild.id);
    // Sends the initial instructions message to the text channel, outlining the rules and how to play the game.
    await tc.send(
      `📢 **Music Trivia started!**\n` +
        `The difficulty you chose was: **${difficulty.toUpperCase()}** • The current genre is: **${genre}**\n\n` +
        `Here are the rules of how to play the music trivia game!\n` + 
        `➡️ **First**, join the voice channel **${VOICE_CHANNEL_NAME}** to hear the previews we will play to you.\n\n` +
        `✅ You’ll hear **30s** of a song preview and have time to guess the correct answer after.\n\n` +
        `💬 When the preview ends you’ll have **15 seconds** to answer the question using the **multiple-choice** buttons in <#${tc.id}>.\n\n` +
        `🔁 The **replay** button lets you hear the song one more time; using it restarts the timer (only once per round).\n\n` +
        `💡 The **hint** button provides one clue per round with a **penalty** applied **only** in the difficulty **Medium** of -1 point. **No hints for Hard difficulty**.\n\n` +
        `⚠️ Wrong answers will be marked with a red ❌ and correct answers with a green ✅.\n\n` +
        `🏅 Points are awarded based on difficulty: **Easy**: 1 point, **Medium**: 2 points, **Hard**: 3 points.\n\n` +
        `🏆 At the end of 10 rounds, the player with the most points wins! In case of a tie, the player who answered faster wins.\n\n` +
        `📊 Your score and stats will be tracked across games, so keep playing to climb the leaderboard and show off your music knowledge!` 

    );
    // flowchart: User in Game channel? (loop)
    // Check if the user in the Game vc channel before starting the game. We give 
    // them 2 minutes before aborting the game setup. 
    const ok = await waitForUserInVC(guild, interaction.user.id, vc.id, 120000);
    // If they are not in the vc after 2 minutes we clear the session and abort the game setup
    if (!ok) {
      clearSession(guild.id);
      return tc.send(`❌ <@${interaction.user.id}> didn’t join **${VOICE_CHANNEL_NAME}** in time. Game cancelled.`);
    }
    // Connect once for all 10 rounds instead of connecting and reconnecting for each round.
    let connection = null;
    let player = null;

    // We wrap the whole game flow in a try catch finally to ensure that if err occur we can clean up 
    // the connection and session in the finally block to prevent orphaned connections or sessions that block future games from starting.
    try {
      // Joins the vc and sets up the audio player
      const voice = await ensureVoice(guild, vc);
      // We keep the connection and player in variables that can be accessed and used throughout the game.
      connection = voice.connection;
      player = voice.player;
      
      // Keep track of every user who has wrote an answer so their games played stat can be updated
      const playersAcrossAllRounds = new Set();
      // The 10 rounds are here, this is the core gameplay loop where we play previews, collect answer, and manage the state for each round.
      // TODO: Add a way to break out of the loop early if there are no players or if the admin wants to end the game early.(Maybe even user who invoked it too?)

      const ssVoice = getSession(guild.id);
      if (ssVoice) {
        ssVoice.connection = connection;
        ssVoice.player = player;
        setSession(guild.id, ssVoice);
      }

      // The 10 rounds are here, this is the core gameplay loop where we play previews, collect answer, and 
      // manage the state for each round.
      // TODO: Add a way to break out of the loop early if there are no players 
      // or if the admin wants to end the game early.(Maybe even user who invoked it too?)
      for (let round = 1; round <= 10; round++) {
        const s = getSession(guild.id);
        // check for an administrator-initiated termination 
        if (s?.terminated) break;
        if (!s?.active) break;
        //TODO: Prone to a bug if multiple users are playing and the host leaves, maybe have the
        // the game be to a single player or have a way to transfer host if the host leaves?
        // (Just an idea that we may not have the time for)
        const stillInVc = await waitForUserInVC(guild, interaction.user.id, vc.id, 60000);
        if (!stillInVc) {
          await tc.send(`⚠️ <@${interaction.user.id}> please re-join **${VOICE_CHANNEL_NAME}** to continue...`);
          const back = await waitForUserInVC(guild, interaction.user.id, vc.id, 120000);
          if (!back) {
            await tc.send(`❌ Game cancelled (host didn’t rejoin VC).`);
            break;
          }
        }
        // clear old song preview stoppers from previous round so it doesn't cut off new song preview
        const prevSession = getSession(guild.id);
        if (prevSession?.previewStopper) {
          clearTimeout(prevSession.previewStopper);
          prevSession.previewStopper = null;
          setSession(guild.id, prevSession);
        }



        // Round state
        // always pull a fresh random track; previous connection logic
        // (err.g. from /game) has been removed and is no longer relevant.
        const track = await getRandomItunesTrack(genre);
        const tmp = await downloadPreview(track.previewUrl);

        const updated = getSession(guild.id);
        updated.round = round;
        updated.currentTrack = track;
        updated.tmpFile = tmp;
        // Sets the current track and tmp file in the session and updates the round so that it can be accessed by the answer collection logic
        // and the replay button logic to manage the game state and flow properly
        setSession(guild.id, updated);
        // Sends a message to tc to indicate the round is starting and that the preview is playing. Just UI feedback
        // and also to allow the user to know how long the preview plays for.
        const listenEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(`🎧 Round ${round}/10`)
          .setDescription(`Listening for **30 seconds**...`)
          .addFields(
            { name: "Difficulty", value: difficulty.toUpperCase(), inline: true },
            { name: "Genre", value: String(genre).toUpperCase(), inline: true }
          );

        // changes time allowed for each round depending on difficulty 
        const difficultyTimer = {
          easy: { base: 15, replayAdd: 15 },
          medium: { base: 15, replayAdd: 10 },
          hard: { base: 15, replayAdd: 5 },
        };

        const { base, replayAdd } = difficultyTimer[difficulty];
          // We keep a reference to this message so that we can delete it after the preview is over to keep the channel clean.
          // Button to skip preview of the song and go straight to questions
          const previewRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("skip_preview")
              .setLabel("Skip Preview")
              .setStyle(ButtonStyle.Primary)
          );
          const listenMsg = await tc.send({ embeds: [listenEmbed], components: [previewRow], });
          const previewCollector = listenMsg.createMessageComponentCollector({
          time: 30000,
          });

          previewCollector.on("collect", async (i) => {
            if (i.customId !== "skip_preview") return;

            await i.deferUpdate();

            try {
              player.stop(true); 
            } catch {}

            previewCollector.stop("skipped");
          });
        
        
          // flowchart: User listens to song for 30 seconds -> question + answers are shown in tc
        try {
          await playPreview(player, tmp, guild.id);
          // disable button after preview finishes
          try {
            const disabledRow = new ActionRowBuilder().addComponents(
              previewRow.components.map((b) =>
                ButtonBuilder.from(b).setDisabled(true)
              )
            );

            await listenMsg.edit({ components: [disabledRow] });
          } catch {}

          const sAfterPreview = getSession(guild.id);
          if (!sAfterPreview?.active || sAfterPreview?.terminated) {
            try { await safeUnlink(tmp); } catch {}
            try { await listenMsg.delete().catch(() => {}); } catch {}

            try {
              const ss = getSession(guild.id);
              if (ss?.tmpFile === tmp) {
                ss.tmpFile = null;
                setSession(guild.id, ss);
              }
            } catch {}

            break;
          }
        } catch (err) {
          if (String(err.message).includes("FFmpeg/avconv not found")) {
            await tc.send(
              "❌ Audio playback failed: FFmpeg is not installed on the server. Please install it before running trivia."
            );
          } else {
            await tc.send(`❌ Audio playback err: ${err.message}`);
          }
          throw err;
        }

        const question = await makeSongQuestion(track, difficulty);
        
        const { embed: questionEmbed, actionRow: answerRow } = createTriviaQuestion(question);

        // question row plus control row (replay button)
        // For hard difficulty, disable the hint button since no hints are allowed
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
            .setDisabled(difficulty === "hard")
        );

        const roundMsg = await tc.send({
          embeds: [questionEmbed],
          components: [answerRow, controlRow],
        });

        const ssRoundMsg = getSession(guild.id);
        if (ssRoundMsg) {
          ssRoundMsg.roundMessageId = roundMsg.id;
          setSession(guild.id, ssRoundMsg);
        }

        let replayUsed = false;
        let hintUsed = false;

        let winner = { correct: false, userId: null };
        const answeredUsers = new Set();

        const freezeActive = consumeFreeze(guild.id, interaction.user.id);
        if (freezeActive) {
          await tc.send(`❄️ Freeze Time activated! No timer this round.`);
        }
        const doublePtsActive = consumeDoublePoints(guild.id, interaction.user.id);
        if(doublePtsActive) {
          await tc.send(`💰 **Double Points** activated! You will earn **${question.points * 2}** points if you guess right!`);
        }

        const collectorOptions = {};
        if (!freezeActive) {
          collectorOptions.time = 15000;
        }

        const componentCollector = roundMsg.createMessageComponentCollector(collectorOptions);

        const ssCollector = getSession(guild.id);
        if (ssCollector) {
          ssCollector.roundCollector = componentCollector;
          setSession(guild.id, ssCollector);
        }

        let timeLeft = base;
        let timerInterval = null;

        function startTimer() {
          clearInterval(timerInterval);
          timeLeft = base;
          // This is the countdown for the timer
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

          // store interval immediately so /terminate can clear it instantly
          try {
            const ssTimer = getSession(guild.id);
            if (ssTimer) {
              ssTimer.timerInterval = timerInterval;
              setSession(guild.id, ssTimer);
            }
          } catch {}
        }

        if (!freezeActive) startTimer();

        // when we restart via replay we will reset this collector’s timer
        componentCollector.on("collect", async (i) => {
          const st = getSession(guild.id);
          if (!st?.active || st?.terminated) {
            try { await i.deferUpdate(); } catch {}
            return;
          }

          // ===== ANSWERS =====
          if (i.customId.startsWith("trivia_answer_")) {
            if (answeredUsers.has(i.user.id)) {
              await i.reply({ content: "You already answered this round.", ephemeral: true });
              return;
            }
            answeredUsers.add(i.user.id);
            playersAcrossAllRounds.add(i.user.id);
            addRoundPlayed(guild.id, i.user.id); // increase their rounds played stat
            // determine which answer they selected based on the customID of the button they clicked and check if correct
            const idx = parseInt(i.customId.replace("trivia_answer_", ""), 10);
            const selected = question.options[idx];
            if (selected === question.correctAnswer) { // if their answer was correct
              winner = { correct: true, userId: i.user.id, selected };
              try { clearInterval(timerInterval); } catch {}

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
              return;
            }

            const newAnswerRow = ActionRowBuilder.from(answerRow).setComponents(
              answerRow.components.map((b) =>
                b.data.custom_id === i.customId
                  ? ButtonBuilder.from(b).setStyle(ButtonStyle.Danger).setDisabled(true)
                  : ButtonBuilder.from(b)
              )
            );

            await roundMsg.edit({ components: [newAnswerRow, controlRow] }).catch(() => {});
            await i.reply({ content: "❌ Wrong answer!", ephemeral: true });
            
            // round ends immediately if freeze is active and answer was wrong
            if (freezeActive) {
              try { clearInterval(timerInterval); } catch {}
              componentCollector.stop("freeze_wrong");
            }
            return;
          }

          // ===== REPLAY =====
          if (i.customId === "trivia_replay") {
            if (replayUsed) {
              await i.reply({ content: "Replay already used for this song.", ephemeral: true });
              return;
            }
            replayUsed = true;

            const ss = getSession(guild.id);
            if (!ss?.active || ss?.terminated || !ss.tmpFile) {
              await i.reply({ content: "Replay unavailable.", ephemeral: true });
              return;
            }

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

            (async () => {
              try {
                try { player.stop(true); } catch {}

                const resource = createAudioResource(ss.tmpFile, { inputType: StreamType.Arbitrary });
                player.play(resource);

                const stopper = setTimeout(() => {
                  try { player.stop(true); } catch {}
                }, 32000);

                try {
                  const st2 = getSession(guild.id);
                  if (st2) {
                    st2.previewStopper = stopper;
                    setSession(guild.id, st2);
                  }
                } catch {}

                await new Promise((resolve) => player.once(AudioPlayerStatus.Idle, resolve));
                clearTimeout(stopper);

                try {
                  const st3 = getSession(guild.id);
                  if (st3?.previewStopper === stopper) {
                    st3.previewStopper = null;
                    setSession(guild.id, st3);
                  }
                } catch(err) {console.error("Failed to stop session", err)}
              } catch {}
            })();
            if (!freezeActive) {
              timeLeft = Math.min(timeLeft + replayAdd, 15);
              componentCollector.resetTimer({ time: base * 1000 });

              try {
                const updatedEmbed = EmbedBuilder.from(questionEmbed).setFooter({
                  text: `⏳ Time left: ${timeLeft}s`,
                });

                await roundMsg.edit({
                  embeds: [updatedEmbed],
                  components: [answerRow, controlRow],
                });
              } catch(err) {console.error("Failed to update timer UI after replay",err)}
            }
            return;
          }

          // ===== HINT =====
          if (i.customId === "trivia_hint") {
            // hints are not allowed for hard difficulty
            if (difficulty === "hard") {
              await i.reply({ content: "Hints are not allowed for hard difficulty.", ephemeral: true });
              return;
            }
            if (hintUsed) {
              await i.reply({ content: "Hint already used this round.", ephemeral: true });
              return;
            }
            hintUsed = true;
            addHintUsed(guild.id, i.user.id);


            try {
              const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
                controlRow.components.map((b) =>
                  b.data.custom_id === "trivia_hint"
                    ? ButtonBuilder.from(b).setDisabled(true)
                    : ButtonBuilder.from(b)
                )
              );
              await roundMsg.edit({ components: [answerRow, disabledCtrl] }).catch(() => {});
            } catch(err) { console.error("Failed to disable components:", err); }

            const hint = makeHint(track, question.type);
            if(difficulty === "medium") {
              await i.reply({ content: `💡 Hint: ${hint}\n⚠️**Hint used**: points deducted by 1`, ephemeral: true }).catch(async () => {
                await tc.send(`💡 Hint: ${hint}`).catch(() => {});
              });
            } else {
              await i.reply({ content: `💡 Hint: ${hint}`, ephemeral: true }).catch(async () => {
                await tc.send(`💡 Hint: ${hint}`).catch(() => {});
              });
            }
            return;
          }
        });

        const endPromise = new Promise((resolve) => {
          componentCollector.on("end", async (_collected, reason) => {
            const stEnd = getSession(guild.id);

            if (reason === "terminated" || !stEnd?.active || stEnd?.terminated) {
              try { clearInterval(timerInterval); } catch(err) { console.error("Failed to clear timer interval:", err); }

              try {
                const disabledAnswer = ActionRowBuilder.from(answerRow).setComponents(
                  answerRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
                );
                const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
                  controlRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
                );
                await roundMsg.edit({ components: [disabledAnswer, disabledCtrl] }).catch(() => {});
              } catch(err) { console.error("Failed to disable components:", err); }

              try {
                const ss2 = getSession(guild.id);
                if (ss2?.tmpFile) {
                  await safeUnlink(ss2.tmpFile);
                  ss2.tmpFile = null;
                  setSession(guild.id, ss2);
                }
              } catch(err) { console.error("Failed to cleanup temporary file:", err); }

              try { await listenMsg.delete().catch(() => {}); } catch(err) { console.error("Failed to delete listen message:", err); }

              resolve();
              return;
            }

            // when round ends highlight correct answer if nobody already chose it
            try {
              const highlighted = ActionRowBuilder.from(answerRow).setComponents(
                answerRow.components.map((b) => {
                  const btn = ButtonBuilder.from(b);
                  const idx = parseInt(btn.data.custom_id.replace("trivia_answer_", ""), 10);
                  if (question.options[idx] === question.correctAnswer) btn.setStyle(ButtonStyle.Success);
                  return btn.setDisabled(true);
                })
              );

              const disabledCtrl = ActionRowBuilder.from(controlRow).setComponents(
                controlRow.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
              );

              await roundMsg.edit({ components: [highlighted, disabledCtrl] }).catch(() => {});
            } catch(err) { console.error("Failed to highlight correct answer:", err); }

            const answerLine = `✅ **Correct answer:** ${question.correctAnswer}`;

            if (winner.correct && winner.userId) {
              
              let pts =  pointsFor(difficulty, false);

              if(doublePtsActive) {
                pts *= 2;
                // Changes the question points to display the double points gained
                question.points = pts;
              }
              pts = hintUsed && difficulty === "medium" ? pts - 1 : pts; // apply hint penalty if medium difficulty and hint was used
              // TODO: This round will need to be changed to match our 10 rounds
              if(round < 10) {
                await tc.send(`🎉 <@${winner.userId}> got it right and earned **${pts}** points! Get ready for the next round...`);
                const powerupWon = awardRandomPowerup(guild.id, winner.userId);
                if (powerupWon) {
                  const powerupName = powerupWon === "freeze" ? "❄️ Freeze Time" : "💰 Double Points";
                  await tc.send(`🎁 **Bonus!** <@${winner.userId}> won a **${powerupName}** for the next round!`);
                } else {
                  await tc.send(`🎁 <@${winner.userId}> did not win a power-up this time. Better luck next round!`);
                }
              } else {
                await tc.send(`🎉 <@${winner.userId}> got it right and earned **${pts}** points!`);
              }
              
              addPoints(guild.id, winner.userId, pts);
              addRoundWon(guild.id, winner.userId); // increase their rounds won stat
              const top = getGuildScoresSorted(guild.id).slice(0, 5);
              const topLines = top.map(([uid, p], idx) => `${idx + 1}. <@${uid}> — **${p}**`).join("\n");

              const resultEmbed = createResultEmbed(question, winner.selected, {
                username: `<@${winner.userId}>`,
              });

              await tc.send({ embeds: [resultEmbed] });
              await tc.send(`🏆 **Top Scores**\n${topLines}`);
            } else {
              await tc.send(`❌ Time! No correct guesses.\n${answerLine}`);
            }

            await sleep(5000);

            try {
              const ss2 = getSession(guild.id);
              if (ss2?.tmpFile) {
                await safeUnlink(ss2.tmpFile);
                ss2.tmpFile = null;
                setSession(guild.id, ss2);
              }
            } catch(err) { console.error("Failed to cleanup temporary file:", err); }

            try { await listenMsg.delete().catch(() => {}); } catch(err) { console.error("Failed to delete listen message:", err); }

            resolve();
          });
        });

        await endPromise;
        const stAfterRound = getSession(guild.id);
        if (stAfterRound?.terminated || !stAfterRound?.active) break;
      }

      // flowchart: Answered 10 questions? -> end
      // Handles the end of the game logic by getting the final scores, 
      // displaying the final leaderboard, cleaning up the session and connection, 
      // and updating stats for all who played'
      for(const userId of playersAcrossAllRounds) {
        addGamePlayed(guild.id, userId); // increase their games played stat
      }
      const final = getGuildScoresSorted(guild.id);
      if (!final.length) {
        await tc.send("🏁 Game over! No points scored.");
      } else {
        const highestScorer = final[0];
        addGameWon(guild.id, highestScorer[0]); // increase their games won stat
        const lines = final.slice(0, 10).map(([uid, pts], i) => `${i + 1}. <@${uid}> — **${pts}**`);
        await tc.send(`🏁 **Game over! Final scoreboard:**\n${lines.join("\n")}`);
      }

      // ===== END OF GAME (SKIP IF TERMINATED) =====
      const stFinal = getSession(guild.id);
      if (!stFinal?.terminated) {
        const final = getGuildScoresSorted(guild.id);
        if (!final.length) {
          await tc.send("🏁 Game over! No points scored.");
        } else {
          const lines = final
            .slice(0, 10)
            .map(([uid, pts], i) => `${i + 1}. <@${uid}> — **${pts}**`);
          await tc.send(`🏁 **Game over! Final scoreboard:**\n${lines.join("\n")}`);
        }
      }
    } finally {
      // cleanup (always)
      try {
        const s = getSession(guild.id);
        if (s?.timerInterval) clearInterval(s.timerInterval);
      } catch {}

      try { player?.stop(true); } catch {}
      try { connection?.destroy(); } catch {}

      try {
        const s = getSession(guild.id);
        if (s?.tmpFile) await safeUnlink(s.tmpFile);
      } catch {}

      clearSession(guild.id);
    }
  },
};