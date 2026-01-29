const { SlashCommandBuilder } = require('discord.js');
const scoreStore = require('../scoreStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('getscore')
    .setDescription('Shows the current game score'),

  async execute(interaction) {
    const score = scoreStore.getScore();

    await interaction.reply(`Current score: **${score}**`);
  }
};
