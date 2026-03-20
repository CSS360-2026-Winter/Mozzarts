import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getSession, terminateSession } from "../gameState.js";
import { interruptSession } from "../helpers/sessionControl.js";

export default {
  data: new SlashCommandBuilder()
    .setName("terminate")
    .setDescription("Immediately end the current trivia game for everyone."),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "Guild only.", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const session = getSession(guildId);

    if (!session || !session.active) {
      return interaction.reply({
        content: "No active trivia game to terminate.",
        flags: MessageFlags.Ephemeral,
      });
    }

    terminateSession(guildId);
    const interruptedSession = await interruptSession(interaction.guild, guildId, "terminated");

    await interaction.reply({
      content: "✅ Trivia terminated immediately.",
      ephemeral: true,
      flags: MessageFlags.Ephemeral,
    });

    if (interruptedSession?.textChannelId) {
      const channel = await interaction.guild.channels.fetch(interruptedSession.textChannelId).catch(() => null);
      if (channel?.isTextBased?.()) {
        await channel.send(`❌ **Game terminated by <@${interaction.user.id}>.**`).catch(() => {});
      }
    }
  },
};