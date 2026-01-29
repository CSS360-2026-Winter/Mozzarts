// Command to start a music trivia game [VERSION .01]

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("Start a music trivia game!"),

  async execute(interaction) {
    // Create difficulty selection embed
    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setTitle("🎵 Music Trivia")
      .setDescription("Select a difficulty level to begin!")
      .addFields(
        { name: "Easy", value: "1 point per correct answer", inline: true },
        { name: "Medium", value: "2 points per correct answer", inline: true },
        { name: "Hard", value: "3 points per correct answer", inline: true }
      );

    // Create difficulty buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("trivia_difficulty_easy")
        .setLabel("Easy")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("trivia_difficulty_medium")
        .setLabel("Medium")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("trivia_difficulty_hard")
        .setLabel("Hard")
        .setStyle(ButtonStyle.Danger)
    );

    // Send difficulty selection
    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
