// Helper for creating trivia question embeds and buttons [VERSION .01]

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getRandomQuestion } from "../data/triviaQuestions.js";
import { getRandomItunesTrack } from "./itunes.js";

// lightweight utility
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Creates a trivia question embeds and buttons
 * @param {object} question - The trivia question object
 * @returns {object} Object containing embed and actionRow
 */
export function createTriviaQuestion(question) {
  const embed = new EmbedBuilder()
    .setColor(0x1db954) // Spotify green
    .setTitle("🎵 Music Trivia Question")
    .setDescription(question.question)
    .addFields(
      {
        name: "Difficulty",
        value: `${question.difficulty.toUpperCase()} (${question.points} point${question.points > 1 ? "s" : ""})`,
        inline: true,
      }
    )
    .setFooter({ text: "Click the button with the correct answer!" });

  // Create buttons for each answer option. Use the option index in the
  // customId rather than the full text to avoid length limits and encoding
  // problems; the handler will look up the answer in the question object.
  const buttons = question.options.map((option, idx) => {
    const label = option.length > 80 ? option.slice(0, 77) + "..." : option; // truncate if too long
    return new ButtonBuilder()
      .setCustomId(`trivia_answer_${idx}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary);
  });

  // Create action row with buttons (Discord allows max 5 buttons per row)
  const actionRow = new ActionRowBuilder().addComponents(buttons);

  return { embed, actionRow };
}

/**
 * Create a result embed based on user's answer
 * @param {object} question - The trivia question object
 * @param {string} userAnswer - The user's selected answer
 * @param {object} user - The user who answered
 * @returns {object} Result embed
 */
export function createResultEmbed(question, userAnswer, user) {
  const isCorrect = userAnswer === question.correctAnswer;

  const embed = new EmbedBuilder()
    .setTitle(isCorrect ? "✅ Correct!" : "❌ Wrong!")
    .setColor(isCorrect ? 0x00ff00 : 0xff0000)
    .setDescription(
      `**Question:** ${question.question}\n\n**Correct Answer:** ${question.correctAnswer}\n**Your Answer:** ${userAnswer}`
    )
    .addFields({
      name: "Points Earned",
      value: isCorrect ? `+${question.points} points` : "+0 points",
      inline: true,
    })
    .setFooter({ text: `Answered by ${user.username}` });

  return embed;
}

/**
 * Gets a random trivia question
 * @param {string} difficulty - Optional: 'easy', 'medium', or 'hard'
 * @returns {object} Question object
 */
export function getTriviaQuestion(difficulty = null) {
  return getRandomQuestion(difficulty);
}

/**
 * Build a multiple-choice question for a specific iTunes track.
 * @param {object} track
 * @param {string} difficulty
 * @returns {Promise<object>}
 */
export async function makeSongQuestion(track, difficulty = "easy", otherTrackProvider = getRandomItunesTrack) {
  const TYPES = [
    { id: "artist", label: "Who is the artist of this song?", getter: (t) => t.artistName },
    { id: "album", label: "Which album is this song from?", getter: (t) => t.collectionName },
    { id: "genre", label: "What genre does this song belong to?", getter: (t) => t.primaryGenreName },
    {
      id: "year",
      label: "In what year was this song released?",
      getter: (t) => {
        try {
          const d = new Date(t.releaseDate);
          if (Number.isNaN(d.getTime())) return null;
          return String(d.getFullYear());
        } catch {
          return null;
        }
      },
    },
    { id: "title", label: "What is the name of this song?", getter: (t) => t.trackName },
  ];

  // restrict question pool by difficulty
  let available;
  if (difficulty === "easy") {
    available = TYPES.filter((t) => ["artist", "genre"].includes(t.id));
  } else if (difficulty === "medium") {
    available = TYPES.filter((t) => ["album", "title"].includes(t.id));
  } else {
    available = TYPES.filter((t) => ["year"].includes(t.id));
  }
  if (!available.length) available = TYPES.slice();

  // pick a type that actually has a valid value in the track
  let choice;
  let correct;
  while (available.length) {
    choice = pick(available);
    correct = choice.getter(track);
    if (correct && correct !== "") break;
    available = available.filter((t) => t !== choice);
  }

  if (!correct) {
    // last-ditch fallback to track name itself
    choice = { id: "title", label: "What is the name of this song?", getter: (t) => t.trackName };
    correct = choice.getter(track) || "Unknown";
  }

  // gather up to three wrong answers from other tracks
  const wrongs = new Set();
  const genre = track.primaryGenreName || null;
  let attempts = 0;

  while (wrongs.size < 3 && attempts < 30) {
    attempts += 1;
    try {
      const other = await otherTrackProvider(genre);
      const val = choice.getter(other);
      if (val && val !== "" && val !== correct) {
        wrongs.add(val);
      }
    } catch {
      // ignore failed calls
    }
  }

  // ✅ FIX: pad until we truly have 3 unique wrong answers
  const fillers = ["Unknown", "N/A", "Other", "Choice A", "Choice B", "Choice C", "Choice D"];
  let fi = 0;
  while (wrongs.size < 3) {
    const f = fillers[fi] ?? `Choice ${fi + 1}`;
    fi += 1;
    if (f && f !== correct) wrongs.add(f);
    if (fi > 50) break; // ultra-safety
  }

  const options = [correct, ...Array.from(wrongs).slice(0, 3)];

  // shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return {
    difficulty,
    points: difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3,
    question: choice.label,
    correctAnswer: correct,
    options,
    type: choice.id,
  };
}