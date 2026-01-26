import { SlashCommandBuilder, userMention } from "discord.js";
import { getMeme } from "../helpers/meme.js";

export default {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Send a welcome message"),

  async execute(interaction) {
    const meme = await getMeme();

    await interaction.reply({
      content: `Welcome ${userMention(interaction.user.id)}, Here's a meme for you to enjoy!`,
      embeds: [meme],
    });
  },
};
