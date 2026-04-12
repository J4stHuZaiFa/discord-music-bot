import { PlaylistDisplay } from '../playlistDisplay.js';

export async function nowPlayingCommand(message, args, player) {
  if (!player.currentTrack) {
    return message.reply('❌ Nothing is playing!');
  }

  const embed = PlaylistDisplay.createNowPlayingEmbed(player.currentTrack);
  return message.reply({ embeds: [embed] });
}
