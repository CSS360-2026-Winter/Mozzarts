// Helper for creating trivia question embeds and buttons [VERSION .01]

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getRandomQuestion } from "../data/triviaQuestions.js";

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

  // Create buttons for each answer option
  const buttons = question.options.map((option) =>
    new ButtonBuilder()
      .setCustomId(`trivia_answer_${option}`)
      .setLabel(option)
      .setStyle(ButtonStyle.Primary)
  );

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
