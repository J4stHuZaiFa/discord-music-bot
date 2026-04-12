export async function skipCommand(message, args, player) {
  if (!player.currentTrack) {
    return message.reply('❌ Nothing is playing!');
  }

  const skippedTrack = player.currentTrack.title;

  if (player.skip()) {
    return message.reply(`⏭️ Skipped: **${skippedTrack}**`);
  } else {
    return message.reply('❌ Failed to skip!');
  }
}
