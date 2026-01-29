import { Events, MessageFlags } from "discord.js";

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.client.commands.get(interaction.commandName);
    if (!cmd) return;

    try {
      await cmd.execute(interaction);
    } catch (e) {
      console.error("[interactionCreate] Command error:", e);

      if (interaction.deferred || interaction.replied) {
        try { await interaction.editReply("❌ Failed"); } catch {}
      } else {
        try {
          await interaction.reply({ content: "❌ Failed", flags: MessageFlags.Ephemeral });
        } catch {}
      }
    }
  },
};
