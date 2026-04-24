import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const C = {
  purple: 0x9B59B6,
  blue:   0x5865F2,
  green:  0x2ECC71,
  red:    0xFF4757,
  gold:   0xFFD700,
  teal:   0x1ABC9C,
  dark:   0x2B2D31,
};

const LOOP_ICON = { none: '🔁', song: '🔂', queue: '🔁' };
const LOOP_TEXT = { none: 'Off', song: 'Song', queue: 'Queue' };
const VOL_EMOJI = (v) => v === 0 ? '🔇' : v < 40 ? '🔈' : v < 80 ? '🔉' : '🔊';

function volBar(v) {
  const filled = Math.round((Math.min(v, 200) / 200) * 10);
  return '▰'.repeat(Math.max(0, filled)) + '▱'.repeat(Math.max(0, 10 - filled));
}

export function nowPlayingEmbed(player) {
  const t = player.currentTrack;
  if (!t) return errorEmbed('Nothing is currently playing.');
  const q = player.getQueue();
  const title = t.originalTitle || t.title || 'Unknown';
  const status = player.isPaused ? '⏸️ Paused' : '▶️ Now Playing';

  const desc = [
    t.artist ? `> 🎤  **${t.artist}**` : null,
    ``,
    `${VOL_EMOJI(q.volume)}  \`${volBar(q.volume)}\`  **${q.volume}%**`,
    ``,
    `> ⏱️ **${t.duration || '0:00'}**　📋 **${q.total} tracks**　${LOOP_ICON[q.loopMode]} **${LOOP_TEXT[q.loopMode]}**`,
  ].filter(Boolean).join('\n');

  return new EmbedBuilder()
    .setColor(player.isPaused ? 0x4A4A6A : C.purple)
    .setAuthor({ name: `${status}  ✦  Music Bot PRO` })
    .setTitle(title.length > 60 ? title.slice(0, 60) + '...' : title)
    .setURL(t.url || null)
    .setDescription(desc)
    .setThumbnail(t.spotifyThumbnail || t.thumbnail || null)
    .addFields(
      { name: '👤 Requested by', value: `${t.requestedBy?.toString() || 'Unknown'}`, inline: true },
      { name: '🤖 Autoplay', value: q.autoplay ? '`On`' : '`Off`', inline: true },
      { name: '🕐 24/7', value: q.is247 ? '`On`' : '`Off`', inline: true },
    )
    .setFooter({ text: '✦ Music Bot PRO  •  /help for all commands' })
    .setTimestamp();
}

export function controlButtons(player) {
  const q = player?.getQueue();
  const loopActive = q?.loopMode !== 'none';
  const paused = player?.isPaused;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_prev').setLabel('⏮').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_pause').setLabel(paused ? '▶️ Resume' : '⏸ Pause').setStyle(paused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭ Skip').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹ Stop').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_loop').setLabel(loopActive ? (q?.loopMode === 'song' ? '🔂 Song' : '🔁 Queue') : '🔁 Loop').setStyle(loopActive ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_voldown').setLabel('🔉 Vol -').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_volup').setLabel('🔊 Vol +').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_shuffle').setLabel('🔀 Shuffle').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_autoplay').setLabel('🤖 Autoplay').setStyle(q?.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_queue').setLabel('📋 Queue').setStyle(ButtonStyle.Primary),
  );

  return [row1, row2];
}

export function queueEmbed(player, page = 0) {
  const q = player.getQueue();
  const perPage = 8;
  const songs = q.upcoming.slice(1);
  const totalPages = Math.max(1, Math.ceil(songs.length / perPage));
  page = Math.min(page, totalPages - 1);
  const slice = songs.slice(page * perPage, page * perPage + perPage);

  const currentSection = q.current
    ? `**▶️  Now Playing**\n> [${q.current.originalTitle || q.current.title}](${q.current.url || 'https://discord.com'})  \`${q.current.duration}\``
    : '*Nothing playing*';

  const upNext = slice.length
    ? slice.map((t, i) => `\`${page * perPage + i + 1}.\` **${t.originalTitle || t.title}** \`${t.duration}\` • ${t.requestedBy?.toString() || 'Unknown'}`).join('\n')
    : '*Queue is empty*';

  return new EmbedBuilder()
    .setColor(C.blue)
    .setAuthor({ name: '📋  Music Queue  ✦  Music Bot PRO' })
    .setDescription(currentSection)
    .addFields({ name: '⏭️  Up Next', value: upNext })
    .addFields(
      { name: `${VOL_EMOJI(q.volume)} Volume`, value: `\`${q.volume}%\``, inline: true },
      { name: `${LOOP_ICON[q.loopMode]} Loop`, value: `\`${LOOP_TEXT[q.loopMode]}\``, inline: true },
      { name: '🎵 Total', value: `\`${q.total} tracks\``, inline: true },
    )
    .setFooter({ text: `Page ${page + 1} / ${totalPages}  •  Music Bot PRO` })
    .setTimestamp();
}

export function queueButtons(player, page = 0) {
  const q = player.getQueue();
  const perPage = 8;
  const totalPages = Math.max(1, Math.ceil((q.total - 1) / perPage));
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_qprev').setLabel('◀ Prev').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('btn_qnext').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1),
    new ButtonBuilder().setCustomId('btn_pause').setLabel(player.isPaused ? '▶ Resume' : '⏸ Pause').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭ Skip').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹ Stop').setStyle(ButtonStyle.Danger),
  );
}

export function helpEmbed() {
  return new EmbedBuilder()
    .setColor(C.purple)
    .setAuthor({ name: '✦  Music Bot PRO  —  Command Guide' })
    .setDescription('> All commands work as `/slash` and `!prefix`\n> Use the **player buttons** for quick controls!')
    .addFields(
      { name: '▶️  Playback', value: '`/play` `/pause` `/resume` `/skip` `/stop`' },
      { name: '📋  Queue', value: '`/queue` `/nowplaying` `/remove` `/shuffle` `/clear`' },
      { name: '🎛️  Controls', value: '`/volume` `/loop` `/seek`' },
      { name: '🎚️  Effects', value: '`/bassboost` `/filter` — nightcore, vaporwave, 8d, echo' },
      { name: '⭐  PRO', value: '`/autoplay` `/lyrics` `/247` `/dj`' },
      { name: '⚡  Shortcuts', value: '`!p` play  •  `!s` skip  •  `!q` queue  •  `!np` nowplaying\n`!vol` volume  •  `!bb` bassboost  •  `!ly` lyrics  •  `!ap` autoplay' },
    )
    .setFooter({ text: '✦ Music Bot PRO  •  Running 24/7' })
    .setTimestamp();
}

export function addedEmbed(track, position) {
  return new EmbedBuilder()
    .setColor(C.teal)
    .setAuthor({ name: '✅  Added to Queue' })
    .setTitle(track.originalTitle || track.title)
    .setURL(track.url || null)
    .setThumbnail(track.spotifyThumbnail || track.thumbnail || null)
    .addFields(
      { name: '⏱️ Duration', value: `\`${track.duration || '0:00'}\``, inline: true },
      { name: '📋 Position', value: `\`#${position}\``, inline: true },
      { name: '👤 Requested by', value: track.requestedBy?.toString() || 'Unknown', inline: true },
    )
    .setTimestamp();
}

export function playlistLoadedEmbed(name, count, failed) {
  return new EmbedBuilder()
    .setColor(C.teal)
    .setAuthor({ name: '✅  Playlist Loaded' })
    .setTitle(name)
    .addFields(
      { name: '🎵 Loaded', value: `\`${count}\``, inline: true },
      { name: '❌ Failed', value: `\`${failed}\``, inline: true },
      { name: '📊 Success', value: `\`${Math.round((count / Math.max(count + failed, 1)) * 100)}%\``, inline: true },
    )
    .setTimestamp();
}

export function loadingEmbed(text) {
  return new EmbedBuilder()
    .setColor(C.gold)
    .setDescription(`⏳  **Searching...**\n> ${text.slice(0, 80)}\n> Please wait...`);
}

export function successEmbed(title, desc) {
  return new EmbedBuilder().setColor(C.green).setDescription(`**✅  ${title}**\n${desc}`).setTimestamp();
}

export function errorEmbed(desc) {
  return new EmbedBuilder().setColor(C.red).setDescription(`**❌  ${desc}**`);
}

export function infoEmbed(title, desc) {
  return new EmbedBuilder().setColor(C.blue).setDescription(`**ℹ️  ${title}**\n${desc}`).setTimestamp();
}
