export async function pauseCommand(message, args, player) {
  if (!player.isPlaying) {
    return message.reply('❌ Nothing is playing!');
  }

  if (player.pause()) {
    return message.reply('⏸️ Paused');
  } else {
    return message.reply('❌ Already paused!');
  }
}
