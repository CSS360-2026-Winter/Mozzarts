// Admin command to get the score of any player
import { PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { getRoundsPlayed, getRoundsWon, getGamesPlayed, getGamesWon, getHintsUsed, getPowerupsUsed } from "../helpers/statsStore.js";

export default {
  data: new SlashCommandBuilder()
    .setName("getstats")
    .setDescription("Shows the stats of a specific user")
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to get the stats for").setRequired(true)
    ),

    // Run the command
  async execute(interaction) {
    // Make sure they are an admin
    const member = interaction.member;
    if(!member.permissions.has(PermissionsBitField.Flags.Administrator)){
        return interaction.reply({
            content: "You must be a server administrator to use this command.",
            ephemeral: true,
        })
    }

    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    // Get user info
    const guildId = interaction.guild.id;
    const userId = interaction.options.getUser("user").id;
    const username = interaction.options.getUser("user").username;

    // Get stats for that user
    const roundsPlayed = getRoundsPlayed(guildId, userId);
    const roundsWon = getRoundsWon(guildId, userId);
    const gamesPlayed = getGamesPlayed(guildId, userId);
    const gamesWon = getGamesWon(guildId, userId);
    const hintsUsed = getHintsUsed(guildId, userId);
    const powerupsUsed = getPowerupsUsed(guildId, userId);

    await interaction.reply({
      content: `${username}'s stats:\nRounds played: ${roundsPlayed}\nRounds won: ${roundsWon}\nGames played: ${gamesPlayed}\nGames won: ${gamesWon}\nHints used: ${hintsUsed}\nPowerups used: ${powerupsUsed}`,
      ephemeral: true,
    });
  },
};