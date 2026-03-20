import fs from "node:fs";
import { ActionRowBuilder, ButtonBuilder } from "discord.js";
import { getSession, setSession } from "../gameState.js";

export async function safeUnlink(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.error("[sessionControl] unlink failed:", err);
    }
  }
}

export function stopSessionTimer(session) {
  try {
    if (session?.timerInterval) clearInterval(session.timerInterval);
  } catch {}
}

export function stopPreviewStopper(session) {
  try {
    if (session?.previewStopper) clearTimeout(session.previewStopper);
  } catch {}
}

export function stopRoundCollector(session, reason) {
  try {
    if (session?.roundCollector && !session.roundCollector.ended) {
      session.roundCollector.stop(reason);
    }
  } catch {}
}

export function stopSessionAudio(session) {
  try {
    session?.player?.stop(true);
  } catch {}
}

export function destroySessionConnection(session) {
  try {
    session?.connection?.destroy();
  } catch {}
}

export async function deleteSessionTmpFile(session) {
  try {
    if (session?.tmpFile) {
      await safeUnlink(session.tmpFile);
    }
  } catch {}
}

async function fetchSessionTextChannel(guild, textChannelId) {
  if (!guild || !textChannelId) return null;
  return guild.channels.fetch(textChannelId).catch(() => null);
}

export async function disableRoundMessageButtons(guild, textChannelId, roundMessageId) {
  if (!textChannelId || !roundMessageId) return;

  try {
    const channel = await fetchSessionTextChannel(guild, textChannelId);
    if (!channel?.isTextBased?.()) return;

    const message = await channel.messages.fetch(roundMessageId).catch(() => null);
    if (!message?.components?.length) return;

    const disabledComponents = message.components.map((row) => {
      const rebuiltRow = ActionRowBuilder.from(row);
      rebuiltRow.setComponents(
        row.components.map((component) => ButtonBuilder.from(component).setDisabled(true))
      );
      return rebuiltRow;
    });

    await message.edit({ components: disabledComponents }).catch(() => {});
  } catch {}
}

export function clearRuntimeSessionRefs(session) {
  if (!session) return null;

  session.timerInterval = null;
  session.previewStopper = null;
  session.roundCollector = null;
  session.player = null;
  session.connection = null;
  session.roundMessageId = null;
  return session;
}

export function persistSession(guildId, session) {
  if (guildId && session) {
    setSession(guildId, session);
  }
}

export async function interruptSession(guild, guildId, reason) {
  const session = getSession(guildId);
  if (!session) return null;

  stopSessionTimer(session);
  stopPreviewStopper(session);
  stopRoundCollector(session, reason);
  stopSessionAudio(session);
  destroySessionConnection(session);
  await deleteSessionTmpFile(session);
  await disableRoundMessageButtons(guild, session.textChannelId, session.roundMessageId);

  const cleanedSession = clearRuntimeSessionRefs(session);
  persistSession(guildId, cleanedSession);
  return cleanedSession;
}