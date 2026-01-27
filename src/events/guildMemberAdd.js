import { EmbedBuilder, userMention } from "discord.js";

const CHANNEL_NAME = process.env.CHANNEL_NAME;
const MEME_URL = process.env.MEME_URL ;

const event = {
  name: "guildMemberAdd",
  async execute(member) {
    const channel = member.guild.channels.cache.find(
      (channel) => channel.name === CHANNEL_NAME
    );

    /*
      TODO: Change getWelcomeMessage to getWelcomeMessageWithMeme to send a meme to welcome your user.
    */
    const welcomeMessage = await getWelcomeMessage(member.id);
    channel.send(welcomeMessage);
  },
};

const getWelcomeMessage = (userId) => {
  /*
    this function returns a welcome message.
    Play around with the code here and customise the welcome message.
  */
  return {
    content: `Welcome ${userMention(userId)},
    This is Arteen's Personal Test Server so Goodluck!
  `,
  };
};

//
const getWelcomeMessageWithMeme = async (userId) => {
  /*
    this function returns a welcome message with a meme.
    Play around with the code here and customise the welcome message.

    TODO: Change this function to return different welcome message with a meme everytime a new user joins.
  */
  const meme = await getWelcomeMeme();
  // TODO: MOZZARTS, if you need to change the message you can! 
  // This is what I put and you all can and should change it to have fun with it!
  return {
    content: `Welcome ${userMention(userId)},
    This is Will's deployment server. The alpha watches over you all.`,
    embeds: [meme],
  };
};

const getWelcomeMeme = async () => {
  /*
    this function returns a meme.

    TODO: change this function to return a different meme randomly everytime a new user joins.
  */
  return new EmbedBuilder().setImage(MEME_URL);
};

export default event;
