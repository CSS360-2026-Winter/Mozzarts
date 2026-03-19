import {
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags,
} from "discord.js";
import { resetScores } from "../helpers/scoreStore.js";

export default {
  data: new SlashCommandBuilder()
    .setName("reset-scores")
    .setDescription("Admin only: reset all trivia scores."),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Guild only.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const isAdmin =
      interaction.member?.permissions?.has?.(
        PermissionsBitField.Flags.Administrator
      ) ?? false;

    if (!isAdmin) {
      return interaction.reply({
        content: "You must be a server administrator to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    resetScores(interaction.guild.id);

    await interaction.reply({
      content: "🧹 All trivia scores have been reset.",
    });
  },
};
