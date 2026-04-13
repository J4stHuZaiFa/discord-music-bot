import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// ── Premium Color Palette ─────────────────────────────────────────────────────
export const C = {
  purple:  0x9B59B6,
  blue:    0x5865F2,
  green:   0x2ECC71,
  red:     0xE74C3C,
  orange:  0xE67E22,
  gold:    0xF1C40F,
  dark:    0x2B2D31,
  teal:    0x1ABC9C,
  pink:    0xE91E8C,
};

const LOOP_TEXT = { 0: '`Off`', 1: '`🔂 Song`', 2: '`🔁 Queue`' };
const VOL_BAR = (v) => {
  const filled = Math.round(v / 20);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` **${v}%**`;
};
const PROGRESS = (pos, dur) => {
  if (!dur) return '`──────────────────` `0:00 / 0:00`';
  const p = Math.min(20, Math.round((pos / dur) * 20));
  const bar = '─'.repeat(p) + '⬤' + '─'.repeat(20 - p);
  return `\`${bar}\` \`${fmt(pos)} / ${fmt(dur)}\``;
};
const fmt = (s) => {
  if (!s) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

// ── NOW PLAYING (Premium) ─────────────────────────────────────────────────────
export function nowPlayingEmbed(player) {
  const t = player.currentTrack;
  if (!t) return errorEmbed('Nothing is currently playing.');

  const q = player.getQueue();
  const status = player.isPaused ? '⏸️' : '🎵';

  return new EmbedBuilder()
    .setColor(player.isPaused ? C.dark : C.purple)
    .setAuthor({
      name: `${status}  ${player.isPaused ? 'Paused' : 'Now Playing'}  •  Music Bot PRO`,
      iconURL: 'https://i.imgur.com/LwgqhgR.png'
    })
    .setTitle(t.originalTitle || t.title)
    .setURL(t.url || null)
    .setDescription([
      t.artist ? `👤  **${t.artist}**` : '',
      ``,
      PROGRESS(0, 0),
      ``,
      `> 🔉  ${VOL_BAR(q.volume)}`,
    ].filter(v => v !== undefined).join('\n'))
    .setThumbnail(t.spotifyThumbnail || t.thumbnail || null)
    .addFields(
      { name: '⏱️ Duration', value: `\`${t.duration || '0:00'}\``, inline: true },
      { name: '🔁 Loop',     value: LOOP_TEXT[q.loopMode === 'none' ? 0 : q.loopMode === 'song' ? 1 : 2], inline: true },
      { name: '📋 In Queue', value: `\`${q.total} tracks\``, inline: true },
      { name: '👤 Requested by', value: `${t.requestedBy?.toString() || 'Unknown'}`, inline: true },
      { name: '🤖 Autoplay',    value: q.autoplay ? '`On`' : '`Off`', inline: true },
      { name: '🕐 24/7 Mode',   value: q.is247 ? '`On`' : '`Off`', inline: true },
    )
    .setFooter({ text: `🎵 Music Bot PRO  •  Use /help to see all commands`, iconURL: 'https://i.imgur.com/LwgqhgR.png' })
    .setTimestamp();
}

// ── CONTROL BUTTONS (Premium 2-row layout) ────────────────────────────────────
export function controlButtons(player) {
  const q = player?.getQueue();
  const loopActive = q?.loopMode !== 'none';

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_prev')
      .setLabel('⏮')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_pause')
      .setLabel(player?.isPaused ? '▶️ Resume' : '⏸ Pause')
      .setStyle(player?.isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_skip')
      .setLabel('⏭ Skip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_stop')
      .setLabel('⏹ Stop')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('btn_loop')
      .setLabel(loopActive ? (q?.loopMode === 'song' ? '🔂 Song' : '🔁 Queue') : '🔁 Loop')
      .setStyle(loopActive ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_voldown')
      .setLabel('🔉 Vol -')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_volup')
      .setLabel('🔊 Vol +')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_shuffle')
      .setLabel('🔀 Shuffle')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_autoplay')
      .setLabel('🤖 Autoplay')
      .setStyle(q?.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_queue')
      .setLabel('📋 Queue')
      .setStyle(ButtonStyle.Primary),
  );

  return [row1, row2];
}

// ── QUEUE EMBED ───────────────────────────────────────────────────────────────
export function queueEmbed(player, page = 0) {
  const q = player.getQueue();
  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil((q.total - 1) / perPage));
  page = Math.min(page, totalPages - 1);

  const current = q.current;
  const songs = q.upcoming.slice(1); // skip current
  const slice = songs.slice(page * perPage, page * perPage + perPage);

  const loopMode = q.loopMode === 'none' ? 'Off' : q.loopMode === 'song' ? '🔂 Song' : '🔁 Queue';

  return new EmbedBuilder()
    .setColor(C.blue)
    .setAuthor({ name: '📋  Music Queue  •  Music Bot PRO', iconURL: 'https://i.imgur.com/LwgqhgR.png' })
    .setDescription(current
      ? `**▶️  Now Playing**\n> [${current.originalTitle || current.title}](${current.url || 'https://discord.com'}) \`${current.duration}\``
      : '*Nothing playing*'
    )
    .addFields(
      slice.length ? {
        name: `⏭️  Up Next`,
        value: slice.map((t, i) =>
          `\`${page * perPage + i + 1}.\` [${t.originalTitle || t.title}](${t.url || 'https://discord.com'}) — \`${t.duration}\` • ${t.requestedBy?.toString() || 'Unknown'}`
        ).join('\n')
      } : { name: '⏭️ Up Next', value: '*Queue is empty*' }
    )
    .addFields(
      { name: '🔉 Volume', value: `\`${q.volume}%\``, inline: true },
      { name: '🔁 Loop',   value: `\`${loopMode}\``, inline: true },
      { name: '📊 Total',  value: `\`${q.total} tracks\``, inline: true },
    )
    .setFooter({ text: `Page ${page + 1} of ${totalPages}  •  Music Bot PRO` })
    .setTimestamp();
}

export function queueButtons(player, page = 0) {
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

// ── HELP EMBED ────────────────────────────────────────────────────────────────
export function helpEmbed() {
  return new EmbedBuilder()
    .setColor(C.purple)
    .setAuthor({ name: '🎵  Music Bot PRO — Help', iconURL: 'https://i.imgur.com/LwgqhgR.png' })
    .setDescription('> All commands work as `/slash` and `!prefix` commands.\n> Use the **buttons** on the player for quick controls!')
    .addFields(
      { name: '▶️  Playback',   value: '`/play` `/pause` `/resume` `/skip` `/stop`', inline: false },
      { name: '📋  Queue',      value: '`/queue` `/nowplaying` `/remove` `/shuffle` `/clear`', inline: false },
      { name: '🎛️  Controls',  value: '`/volume` `/loop` `/seek`', inline: false },
      { name: '🎚️  Effects',   value: '`/bassboost` `/filter` — nightcore, vaporwave, 8d, echo', inline: false },
      { name: '⭐  PRO',        value: '`/autoplay` `/lyrics` `/247` `/dj`', inline: false },
      { name: '💡  Shortcuts',  value: '`!p` play • `!s` skip • `!q` queue • `!np` now playing\n`!vol` volume • `!bb` bassboost • `!ly` lyrics • `!ap` autoplay', inline: false },
    )
    .setFooter({ text: 'Music Bot PRO  •  Running 24/7' })
    .setTimestamp();
}

// ── UTILITY EMBEDS ────────────────────────────────────────────────────────────
export function loadingEmbed(text) {
  return new EmbedBuilder()
    .setColor(C.orange)
    .setDescription(`<a:loading:1234> **Searching for:** ${text}\n> Please wait...`);
}

export function successEmbed(title, desc) {
  return new EmbedBuilder()
    .setColor(C.green)
    .setTitle(`✅  ${title}`)
    .setDescription(desc)
    .setTimestamp();
}

export function errorEmbed(desc) {
  return new EmbedBuilder()
    .setColor(C.red)
    .setDescription(`❌  ${desc}`);
}

export function infoEmbed(title, desc) {
  return new EmbedBuilder()
    .setColor(C.blue)
    .setTitle(title)
    .setDescription(desc)
    .setTimestamp();
}

export function addedEmbed(track, position) {
  return new EmbedBuilder()
    .setColor(C.teal)
    .setAuthor({ name: '✅  Added to Queue' })
    .setTitle(track.originalTitle || track.title)
    .setThumbnail(track.spotifyThumbnail || track.thumbnail || null)
    .addFields(
      { name: '⏱️ Duration',  value: `\`${track.duration || '0:00'}\``, inline: true },
      { name: '📋 Position',  value: `\`#${position}\``, inline: true },
      { name: '👤 Requested', value: track.requestedBy?.toString() || 'Unknown', inline: true },
    )
    .setTimestamp();
}

export function playlistLoadedEmbed(name, count, failed) {
  return new EmbedBuilder()
    .setColor(C.teal)
    .setAuthor({ name: '✅  Playlist Loaded' })
    .setTitle(name)
    .addFields(
      { name: '🎵 Loaded',  value: `\`${count} tracks\``, inline: true },
      { name: '❌ Failed',  value: `\`${failed} tracks\``, inline: true },
      { name: '📊 Success', value: `\`${Math.round((count / (count + failed || 1)) * 100)}%\``, inline: true },
    )
    .setTimestamp();
}
