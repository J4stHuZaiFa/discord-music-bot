export async function resumeCommand(message, args, player) {
  if (!player.isPaused) {
    return message.reply('❌ Not paused!');
  }

  if (player.resume()) {
    return message.reply('▶️ Resumed');
  } else {
    return message.reply('❌ Failed to resume!');
  }
}
