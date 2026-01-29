// Requires: npm i -D fast-check
import fc from "fast-check";

import { getMeme } from "../helpers/meme.js";

const fakeInteraction = (content) => ({
  options: {
    getString: () => content,
  },

  reply: async ({ content: msgContent, embeds } = {}) => {
    const embedCount = Array.isArray(embeds) ? embeds.length : 0;
    console.log("Replied:", {
      contentLen: typeof msgContent === "string" ? msgContent.length : 0,
      embedCount,
    });
    return true;
  },
});

function normalizeEmbed(embed) {
  // discord.js EmbedBuilder has toJSON()
  if (embed && typeof embed.toJSON === "function") return embed.toJSON();
  return embed;
}

const fuzzMemeCommand = async () => {
  console.log("Starting fuzz test...");

  await fc.assert(
    fc.asyncProperty(
      fc.string({ maxLength: 500 }),
      async (randomInput) => {
        const interaction = fakeInteraction(randomInput);

        try {
          const meme = await getMeme();

          await interaction.reply({
            content: "Fuzz test response",
            embeds: [normalizeEmbed(meme)],
          });

          return true;
        } catch (err) {
          console.error("FUZZ CASE FAILED");
          console.error("Input:", JSON.stringify(randomInput));
          console.error(err?.stack || err);
          throw err;
        }
      }
    ),
    {
      numRuns: 50,
      // Prevent stalling
      interruptAfterTimeLimit: 30_000,
    }
  );

  console.log("Fuzz test finished!");
};

const argv1 = process.argv[1] || "";
const isDirectRun = argv1.includes("fuzz-meme") || argv1.endsWith("fuzz-meme.js");

if (isDirectRun || process.argv.includes("fuzz")) {
  fuzzMemeCommand()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { fuzzMemeCommand };
