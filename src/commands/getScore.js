import { SlashCommandBuilder } from "discord.js";
import { getGuildScoresSorted, getTotalScore } from "../scoreStore.js";

export default {
  data: new SlashCommandBuilder()
    .setName("getscore")
    .setDescription("Shows the current trivia scoreboard"),

  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ content: "Guild only.", ephemeral: true });

    const scores = getGuildScoresSorted(interaction.guild.id);
    if (!scores.length) {
      return interaction.reply({ content: "No scores yet. Run **/trivia** to start!", ephemeral: true });
    }

    const lines = scores.slice(0, 10).map(([uid, pts], i) => {
      const mention = `<@${uid}>`;
      return `${i + 1}. ${mention} — **${pts}**`;
    });

    const total = getTotalScore(interaction.guild.id);

    await interaction.reply({
      content: `🏁 **Scoreboard (Top 10)**\n${lines.join("\n")}\n\nTotal points: **${total}**`,
      ephemeral: false,
    });
  },
};
