import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class PlaylistDisplay {
  static createPlaylistEmbed(player, page = 0) {
    const queueInfo = player.getQueue();
    const itemsPerPage = 10;
    const totalPages = Math.ceil((queueInfo.total - 1) / itemsPerPage) || 1;
    const currentPage = Math.min(page, totalPages - 1);

    const embed = new EmbedBuilder()
      .setColor('#1DB954')
      .setTitle(player.playlistInfo?.name || 'Now Playing');

    if (player.playlistInfo?.image) {
      embed.setThumbnail(player.playlistInfo.image);
    }

    if (queueInfo.current) {
      embed.addFields({
        name: '▶️ Now Playing',
        value: `**${queueInfo.current.originalTitle || queueInfo.current.title}**\n${queueInfo.current.artist || ''}\n⏱️ ${queueInfo.current.duration}`,
        inline: false
      });
    }

    const startIdx = currentPage * itemsPerPage + 1;
    const endIdx = Math.min(startIdx + itemsPerPage - 1, queueInfo.total - 1);

    if (queueInfo.total > 1) {
      const upcomingTracks = queueInfo.upcoming.slice(startIdx, endIdx + 1);
      let upcomingText = '';

      upcomingTracks.forEach((track, idx) => {
        const trackNum = startIdx + idx;
        const displayTitle = track.originalTitle || track.title;
        const displayArtist = track.artist || '';
        upcomingText += `\`${trackNum}.\` **${displayTitle}** ${displayArtist}\n`;
      });

      if (upcomingText) {
        embed.addFields({
          name: `📋 Up Next (${queueInfo.total - 1} songs)`,
          value: upcomingText,
          inline: false
        });
      }
    }

    const footer = `Page ${currentPage + 1}/${totalPages} • Total: ${queueInfo.total} tracks`;
    embed.setFooter({ text: footer });

    if (player.isPaused) {
      embed.setColor('#808080');
      embed.setTitle('⏸️ ' + embed.data.title);
    }

    return embed;
  }

  static createPlaylistButtons(player, page = 0) {
    const queueInfo = player.getQueue();
    const itemsPerPage = 10;
    const totalPages = Math.ceil((queueInfo.total - 1) / itemsPerPage) || 1;
    const currentPage = Math.min(page, totalPages - 1);

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('prev_page')
          .setLabel('⬅️ Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId('pause_resume')
          .setLabel(player.isPaused ? '▶️ Resume' : '⏸️ Pause')
          .setStyle(player.isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('skip_track')
          .setLabel('⏭️ Skip')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!player.currentTrack),
        new ButtonBuilder()
          .setCustomId('next_page')
          .setLabel('Next ➡️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage >= totalPages - 1),
        new ButtonBuilder()
          .setCustomId('stop_player')
          .setLabel('🛑 Stop')
          .setStyle(ButtonStyle.Danger)
      );

    return row;
  }

  static createNowPlayingEmbed(track) {
    const embed = new EmbedBuilder()
      .setColor('#1DB954')
      .setTitle('Now Playing')
      .setDescription(`**${track.originalTitle || track.title}**`)
      .addFields({
        name: 'Artist',
        value: track.artist || 'Unknown',
        inline: true
      }, {
        name: 'Duration',
        value: track.duration || '0:00',
        inline: true
      });

    if (track.spotifyThumbnail || track.thumbnail) {
      embed.setThumbnail(track.spotifyThumbnail || track.thumbnail);
    }

    return embed;
  }

  static createLoadingEmbed(playlistName) {
    return new EmbedBuilder()
      .setColor('#1DB954')
      .setTitle('🎵 Loading Playlist')
      .setDescription(`**${playlistName}**\n\n🔄 Preparing tracks...`)
      .setFooter({ text: 'This may take a moment...' });
  }

  static createSuccessEmbed(playlistName, trackCount, failedCount) {
    const embed = new EmbedBuilder()
      .setColor('#1DB954')
      .setTitle('✅ Playlist Loaded Successfully')
      .setDescription(`**${playlistName}**`)
      .addFields({
        name: '📊 Statistics',
        value: `Total Tracks: **${trackCount}**\n${failedCount > 0 ? `Failed to Find: **${failedCount}**\n` : ''}Success Rate: **${Math.round((trackCount / (trackCount + failedCount)) * 100)}%**`,
        inline: false
      });

    return embed;
  }
}
