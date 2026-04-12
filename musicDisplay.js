import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class MusicDisplay {

  // Main "Now Playing" card — looks like LunaBot
  static nowPlayingEmbed(player) {
    const track = player.currentTrack;
    if (!track) return new EmbedBuilder().setColor('#2B2D31').setDescription('❌ Nothing is playing');

    const q = player.getQueue();
    const loopIcon = { none: '➡️', song: '🔂', queue: '🔁' }[q.loopMode];

    const embed = new EmbedBuilder()
      .setColor('#1DB954')
      .setAuthor({ name: '🎵 Now Playing' })
      .setTitle(track.originalTitle || track.title)
      .setURL(track.url || null)
      .addFields(
        { name: '👤 Requested by', value: track.requestedBy?.tag || track.requestedBy?.username || 'Unknown', inline: true },
        { name: '⏱️ Duration', value: `\`${track.duration || '0:00'}\``, inline: true },
        { name: '🔉 Volume', value: `\`${q.volume}%\``, inline: true },
        { name: `${loopIcon} Loop`, value: `\`${q.loopMode}\``, inline: true },
        { name: '📋 Queue', value: `\`${q.total} track${q.total !== 1 ? 's' : ''}\``, inline: true },
        { name: '🤖 Autoplay', value: q.autoplay ? '`on`' : '`off`', inline: true }
      )
      .setFooter({ text: player.isPaused ? '⏸️ Paused' : '▶️ Playing' });

    if (track.spotifyThumbnail || track.thumbnail) {
      embed.setThumbnail(track.spotifyThumbnail || track.thumbnail);
    }

    return embed;
  }

  // Queue embed
  static queueEmbed(player, page = 0) {
    const q = player.getQueue();
    const itemsPerPage = 10;
    const totalPages = Math.max(1, Math.ceil((q.total - 1) / itemsPerPage));
    const currentPage = Math.min(page, totalPages - 1);

    const embed = new EmbedBuilder()
      .setColor('#1DB954')
      .setTitle(`📋 Queue — ${q.total} track${q.total !== 1 ? 's' : ''}`)
      .setFooter({ text: `Page ${currentPage + 1}/${totalPages} • Vol: ${q.volume}% • Loop: ${q.loopMode}` });

    if (q.current) {
      embed.addFields({
        name: player.isPaused ? '⏸️ Now Paused' : '▶️ Now Playing',
        value: `**[${q.current.originalTitle || q.current.title}](${q.current.url})** \`${q.current.duration}\`\nRequested by ${q.current.requestedBy?.tag || 'Unknown'}`,
        inline: false
      });
    }

    const startIdx = currentPage * itemsPerPage + 1;
    const endIdx = Math.min(startIdx + itemsPerPage - 1, q.total - 1);
    const upcoming = q.upcoming.slice(startIdx, endIdx + 1);

    if (upcoming.length > 0) {
      const list = upcoming.map((t, i) => {
        const n = startIdx + i;
        return `\`${n}.\` **${t.originalTitle || t.title}** \`${t.duration}\` — ${t.requestedBy?.tag || 'Unknown'}`;
      }).join('\n');
      embed.addFields({ name: '⏭️ Up Next', value: list, inline: false });
    }

    return embed;
  }

  // Control buttons — 3 rows like LunaBot
  static controlButtons(player) {
    const q = player.getQueue();
    const itemsPerPage = 10;
    const totalPages = Math.max(1, Math.ceil((q.total - 1) / itemsPerPage));

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_play_pause').setEmoji(player.isPaused ? '▶️' : '⏸️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_prev').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('btn_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(!player.currentTrack),
      new ButtonBuilder().setCustomId('btn_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('btn_loop').setEmoji('🔁').setStyle(player.loopMode !== 'none' ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_vol_down').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_autoplay').setEmoji('🤖').setStyle(player.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_vol_up').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_queue').setEmoji('📋').setStyle(ButtonStyle.Primary)
    );

    return [row1, row2];
  }

  // Queue page buttons
  static queueButtons(player, page = 0) {
    const q = player.getQueue();
    const itemsPerPage = 10;
    const totalPages = Math.max(1, Math.ceil((q.total - 1) / itemsPerPage));
    const currentPage = Math.min(page, totalPages - 1);

    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_prev_page').setLabel('◀ Prev').setStyle(ButtonStyle.Primary).setDisabled(currentPage === 0),
      new ButtonBuilder().setCustomId('btn_np').setLabel('Now Playing').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('btn_next_page').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(currentPage >= totalPages - 1)
    );
  }

  static loadingEmbed(query) {
    return new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('⏳ Loading...')
      .setDescription(`Searching for **${query.length > 50 ? query.slice(0, 50) + '...' : query}**`);
  }

  static successEmbed(name, count, failed = 0) {
    return new EmbedBuilder()
      .setColor('#1DB954')
      .setTitle('✅ Added to Queue')
      .addFields({
        name: '📊 Info',
        value: `**${name}**\nLoaded: **${count}** track${count !== 1 ? 's' : ''}${failed > 0 ? `\nFailed: **${failed}**` : ''}`
      });
  }
}
