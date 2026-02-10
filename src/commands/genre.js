import { SlashCommandBuilder } from "discord.js";
import { setGenre } from "../gameState.js";

export default {
  data: new SlashCommandBuilder()
    .setName("genre")
    .setDescription("Pick a genre for the next trivia session.")
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
          { name: "Random", value: "random" }
        )
    ),

  async execute(interaction) {
    const genre = interaction.options.getString("type");
    if (!interaction.guild) return interaction.reply({ content: "Guild only.", ephemeral: true });

    setGenre(interaction.guild.id, genre);
    await interaction.reply({ content: `✅ Trivia genre set to **${genre}** for this server.`, ephemeral: true });
  },
};
