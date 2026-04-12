import { PlaylistDisplay } from '../playlistDisplay.js';

export async function queueCommand(message, args, player) {
  const queueInfo = player.getQueue();

  if (!queueInfo.current && queueInfo.total === 0) {
    return message.reply('❌ Queue is empty!');
  }

  const page = parseInt(args[0]) || 0;

  const playlistEmbed = PlaylistDisplay.createPlaylistEmbed(player, page);
  const buttons = PlaylistDisplay.createPlaylistButtons(player, page);

  return message.reply({
    embeds: [playlistEmbed],
    components: [buttons]
  });
}
