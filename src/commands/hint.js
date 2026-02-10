import { SlashCommandBuilder } from "discord.js";
import { getSession, setSession } from "../gameState.js";
import { makeHint } from "../helpers/hintHelper.js";

export default {
  data: new SlashCommandBuilder()
    .setName("hint")
    .setDescription("Get a hint for the current trivia round"),

  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ content: "Guild only.", ephemeral: true });

    const session = getSession(interaction.guild.id);
    if (!session?.active || !session.currentTrack) {
      return interaction.reply({ content: "❌ No active trivia round right now.", ephemeral: true });
    }

    if (session.hintsUsed >= session.maxHints) {
      return interaction.reply({ content: "❌ No more hints available this round.", ephemeral: true });
    }

    session.hintsUsed += 1;
    session.hintStage += 1;

    const hint = makeHint(session.currentTrack, session.hintStage, session.difficulty);
    setSession(interaction.guild.id, session);

    await interaction.reply({ content: `💡 Hint: ${hint}`, ephemeral: false });
  },
};
