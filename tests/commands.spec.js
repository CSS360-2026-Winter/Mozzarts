import { expect } from "chai";
import scoreCmd from "../src/commands/score.js";
import getScoreCmd from "../src/commands/getScore.js";
import leaderboardCmd from "../src/commands/leaderboard.js";
import genreCmd from "../src/commands/genre.js";
import terminateCmd from "../src/commands/terminate.js";

import { addPoints, resetScores } from "../src/helpers/scoreStore.js";
import { getGenre, setSession, clearSession } from "../src/gameState.js";

import { makeMockInteraction } from "./testUtils.js";

describe("commands regression", () => {
  describe("/score", () => {
    it("rejects DM usage (no guild)", async () => {
      const interaction = makeMockInteraction({ guild: null });
      interaction.guild = null;

      await scoreCmd.execute(interaction);
      expect(interaction.reply.calls).to.have.lengthOf(1);
      expect(interaction.reply.last[0].content).to.include("only be used in a server");
      expect(interaction.reply.last[0].ephemeral).to.equal(true);
    });

    it("reports current and lifetime score in a guild", async () => {
      const g = "g_score_1";
      const u = "u_score_1";
      resetScores(g);

      addPoints(g, u, 2);
      addPoints(g, u, 3);

      const interaction = makeMockInteraction({ guildId: g, userId: u });
      await scoreCmd.execute(interaction);

      expect(interaction.reply.calls).to.have.lengthOf(1);
      const msg = interaction.reply.last[0];
      expect(msg.ephemeral).to.equal(true);
      expect(msg.content).to.include("Current score: 5");
      expect(msg.content).to.include("Lifetime score: 5");
    });
  });

  describe("/getscore", () => {
    it("rejects DM usage (no guild)", async () => {
      const interaction = makeMockInteraction({ guild: null, hasAdmin: true });
      interaction.guild = null;

      await getScoreCmd.execute(interaction);
      expect(interaction.reply.calls).to.have.lengthOf(1);
      expect(interaction.reply.last[0].content).to.include("This command can only be used in a server.");
      expect(interaction.reply.last[0].ephemeral).to.equal(true);
    });
  });

  describe("/leaderboard", () => {
    it("shows a friendly message when there are no scores", async () => {
      const g = "g_getscore_empty";
      resetScores(g);

      const interaction = makeMockInteraction({ guildId: g });
      await leaderboardCmd.execute(interaction);

      expect(interaction.reply.calls).to.have.lengthOf(1);
      expect(interaction.reply.last[0].content).to.include("No scores yet");
      expect(interaction.reply.last[0].ephemeral).to.equal(true);
    });

    it("prints Top 10 and includes total points", async () => {
      const g = "g_getscore_full";
      resetScores(g);

      for (let i = 1; i <= 12; i++) addPoints(g, `u${i}`, i);

      const interaction = makeMockInteraction({ guildId: g });
      await leaderboardCmd.execute(interaction);

      const msg = interaction.reply.last[0].content;
      expect(msg).to.include("**Scoreboard (Top 10)**");
      expect(msg).to.include("Total points: **78**");
      expect(msg).to.include("<@u12> — **12**");
      expect(msg).to.include("10. <@u3> — **3**");
      expect(msg).to.not.include("11.");
      expect(interaction.reply.last[0].ephemeral).to.equal(false);
    });
  });

  describe("/genre", () => {
    it("sets guild genre preference", async () => {
      const g = "g_genre_1";
      const interaction = makeMockInteraction({
        guildId: g,
        options: { type: "pop" },
      });

      await genreCmd.execute(interaction);

      expect(interaction.reply.calls).to.have.lengthOf(1);
      expect(interaction.reply.last[0].content).to.include("Trivia genre set to **pop**");
      expect(interaction.reply.last[0].ephemeral).to.equal(true);

      expect(getGenre(g)).to.equal("pop");
    });
  });

  describe("/terminate", () => {
    it("allows any player to terminate an active session", async () => {
      const g = "g_term_perm";
      setSession(g, { active: true, textChannelId: "c1" });

      const interaction = makeMockInteraction({
        guildId: g,
        hasAdmin: false,
      });

      interaction.guild.channels.fetch = async () => ({
        isTextBased: () => true,
        send: async () => undefined,
      });

      await terminateCmd.execute(interaction);

      expect(interaction.reply.calls).to.have.lengthOf(1);
      expect(interaction.reply.last[0].content).to.include("terminated immediately");
      expect(interaction.reply.last[0].flags).to.equal(64);

      clearSession(g);
    });

    it("terminates an active session and posts a public notice when channel exists", async () => {
      const g = "g_term_ok";
      const sent = [];
      setSession(g, { active: true, textChannelId: "c_game" });

      const interaction = makeMockInteraction({
        guildId: g,
        hasAdmin: true,
      });

      interaction.guild.channels.fetch = async () => ({
        isTextBased: () => true,
        send: async (m) => sent.push(m),
      });

      await terminateCmd.execute(interaction);

      expect(interaction.reply.calls).to.have.lengthOf(1);
      expect(interaction.reply.last[0].content).to.include("terminated");
      expect(interaction.reply.last[0].ephemeral).to.equal(true);

      expect(sent).to.deep.equal(["❌ **Game terminated by <@u1>.**"]);

      clearSession(g);
    });
  });
});