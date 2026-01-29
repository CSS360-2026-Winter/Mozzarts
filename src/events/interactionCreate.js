import { createResultEmbed, getTriviaQuestion, createTriviaQuestion } from "../helpers/trivia.js";
import { triviaQuestions } from "../data/triviaQuestions.js";
import { ActionRowBuilder, ButtonBuilder } from "discord.js";

export default {
  name: "interactionCreate",
  async execute(interaction) {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(err);
        await interaction.reply({
          content: "Something went wrong :( :( :(",
          ephemeral: true,
        });
      }
    }

    // Handle button interactions
    if (interaction.isButton()) {
      try {
        // Handle difficulty selection
        if (interaction.customId.startsWith("trivia_difficulty_")) {
          const difficulty = interaction.customId.replace("trivia_difficulty_", "");

          // Get a random question of the selected difficulty
          const question = getTriviaQuestion(difficulty);

          if (!question) {
            await interaction.reply({
              content: "Could not find a question. Please try again!",
              ephemeral: true,
            });
            return;
          }

          // Create the question embed and buttons
          const { embed, actionRow } = createTriviaQuestion(question);

          // Reply with the question
          await interaction.reply({
            embeds: [embed],
            components: [actionRow],
          });
        }

        // Handle answer selection
        if (interaction.customId.startsWith("trivia_answer_")) {
          // Extract the answer from the button ID
          const userAnswer = interaction.customId.replace("trivia_answer_", "");

          // Find the question from the embed description
          const embedDescription = interaction.message.embeds[0]?.description;
          if (!embedDescription) {
            await interaction.reply({
              content: "Could not find the question. Please try again!",
              ephemeral: true,
            });
            return;
          }

          // Find the matching question
          const question = triviaQuestions.find((q) => q.question === embedDescription);

          if (!question) {
            await interaction.reply({
              content: "Could not find the question. Please try again!",
              ephemeral: true,
            });
            return;
          }

          // Create result embed
          const resultEmbed = createResultEmbed(question, userAnswer, interaction.user);

          // Reply with the result
          await interaction.reply({
            embeds: [resultEmbed],
          });

          // Disable the buttons after answering
        }
           const disabledRow = new ActionRowBuilder().addComponents(
             interaction.message.components[0].components.map((button) =>
               new ButtonBuilder(button.data).setDisabled(true)
             )
           );

           await interaction.message.edit({ components: [disabledRow] });
      } catch (err) {
        console.error(err);
        await interaction.reply({
          content: "Something went wrong :( :( :(",
          ephemeral: true,
        }).catch(() => {});
      }
    }
  },
};
