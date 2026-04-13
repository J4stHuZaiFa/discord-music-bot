import { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DisTube } from 'distube';
import { YtDlpPlugin } from '@distube/yt-dlp';
import { config, validateConfig } from './config.js';
import { slashCommands } from './slashCommands.js';

if (!validateConfig()) process.exit(1);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

const distube = new DisTube(client, {
  plugins: [new YtDlpPlugin({ update: false })],
  emitNewSongOnly: true,
  joinNewVoiceChannel: true,
});

const COLOR = 0x7B2FBE;
const ERR   = 0xFF4757;
const OK    = 0x00D4AA;

function nowPlayingEmbed(queue) {
  const song = queue.songs[0];
  const loop = queue.repeatMode === 0 ? 'Off' : queue.repeatMode === 1 ? '🔂 Song' : '🔁 Queue';
  return new EmbedBuilder()
    .setColor(queue.paused ? 0x4A4A6A : COLOR)
    .setAuthor({ name: queue.paused ? '⏸  Paused' : '▶️  Now Playing' })
    .setTitle(song.name)
    .setURL(song.url)
    .setThumbnail(song.thumbnail)
    .setDescription([
      song.uploader?.name ? `**Artist:** ${song.uploader.name}` : '',
      `**Duration:** ${song.formattedDuration}`,
      `**Requested by:** ${song.user?.tag || 'Unknown'}`,
    ].filter(Boolean).join('\n'))
    .addFields(
      { name: '🔉 Volume', value: `**${queue.volume}%**`, inline: true },
      { name: '🔁 Loop', value: `**${loop}**`, inline: true },
      { name: '📋 Queue', value: `**${queue.songs.length}** tracks`, inline: true },
    )
    .setFooter({ text: '🎵 Music Bot PRO  •  /help for commands' });
}

function controlButtons(queue) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_prev').setEmoji('⏮').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_pause').setEmoji(queue?.paused ? '▶️' : '⏸').setStyle(queue?.paused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_skip').setEmoji('⏭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_stop').setEmoji('⏹').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_loop').setEmoji('🔁').setStyle(queue?.repeatMode > 0 ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_voldown').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_volup').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_autoplay').setEmoji('🤖').setStyle(queue?.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_queue').setEmoji('📋').setStyle(ButtonStyle.Primary),
  );
  return [row1, row2];
}

function queueEmbed(queue, page = 0) {
  const perPage = 10;
  const songs = queue.songs.slice(1);
  const totalPages = Math.max(1, Math.ceil(songs.length / perPage));
  page = Math.min(page, totalPages - 1);
  const slice = songs.slice(page * perPage, page * perPage + perPage);
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`📋  Queue — ${queue.songs.length} tracks`)
    .setDescription(`**▶️ Now Playing**\n> **${queue.songs[0].name}** \`${queue.songs[0].formattedDuration}\``)
    .addFields(slice.length ? [{ name: '⏭️ Up Next', value: slice.map((s, i) => `\`${page * perPage + i + 1}.\` **${s.name}** — \`${s.formattedDuration}\``).join('\n') }] : [])
    .setFooter({ text: `Page ${page + 1}/${totalPages} • Vol ${queue.volume}%` });
}

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎵  Music Bot PRO — Commands')
    .addFields(
      { name: '▶️ Playback', value: '`/play` `/pause` `/resume` `/skip` `/stop`' },
      { name: '📋 Queue', value: '`/queue` `/nowplaying` `/remove` `/shuffle` `/clear`' },
      { name: '🎛️ Controls', value: '`/volume` `/loop` `/seek`' },
      { name: '🎚️ Effects', value: '`/bassboost` `/filter`' },
      { name: '⭐ PRO', value: '`/autoplay` `/lyrics` `/247` `/dj`' },
      { name: '💡 Tip', value: 'Use the **buttons** on the player for quick controls!' },
    )
    .setFooter({ text: 'Music Bot PRO • Running 24/7' });
}

distube.on('playSong', (queue, song) => {
  queue.textChannel?.send({ embeds: [nowPlayingEmbed(queue)], components: controlButtons(queue) }).catch(() => {});
});

distube.on('addSong', (queue, song) => {
  queue.textChannel?.send({ embeds: [new EmbedBuilder().setColor(OK).setDescription(`✅ Added **${song.name}** — position **#${queue.songs.length - 1}**`)] }).catch(() => {});
});

distube.on('addList', (queue, playlist) => {
  queue.textChannel?.send({ embeds: [new EmbedBuilder().setColor(OK).setDescription(`✅ Added playlist **${playlist.name}** — **${playlist.songs.length}** songs`)] }).catch(() => {});
});

distube.on('error', (channel, error) => {
  console.error('[DisTube Error]', error);
  channel?.send({ embeds: [new EmbedBuilder().setColor(ERR).setDescription(`❌ Error: ${error.message}`)] }).catch(() => {});
});

distube.on('finish', queue => {
  queue.textChannel?.send({ embeds: [new EmbedBuilder().setColor(COLOR).setDescription('✅ Queue finished!')] }).catch(() => {});
});

const djRoles = new Map();
function isDJ(member, guildId) {
  const roleId = djRoles.get(guildId);
  if (!roleId) return true;
  return member.roles.cache.has(roleId) || member.permissions.has('Administrator');
}

async function handleCommand(name, args, guild, member, channel, voiceChannel, reply, followUp) {
  const queue = distube.getQueue(guild.id);

  switch (name) {
    case 'play': case 'p': {
      const query = args.join(' ');
      if (!query) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Provide a song name or URL!')], flags: 64 });
      if (!voiceChannel) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Join a voice channel first!')], flags: 64 });
      await reply({ embeds: [new EmbedBuilder().setColor(0xFFA502).setDescription(`⏳ Searching: **${query}**...`)] });
      try { await distube.play(voiceChannel, query, { member, textChannel: channel }); }
      catch (err) { await followUp({ embeds: [new EmbedBuilder().setColor(ERR).setDescription(`❌ ${err.message}`)] }); }
      break;
    }
    case 'pause': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      queue.pause();
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription('⏸️ Paused!')] });
    }
    case 'resume': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      queue.resume();
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription('▶️ Resumed!')] });
    }
    case 'skip': case 's': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      const title = queue.songs[0]?.name;
      await queue.skip();
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription(`⏭️ Skipped **${title}**`)] });
    }
    case 'stop': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      distube.destroy(guild.id);
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription('⏹️ Stopped!')] });
    }
    case 'nowplaying': case 'np': {
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')] });
      return reply({ embeds: [nowPlayingEmbed(queue)], components: controlButtons(queue) });
    }
    case 'queue': case 'q': {
      if (!queue || !queue.songs.length) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Queue is empty!')] });
      const page = Math.max(0, (parseInt(args[0]) || 1) - 1);
      return reply({ embeds: [queueEmbed(queue, page)] });
    }
    case 'shuffle': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      queue.shuffle();
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription('🔀 Queue shuffled!')] });
    }
    case 'clear': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      queue.songs.splice(1);
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription('🗑️ Queue cleared!')] });
    }
    case 'volume': case 'vol': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      const vol = parseInt(args[0]);
      if (isNaN(vol)) return reply({ embeds: [new EmbedBuilder().setColor(COLOR).setDescription(`🔉 Current volume: **${queue.volume}%**`)] });
      queue.setVolume(Math.max(0, Math.min(200, vol)));
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription(`🔊 Volume: **${queue.volume}%**`)] });
    }
    case 'loop': case 'repeat': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      const modeMap = { none: 0, off: 0, song: 1, track: 1, queue: 2, all: 2 };
      const input = args[0]?.toLowerCase();
      const newMode = input && modeMap[input] !== undefined ? modeMap[input] : (queue.repeatMode + 1) % 3;
      queue.setRepeatMode(newMode);
      const labels = ['➡️ Loop **off**', '🔂 Looping **current song**', '🔁 Looping **entire queue**'];
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription(labels[newMode])] });
    }
    case 'seek': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      const input = args[0];
      let seconds;
      if (input?.includes(':')) { const p = input.split(':').map(Number); seconds = p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1]; }
      else seconds = parseInt(input);
      if (isNaN(seconds)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Use `1:30` or `90`')] });
      await queue.seek(seconds);
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription(`⏩ Seeked to **${Math.floor(seconds/60)}:${(seconds%60).toString().padStart(2,'0')}**`)] });
    }
    case 'remove': case 'rm': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      const idx = parseInt(args[0]);
      if (isNaN(idx) || idx < 1 || idx >= queue.songs.length) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Invalid number!')] });
      const removed = queue.songs.splice(idx, 1)[0];
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription(`🗑️ Removed **${removed.name}**`)] });
    }
    case 'autoplay': case 'ap': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      const ap = queue.toggleAutoplay();
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription(ap ? '🤖 Autoplay **ON**!' : '🤖 Autoplay **OFF**.')] });
    }
    case 'bassboost': case 'bb': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      const lvls = { off: 0, low: 10, medium: 20, high: 30, extreme: 40 };
      const lvl = args[0]?.toLowerCase() || 'medium';
      const g = lvls[lvl] ?? 20;
      await queue.setFilter(g === 0 ? false : { bass: g });
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription(`🔊 Bass boost: **${lvl}**`)] });
    }
    case 'filter': {
      if (!isDJ(member, guild.id)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ DJ role required!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      const filters = { nightcore: { speed: 1.25, pitch: 1.25 }, vaporwave: { speed: 0.8, pitch: 0.8 }, none: false };
      const f = args[0]?.toLowerCase();
      if (!f || !filters.hasOwnProperty(f)) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Available: `nightcore` `vaporwave` `none`')] });
      await queue.setFilter(filters[f]);
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription(`🎛️ Filter: **${f}**`)] });
    }
    case '247': {
      if (!member.permissions.has('Administrator')) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Admin only!')], flags: 64 });
      if (!queue) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing!')], flags: 64 });
      queue.autoLeave = !queue.autoLeave;
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription(!queue.autoLeave ? '🕐 24/7 **ON**!' : '🕐 24/7 **OFF**.')] });
    }
    case 'dj': {
      if (!member.permissions.has('Administrator')) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Admin only!')], flags: 64 });
      const sub = args[0]?.toLowerCase();
      if (sub === 'clear') { djRoles.delete(guild.id); return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription('🎧 DJ role removed!')] }); }
      const roleId = args[1]?.replace(/[<@&>]/g, '');
      if (!roleId) return reply({ embeds: [new EmbedBuilder().setColor(COLOR).setDescription(`Current DJ: ${djRoles.get(guild.id) ? `<@&${djRoles.get(guild.id)}>` : 'None'}`)] });
      djRoles.set(guild.id, roleId);
      return reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription(`🎧 DJ role: <@&${roleId}>!`)] });
    }
    case 'lyrics': case 'ly': {
      const query = args.join(' ') || queue?.songs[0]?.name;
      if (!query) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Provide a song name!')] });
      if (!process.env.GENIUS_TOKEN) return reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Add `GENIUS_TOKEN` to Railway Variables!')] });
      await reply({ embeds: [new EmbedBuilder().setColor(0xFFA502).setDescription(`⏳ Fetching lyrics...`)] });
      try {
        const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${process.env.GENIUS_TOKEN}` } });
        const data = await res.json();
        const hit = data.response?.hits?.[0]?.result;
        if (!hit) return followUp({ embeds: [new EmbedBuilder().setColor(ERR).setDescription(`❌ No lyrics found!`)] });
        const pageRes = await fetch(hit.url);
        const html = await pageRes.text();
        const blocks = html.match(/data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g);
        let lyrics = blocks ? blocks.map(b => b.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/\[/g,'\n[')).join('\n').replace(/&amp;/g,'&').trim() : 'Not found.';
        if (lyrics.length > 4000) lyrics = lyrics.slice(0, 4000) + '\n...';
        await followUp({ embeds: [new EmbedBuilder().setColor(0xFFFF64).setTitle(`🎤 ${hit.full_title}`).setDescription(lyrics).setURL(hit.url).setThumbnail(hit.song_art_image_thumbnail_url).setFooter({ text: 'Genius' })] });
      } catch { await followUp({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Failed.')] }); }
      break;
    }
    case 'help': case 'h':
      return reply({ embeds: [helpEmbed()] });
  }
}

client.once('ready', async () => {
  console.log(`🎵 Music Bot PRO online! ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(config.discord.token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
    console.log('✅ Slash commands registered!');
  } catch (err) { console.error('❌ Slash commands:', err); }
  client.user.setActivity('/play | Music Bot PRO', { type: 2 });
  console.log('✅ Ready!');
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (!interaction.guild) return interaction.reply({ content: '❌ Server only!', flags: 64 });
    const name = interaction.commandName;
    let args = [];
    const q = interaction.options.getString?.('query') || interaction.options.getString?.('song') || interaction.options.getString?.('time') || interaction.options.getString?.('name') || interaction.options.getString?.('level') || interaction.options.getString?.('mode') || '';
    const num = interaction.options.getInteger?.('level') ?? interaction.options.getInteger?.('position') ?? interaction.options.getInteger?.('page');
    if (name === 'dj') { const sub = interaction.options.getSubcommand(); const role = interaction.options.getRole?.('role'); args = [sub, role ? `<@&${role.id}>` : '']; }
    else if (q) args = [q];
    else if (num !== null && num !== undefined) args = [String(num)];
    try {
      await handleCommand(name, args, interaction.guild, interaction.member, interaction.channel, interaction.member?.voice?.channel,
        (opts) => interaction.reply(opts), (opts) => interaction.followUp(opts));
    } catch (err) {
      console.error(`[Error]`, err);
      const e = { embeds: [new EmbedBuilder().setColor(ERR).setDescription(`❌ ${err.message}`)], flags: 64 };
      interaction.replied ? interaction.followUp(e).catch(()=>{}) : interaction.reply(e).catch(()=>{});
    }
  }

  if (interaction.isButton()) {
    if (!interaction.guild) return;
    const queue = distube.getQueue(interaction.guild.id);
    if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription('❌ Nothing playing.')], flags: 64 });
    try {
      const id = interaction.customId;
      if (id === 'btn_pause') { queue.paused ? queue.resume() : queue.pause(); await interaction.update({ embeds: [nowPlayingEmbed(queue)], components: controlButtons(queue) }); }
      else if (id === 'btn_skip') { await queue.skip(); await interaction.reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription('⏭️ Skipped!')], flags: 64 }); }
      else if (id === 'btn_stop') { distube.destroy(interaction.guild.id); await interaction.update({ embeds: [new EmbedBuilder().setColor(OK).setDescription('⏹️ Stopped!')], components: [] }); }
      else if (id === 'btn_loop') { const m = (queue.repeatMode + 1) % 3; queue.setRepeatMode(m); await interaction.update({ embeds: [nowPlayingEmbed(queue)], components: controlButtons(queue) }); }
      else if (id === 'btn_shuffle') { queue.shuffle(); await interaction.reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription('🔀 Shuffled!')], flags: 64 }); }
      else if (id === 'btn_volup') { queue.setVolume(Math.min(200, queue.volume + 10)); await interaction.update({ embeds: [nowPlayingEmbed(queue)], components: controlButtons(queue) }); }
      else if (id === 'btn_voldown') { queue.setVolume(Math.max(0, queue.volume - 10)); await interaction.update({ embeds: [nowPlayingEmbed(queue)], components: controlButtons(queue) }); }
      else if (id === 'btn_autoplay') { queue.toggleAutoplay(); await interaction.update({ embeds: [nowPlayingEmbed(queue)], components: controlButtons(queue) }); }
      else if (id === 'btn_queue') { await interaction.reply({ embeds: [queueEmbed(queue, 0)], flags: 64 }); }
      else if (id === 'btn_prev') { try { await queue.previous(); } catch {} await interaction.reply({ embeds: [new EmbedBuilder().setColor(OK).setDescription('⏮️ Previous!')], flags: 64 }); }
    } catch (err) {
      console.error('[Button]', err);
      interaction.replied ? null : await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription(`❌ ${err.message}`)], flags: 64 }).catch(()=>{});
    }
  }
});

const PREFIX = config.discord.prefix || '!';
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const name = args.shift().toLowerCase();
  const valid = ['play','p','pause','resume','skip','s','stop','queue','q','np','nowplaying','shuffle','clear','volume','vol','loop','repeat','seek','remove','rm','bassboost','bb','filter','autoplay','ap','lyrics','ly','247','dj','help','h'];
  if (!valid.includes(name)) return;
  try {
    await handleCommand(name, args, message.guild, message.member, message.channel, message.member?.voice?.channel,
      (opts) => message.reply(opts), (opts) => message.channel.send(opts));
  } catch (err) {
    message.reply({ embeds: [new EmbedBuilder().setColor(ERR).setDescription(`❌ ${err.message}`)] }).catch(()=>{});
  }
});

client.on('error', err => console.error('[Client]', err));
process.on('unhandledRejection', err => console.error('[Unhandled]', err));
process.on('uncaughtException', err => console.error('[Uncaught]', err));
process.on('SIGINT', () => { client.destroy(); process.exit(0); });

client.login(config.discord.token);
