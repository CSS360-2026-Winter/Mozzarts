import {EmbedBuilder, SlashCommandBuilder } from "discord.js";
// Allows for the path of the rules.json to be used for ease of changing the rules
import {getRules} from "../helpers/rules.js";

export default {
    data: new SlashCommandBuilder()
        .setName("rules")
        .setDescription("Music trivia rules!")
    ,
    
    async execute(interaction) {
        const rules = getRules();

        const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("Music Trivia Game Rules")
        .setDescription(rules.intro)
        .addFields(
            { name: 'Difficulties:', value: rules.difficulties.map(g =>`- ${g}`).join('\n'), inline: true },
            { name: 'How to Play', value: rules.gameplay.map(g => `- ${g}`).join('\n') }
        )
        .setFooter({ text: 'Good luck, maestro!' });

        //Ephemeral allows for the user that requested the rules to see it
        await interaction.reply({
        content: "Here are the rules",
        embeds: [embed],
        ephemeral: true,
        });
    },
};

