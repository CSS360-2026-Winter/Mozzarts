import { Events } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`
############################################################
#  Logged in as ${client.user.tag}!
#  Serving ${client.guilds.cache.size} servers.
#  Serving ${client.users.cache.size} users.
############################################################
`);
  },
};
