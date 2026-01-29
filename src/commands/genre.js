import {EmbedBuilder, SlashCommandBuilder } from "discord.js";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("genre")
    .setDescription("Pick a genre of music")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Choose a music genre")
        .setRequired(true)
        .addChoices(
          { name: "Pop", value: "pop" },
          { name: "Hip Hop", value: "hiphop" },
          { name: "Rock", value: "rock" },
          { name: "Country", value: "country" },
          { name: "Classical", value: "classical" },
          { name: "Random", value: "random"}
        )
    ),

  async execute(interaction) {
    const genre = interaction.options.getString("type");

    await interaction.reply(`You picked **${genre}** music!`);
  },
};
