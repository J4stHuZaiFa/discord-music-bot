import { PlaylistDisplay } from '../playlistDisplay.js';

export async function playCommand(message, args, player) {
  if (args.length === 0) {
    return message.reply('❌ Please provide a Spotify playlist link!');
  }

  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    return message.reply('❌ You need to be in a voice channel!');
  }

  const query = args.join(' ');
  let statusMsg;

  try {
    const isSpotifyUrl = query.includes('spotify.com/playlist/');
    const playlistName = isSpotifyUrl ? query.split('/').pop() : 'Playlist';

    statusMsg = await message.reply({
      embeds: [PlaylistDisplay.createLoadingEmbed(playlistName)]
    });

    const tracks = await player.addToQueue(query, message.author);

    if (tracks.length === 0) {
      return statusMsg.edit({
        content: '❌ Could not find any tracks in this playlist.',
        embeds: []
      });
    }

    await player.connect(voiceChannel);

    const failedCount = player.failedTracks.length;
    const successEmbed = PlaylistDisplay.createSuccessEmbed(
      player.playlistInfo?.name || playlistName,
      tracks.length,
      failedCount
    );

    await statusMsg.edit({
      embeds: [successEmbed],
      components: []
    });

    if (!player.isPlaying) {
      player.playNext();

      const playlistEmbed = PlaylistDisplay.createPlaylistEmbed(player, 0);
      const buttons = PlaylistDisplay.createPlaylistButtons(player, 0);

      await message.channel.send({
        embeds: [playlistEmbed],
        components: [buttons]
      });
    }
  } catch (error) {
    console.error('Play command error:', error);
    return statusMsg ? statusMsg.edit({
      content: `❌ Error: ${error.message}`,
      embeds: []
    }) : message.reply(`❌ Error: ${error.message}`);
  }
}
