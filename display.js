import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Unique color palette — dark purple/blue theme
const COLORS = {
  playing: 0x7B2FBE,   // purple
  paused:  0x4A4A6A,   // muted purple-grey
  success: 0x00D4AA,   // teal
  error:   0xFF4757,   // red
  info:    0x5865F2,   // blurple
  loading: 0xFFA502    // orange
};

const LOOP_LABEL = { none: '🔁 Off', song: '🔂 Song', queue: '🔁 Queue' };
const VOL_ICON = (v) => v === 0 ? '🔇' : v < 50 ? '🔈' : v < 120 ? '🔉' : '🔊';

export class Display {

  // ── NOW PLAYING card (main player UI) ────────────────────────────────────
  static nowPlayingEmbed(player) {
    const t = player.currentTrack;
    const q = player.getQueue();
    if (!t) return new EmbedBuilder().setColor(COLORS.error).setDescription('❌ Nothing playing');

    const bar = Display._progressBar(player);
    const statusIcon = player.isPaused ? '⏸' : '▶️';

    return new EmbedBuilder()
      .setColor(player.isPaused ? COLORS.paused : COLORS.playing)
      .setAuthor({ name: `${statusIcon}  Now Playing`, iconURL: 'https://cdn.discordapp.com/emojis/1234567890.png' })
      .setTitle(t.originalTitle || t.title)
      .setDescription([
        t.artist ? `**Artist:** ${t.artist}` : '',
        `${bar}`,
        `\`${t.duration}\``,
      ].filter(Boolean).join('\n'))
      .setThumbnail(t.spotifyThumbnail || t.thumbnail || null)
      .addFields(
        { name: `${VOL_ICON(q.volume)} Volume`, value: `**${q.volume}%**`, inline: true },
        { name: '🔁 Loop', value: `**${LOOP_LABEL[q.loopMode]}**`, inline: true },
        { name: '📋 Queue', value: `**${q.total}** tracks`, inline: true },
        { name: '👤 Requested by', value: `${t.requestedBy?.tag || 'Unknown'}`, inline: true },
        { name: '🤖 Autoplay', value: q.autoplay ? '**On**' : '**Off**', inline: true },
        { name: '🕐 24/7', value: q.is247 ? '**On**' : '**Off**', inline: true },
      )
      .setFooter({ text: '🎵 Music Bot PRO  •  Use /help to see all commands' });
  }

  // ── CONTROL BUTTONS (2 rows, unique layout) ───────────────────────────────
  static controlButtons(player) {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_prev').setEmoji('⏮').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_pause').setEmoji(player.isPaused ? '▶️' : '⏸').setStyle(player.isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_skip').setEmoji('⏭').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_stop').setEmoji('⏹').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('btn_loop').setEmoji('🔁').setStyle(player.loopMode !== 'none' ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_voldown').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_volup').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_autoplay').setEmoji('🤖').setStyle(player.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_queue').setEmoji('📋').setStyle(ButtonStyle.Primary),
    );
    return [row1, row2];
  }

  // ── QUEUE embed ───────────────────────────────────────────────────────────
  static queueEmbed(player, page = 0) {
    const q = player.getQueue();
    const perPage = 10;
    const totalPages = Math.max(1, Math.ceil((q.total - 1) / perPage));
    page = Math.min(page, totalPages - 1);

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`📋  Queue  —  ${q.total} tracks`)
      .setFooter({ text: `Page ${page + 1}/${totalPages}  •  ${LOOP_LABEL[q.loopMode]}  •  Vol ${q.volume}%` });

    if (q.current) {
      embed.setDescription(`**▶️ Now Playing**\n> **${q.current.originalTitle || q.current.title}** \`${q.current.duration}\``);
    }

    const start = page * perPage + 1;
    const slice = q.upcoming.slice(start, start + perPage);
    if (slice.length) {
      embed.addFields({
        name: '⏭️ Up Next',
        value: slice.map((t, i) =>
          `\`${start + i}.\` **${t.originalTitle || t.title}** — \`${t.duration}\``
        ).join('\n')
      });
    }
    return embed;
  }

  static queueButtons(player, page = 0) {
    const q = player.getQueue();
    const perPage = 10;
    const totalPages = Math.max(1, Math.ceil((q.total - 1) / perPage));
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_qprev').setLabel('◀ Prev').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('btn_qnext').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1),
      new ButtonBuilder().setCustomId('btn_pause').setLabel(player.isPaused ? '▶ Resume' : '⏸ Pause').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭ Skip').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹ Stop').setStyle(ButtonStyle.Danger),
    );
  }

  // ── Utility embeds ────────────────────────────────────────────────────────
  static loadingEmbed(text) {
    return new EmbedBuilder().setColor(COLORS.loading).setDescription(`⏳  **${text}**\n> Searching and loading tracks...`);
  }

  static successEmbed(title, desc) {
    return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅  ${title}`).setDescription(desc);
  }

  static errorEmbed(desc) {
    return new EmbedBuilder().setColor(COLORS.error).setDescription(`❌  ${desc}`);
  }

  static infoEmbed(title, desc) {
    return new EmbedBuilder().setColor(COLORS.info).setTitle(title).setDescription(desc);
  }

  static helpEmbed() {
    return new EmbedBuilder()
      .setColor(COLORS.playing)
      .setTitle('🎵  Music Bot PRO  —  Commands')
      .setDescription('All commands work as `/slash` commands and `!prefix` commands.')
      .addFields(
        { name: '▶️  Playback', value: '`/play` `/pause` `/resume` `/skip` `/stop`', inline: false },
        { name: '📋  Queue', value: '`/queue` `/nowplaying` `/remove` `/shuffle` `/clear`', inline: false },
        { name: '🎛️  Controls', value: '`/volume` `/loop` `/seek`', inline: false },
        { name: '🎚️  Effects', value: '`/bassboost` `/filter` — nightcore, vaporwave, 8d, echo, karaoke', inline: false },
        { name: '⭐  PRO', value: '`/autoplay` `/lyrics` `/247` `/dj`', inline: false },
        { name: '💡  Tips', value: 'Use the **buttons** on the player for quick controls!\nVolume buttons change by **10%** each click.', inline: false },
      )
      .setFooter({ text: 'Music Bot PRO  •  Running 24/7' });
  }

  // ── Progress bar ──────────────────────────────────────────────────────────
  static _progressBar(player) {
    const filled = '▰';
    const empty = '▱';
    const total = 12;
    // We don't track position in play-dl easily, so show a static bar
    const blocks = player.isPaused ? 4 : 6;
    return filled.repeat(blocks) + empty.repeat(total - blocks);
  }
}
