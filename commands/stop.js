export async function stopCommand(message, args, player) {
  if (!player.isPlaying && !player.isPaused) {
    return message.reply('❌ Nothing is playing!');
  }

  player.stop();
  return message.reply('⏹️ Stopped playback and cleared queue');
}
