import {
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags,
} from "discord.js";

import { getSession, skipCurrentRound } from "../gameState.js";
import { interruptSession } from "../helpers/sessionControl.js";

export default {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Admin only: skip the current trivia round."),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Guild only.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const member = interaction.member;
    const isAdmin =
      member?.permissions?.has?.(PermissionsBitField.Flags.Administrator) ?? false;

    if (!isAdmin) {
      return interaction.reply({
        content: "You must be a server administrator to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildId = interaction.guild.id;
    const session = getSession(guildId);

    if (!session || !session.active) {
      return interaction.reply({
        content: "No active trivia round to skip.",
        flags: MessageFlags.Ephemeral,
      });
    }

    skipCurrentRound(guildId);
    const interruptedSession = await interruptSession(interaction.guild, guildId, "skipped");

    await interaction.reply({
      content: "⏭️ Current trivia round skipped.",
      flags: MessageFlags.Ephemeral,
    });

    if (interruptedSession?.textChannelId) {
      const channel = await interaction.guild.channels.fetch(interruptedSession.textChannelId).catch(() => null);
      if (channel?.isTextBased?.()) {
        await channel.send("⏭️ **Round skipped by administrator.**").catch(() => {});
      }
    }
  },
};