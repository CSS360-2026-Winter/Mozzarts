//import { SlashCommandBuilder } from "discord.js";
import { addPowerupUsed } from "../helpers/statsStore.js";

const powerups = new Map();

function getGuildStore(guildId) {
  if (!powerups.has(guildId)) {
    powerups.set(guildId, {});
  }
  return powerups.get(guildId);
}

export function awardRandomPowerup(guildId, userId) {
  const guildStore = getGuildStore(guildId);
  const options = ["freeze", "doublePoints"];
  const randPowerup = options[Math.floor(Math.random() * options.length)];

  // Check if they already have it to prevent over-stacking
  if (guildStore[userId]?.[randPowerup]) return null;

  // Save it
  guildStore[userId] = { ...guildStore[userId], [randPowerup]: true };
  return randPowerup;
}

//Checks if user has a freeze powerup.
export function consumeFreeze(guildId, userId) {
  const guildStore = powerups.get(guildId);
  if (!guildStore) return false;

  if (guildStore[userId]?.freeze) {
    delete guildStore[userId].freeze;
    addPowerupUsed(guildId, userId);
    return true;
  }

  return false;
}
// Checks if the user has the double points powerup and consumes it if they do.
export function consumeDoublePoints(guildId, userId) {
  const guildStore = powerups.get(guildId);
  if (guildStore?.[userId]?.doublePoints) {
    guildStore[userId].doublePoints = false; // Use it up
    addPowerupUsed(guildId, userId);
    return true;
  }
  return false;
}
/*
export default {
  data: new SlashCommandBuilder()
    .setName("powerup")
    .setDescription("Give yourself a random powerup for the next round"),

  async execute(interaction) {
   
    await interaction.deferReply({ephemeral: true});
     if (!interaction.guild) {
      return interaction.editReply({
        content: "Guild only command.",
        ephemeral: true,
      });
    }

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const guildStore = getGuildStore(guildId);
    const options = ["freeze", "doublePoints"];

    
    // For randomly getting a powerup from the powerup options
    const randPowerup = options[Math.floor(Math.random() * options.length)]
    // Prevent stacking infinite freezes
    if( randPowerup == "freeze") {
      if (guildStore[userId]?.freeze) {
      return interaction.editReply({
        content: "❄️ You already have a Freeze Time powerup!",
      });
      } else {
        guildStore[userId] = { ...guildStore[userId], freeze: true };
        await interaction.editReply({
          content:
            "❄️ You received a **Freeze Time** powerup!\n" +
            "It will remove the timer for one round",
        });
      }
    } else if(randPowerup == "doublePoints") {
      // Prevent stacking infinite doublePoints
      if (guildStore[userId]?.doublePoints) {
        return interaction.editReply({
          content: "💰 You already have a Double Points powerup!",
        });
      } else {
        guildStore[userId] = { ...guildStore[userId], doublePoints: true };
        await interaction.editReply({
          content:
            "💰 You received a **Double Points** powerup!\n" +
            "It will double your points for one round",
        });
      }
    }
  },
  
};*/