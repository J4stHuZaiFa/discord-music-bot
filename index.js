import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { config, validateConfig } from './config.js';
import { MusicPlayer } from './player.js';
import { slashCommands } from './slashCommands.js';
import {
  nowPlayingEmbed, controlButtons,
  queueEmbed, queueButtons,
  helpEmbed, loadingEmbed,
  successEmbed, errorEmbed, infoEmbed,
  addedEmbed, playlistLoadedEmbed
} from './embeds.js';

if (!validateConfig()) process.exit(1);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

client.players = new Collection();
const getPlayer = (guildId) => {
  if (!client.players.has(guildId)) client.players.set(guildId, new MusicPlayer(client, guildId));
  return client.players.get(guildId);
};

// ── Command Logic ─────────────────────────────────────────────────────────────
async function run(name, args, guild, member, channel, reply, followUp) {
  const player = getPlayer(guild.id);
  player.textChannel = channel;

  switch (name) {

    case 'play': case 'p': {
      const query = args.join(' ');
      if (!query) return reply({ embeds: [errorEmbed('Please provide a song name or URL!')], flags: 64 });
      const vc = member?.voice?.channel;
      if (!vc) return reply({ embeds: [errorEmbed('Join a voice channel first!')], flags: 64 });

      const isLong = query.includes('spotify.com/playlist') || query.includes('youtube.com/playlist');
      await reply({ embeds: [loadingEmbed(query.length > 60 ? query.slice(0, 60) + '...' : query)] });

      try {
        const before = player.queue.length;
        const tracks = await player.addToQueue(query, member.user);
        if (!tracks.length) return followUp({ embeds: [errorEmbed('No results found!')] });

        await player.connect(vc);

        const wasEmpty = before === 0;
        if (wasEmpty) {
          player.currentIndex = 0;
          player.currentTrack = player.queue[0];
          await player.playNext();
        }

        if (isLong) {
          await followUp({ embeds: [playlistLoadedEmbed(player.playlistInfo?.name || query, tracks.length, player.failedTracks.length)] });
          if (wasEmpty) await channel.send({ embeds: [nowPlayingEmbed(player)], components: controlButtons(player) });
        } else if (wasEmpty) {
          await followUp({ embeds: [nowPlayingEmbed(player)], components: controlButtons(player) });
        } else {
          await followUp({ embeds: [addedEmbed(tracks[0], player.queue.length)] });
        }
      } catch (err) {
        console.error('[Play Error]', err);
        await followUp({ embeds: [errorEmbed(err.message)] });
      }
      break;
    }

    case 'pause': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      if (player.pause()) return reply({ embeds: [successEmbed('Paused', '⏸️ Music has been paused.')] });
      return reply({ embeds: [errorEmbed('Nothing is playing or already paused!')] });
    }

    case 'resume': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      if (player.resume()) return reply({ embeds: [successEmbed('Resumed', '▶️ Music resumed!')] });
      return reply({ embeds: [errorEmbed('Not paused!')] });
    }

    case 'skip': case 's': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      if (!player.currentTrack) return reply({ embeds: [errorEmbed('Nothing is playing!')] });
      const title = player.currentTrack.originalTitle || player.currentTrack.title;
      player.skip();
      return reply({ embeds: [successEmbed('Skipped', `⏭️ Skipped **${title}**`)] });
    }

    case 'stop': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      player.stop();
      return reply({ embeds: [successEmbed('Stopped', '⏹️ Stopped and cleared the queue.')] });
    }

    case 'nowplaying': case 'np': {
      if (!player.currentTrack) return reply({ embeds: [errorEmbed('Nothing is playing!')] });
      return reply({ embeds: [nowPlayingEmbed(player)], components: controlButtons(player) });
    }

    case 'queue': case 'q': {
      const q = player.getQueue();
      if (!q.current && !q.total) return reply({ embeds: [errorEmbed('Queue is empty!')] });
      const page = Math.max(0, (parseInt(args[0]) || 1) - 1);
      return reply({ embeds: [queueEmbed(player, page)], components: [queueButtons(player, page)] });
    }

    case 'shuffle': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      if (player.shuffle()) return reply({ embeds: [successEmbed('Shuffled', '🔀 Queue has been shuffled!')] });
      return reply({ embeds: [errorEmbed('Not enough songs to shuffle!')] });
    }

    case 'clear': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      const cur = player.currentTrack;
      player.queue = cur ? [cur] : [];
      player.currentIndex = 0;
      return reply({ embeds: [successEmbed('Cleared', '🗑️ Queue has been cleared!')] });
    }

    case 'volume': case 'vol': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      const vol = parseInt(args[0]);
      if (isNaN(vol)) return reply({ embeds: [infoEmbed('🔉 Volume', `Current volume: **${player.volume}%**`)] });
      player.setVolume(vol);
      const icon = vol === 0 ? '🔇' : vol < 50 ? '🔈' : vol < 120 ? '🔉' : '🔊';
      return reply({ embeds: [successEmbed('Volume', `${icon} Volume set to **${vol}%**`)] });
    }

    case 'loop': case 'repeat': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      const cycle = { none: 'song', song: 'queue', queue: 'none' };
      const mode = args[0]?.toLowerCase() || cycle[player.loopMode];
      if (!['none', 'song', 'queue'].includes(mode)) return reply({ embeds: [errorEmbed('Use: none, song, or queue')] });
      player.setLoop(mode);
      const labels = { none: '➡️ Loop is **off**', song: '🔂 Looping the **current song**', queue: '🔁 Looping the **entire queue**' };
      return reply({ embeds: [successEmbed('Loop', labels[mode])] });
    }

    case 'seek': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      if (!player.currentTrack) return reply({ embeds: [errorEmbed('Nothing is playing!')] });
      const input = args[0];
      let seconds;
      if (input?.includes(':')) { const p = input.split(':').map(Number); seconds = p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1]; }
      else seconds = parseInt(input);
      if (isNaN(seconds) || seconds < 0) return reply({ embeds: [errorEmbed('Use format: `1:30` or `90`')] });
      player.seek(seconds);
      const m = Math.floor(seconds / 60), s = seconds % 60;
      return reply({ embeds: [successEmbed('Seeked', `⏩ Jumped to **${m}:${s.toString().padStart(2, '0')}**`)] });
    }

    case 'remove': case 'rm': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      const idx = parseInt(args[0]);
      if (isNaN(idx)) return reply({ embeds: [errorEmbed('Usage: `/remove <number>`')] });
      const removed = player.removeTrack(idx);
      if (!removed) return reply({ embeds: [errorEmbed('Invalid track number!')] });
      return reply({ embeds: [successEmbed('Removed', `🗑️ Removed **${removed.originalTitle || removed.title}**`)] });
    }

    case 'bassboost': case 'bb': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      const levels = { off: null, low: 'bass=g=10', medium: 'bass=g=20', high: 'bass=g=30', extreme: 'bass=g=40' };
      const level = args[0]?.toLowerCase() || (player.currentFilter?.includes('bass') ? 'off' : 'medium');
      player.currentFilter = levels[level] ?? null;
      return reply({ embeds: [successEmbed('Bass Boost', `🔊 Bass boost set to **${level}**`)] });
    }

    case 'filter': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      const FILTERS = { nightcore: 'aresample=48000,asetrate=48000*1.25', vaporwave: 'aresample=48000,asetrate=48000*0.8', '8d': 'apulsator=hz=0.08', echo: 'aecho=0.8:0.88:60:0.4', karaoke: 'pan=stereo|c0=c0|c1=c1', treble: 'treble=g=5', loud: 'volume=4.0', none: null };
      const name = args[0]?.toLowerCase();
      if (!name || !FILTERS.hasOwnProperty(name)) return reply({ embeds: [errorEmbed('Available: nightcore, vaporwave, 8d, echo, karaoke, treble, loud, none')] });
      player.currentFilter = FILTERS[name];
      return reply({ embeds: [successEmbed('Filter', `🎛️ Filter set to **${name}**\n> Skip or restart song to hear the effect.`)] });
    }

    case 'autoplay': case 'ap': {
      if (!player.isDJ(member)) return reply({ embeds: [errorEmbed('You need the DJ role!')], flags: 64 });
      player.autoplay = !player.autoplay;
      return reply({ embeds: [successEmbed('Autoplay', player.autoplay ? '🤖 Autoplay **enabled** — I\'ll keep the music going!' : '🤖 Autoplay **disabled**.')] });
    }

    case 'lyrics': case 'ly': {
      const query = args.join(' ') || player.currentTrack?.originalTitle || player.currentTrack?.title;
      if (!query) return reply({ embeds: [errorEmbed('Provide a song name or have a song playing!')] });
      if (!config.genius) return reply({ embeds: [errorEmbed('Add `GENIUS_TOKEN` to your `.env` file!\nGet free token at genius.com/api-clients')] });
      await reply({ embeds: [loadingEmbed(`Searching lyrics for: ${query}`)] });
      try {
        const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${config.genius}` } });
        const data = await res.json();
        const hit = data.response?.hits?.[0]?.result;
        if (!hit) return followUp({ embeds: [errorEmbed(`No lyrics found for **${query}**`)] });
        const pageRes = await fetch(hit.url);
        const html = await pageRes.text();
        const blocks = html.match(/data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g);
        let lyrics = blocks ? blocks.map(b => b.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/\[/g,'\n[')).join('\n').replace(/&amp;/g,'&').trim() : 'Lyrics not available.';
        if (lyrics.length > 4000) lyrics = lyrics.slice(0, 4000) + '\n...';
        const { EmbedBuilder } = await import('discord.js');
        await followUp({ embeds: [new EmbedBuilder().setColor(0xFFFF64).setTitle(`🎤 ${hit.full_title}`).setDescription(lyrics).setURL(hit.url).setThumbnail(hit.song_art_image_thumbnail_url).setFooter({ text: 'Powered by Genius' }).setTimestamp()] });
      } catch (err) {
        console.error('Lyrics error:', err);
        await followUp({ embeds: [errorEmbed('Failed to fetch lyrics. Try again later.')] });
      }
      break;
    }

    case '247': {
      if (!member.permissions.has('Administrator') && !player.isDJ(member)) return reply({ embeds: [errorEmbed('Admin or DJ only!')], flags: 64 });
      player.is247 = !player.is247;
      return reply({ embeds: [successEmbed('24/7 Mode', player.is247 ? '🕐 24/7 mode **ON** — I\'ll stay in voice forever!' : '🕐 24/7 mode **OFF** — I\'ll leave after 5 min of inactivity.')] });
    }

    case 'dj': {
      if (!member.permissions.has('Administrator')) return reply({ embeds: [errorEmbed('Administrator only!')], flags: 64 });
      const sub = args[0]?.toLowerCase();
      if (sub === 'clear') { player.djRoleId = null; return reply({ embeds: [successEmbed('DJ Role', '🎧 DJ role removed — everyone can control music.')] }); }
      const roleId = args[1]?.replace(/[<@&>]/g, '');
      if (!roleId) return reply({ embeds: [infoEmbed('🎧 DJ Role', `Current: ${player.djRoleId ? `<@&${player.djRoleId}>` : 'None (everyone)'}\n\nUsage: \`/dj set @role\` or \`/dj clear\``)] });
      player.djRoleId = roleId;
      return reply({ embeds: [successEmbed('DJ Role', `🎧 DJ role set to <@&${roleId}>!`)] });
    }

    case 'help': case 'h':
      return reply({ embeds: [helpEmbed()] });
  }
}

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n🎵 Music Bot PRO v4 is online!`);
  console.log(`📝 Logged in as: ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(config.token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
    console.log('✅ Slash commands registered globally!');
  } catch (err) { console.error('❌ Slash commands failed:', err.message); }
  client.user.setActivity('/play | Music Bot PRO', { type: 2 });
  console.log('✅ Ready!\n');
});

// ── Slash Commands ────────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (!interaction.guild) return interaction.reply({ content: '❌ Server only!', flags: 64 });
    const name = interaction.commandName;
    let args = [];
    const str = interaction.options.getString?.('query') || interaction.options.getString?.('song') || interaction.options.getString?.('time') || interaction.options.getString?.('name') || interaction.options.getString?.('level') || interaction.options.getString?.('mode') || '';
    const num = interaction.options.getInteger?.('level') ?? interaction.options.getInteger?.('position') ?? interaction.options.getInteger?.('page');
    if (name === 'dj') { const sub = interaction.options.getSubcommand(); const role = interaction.options.getRole?.('role'); args = [sub, role ? `<@&${role.id}>` : '']; }
    else if (str) args = [str];
    else if (num !== null && num !== undefined) args = [String(num)];
    try {
      await run(name, args, interaction.guild, interaction.member, interaction.channel,
        o => interaction.reply(o), o => interaction.followUp(o));
    } catch (err) {
      console.error('[Slash]', err);
      const e = { embeds: [errorEmbed(err.message)], flags: 64 };
      interaction.replied ? interaction.followUp(e).catch(() => {}) : interaction.reply(e).catch(() => {});
    }
  }

  // ── Buttons ────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    if (!interaction.guild) return;
    const player = client.players.get(interaction.guild.id);
    if (!player) return interaction.reply({ embeds: [errorEmbed('No active player.')], flags: 64 });
    const id = interaction.customId;
    try {
      if (id === 'btn_pause') {
        player.isPaused ? player.resume() : player.pause();
        await interaction.update({ embeds: [nowPlayingEmbed(player)], components: controlButtons(player) });

      } else if (id === 'btn_skip') {
        const title = player.currentTrack?.originalTitle || player.currentTrack?.title || 'Unknown';
        player.skip();
        await interaction.reply({ embeds: [successEmbed('Skipped', `⏭️ Skipped **${title}**`)], flags: 64 });

      } else if (id === 'btn_stop') {
        player.stop();
        await interaction.update({ embeds: [successEmbed('Stopped', '⏹️ Music stopped and queue cleared.')], components: [] });

      } else if (id === 'btn_loop') {
        const cycle = { none: 'song', song: 'queue', queue: 'none' };
        player.setLoop(cycle[player.loopMode]);
        await interaction.update({ embeds: [nowPlayingEmbed(player)], components: controlButtons(player) });

      } else if (id === 'btn_shuffle') {
        player.shuffle();
        await interaction.reply({ embeds: [successEmbed('Shuffled', '🔀 Queue shuffled!')], flags: 64 });

      } else if (id === 'btn_volup') {
        player.setVolume(Math.min(200, player.volume + 10));
        await interaction.update({ embeds: [nowPlayingEmbed(player)], components: controlButtons(player) });

      } else if (id === 'btn_voldown') {
        player.setVolume(Math.max(0, player.volume - 10));
        await interaction.update({ embeds: [nowPlayingEmbed(player)], components: controlButtons(player) });

      } else if (id === 'btn_autoplay') {
        player.autoplay = !player.autoplay;
        await interaction.update({ embeds: [nowPlayingEmbed(player)], components: controlButtons(player) });

      } else if (id === 'btn_queue') {
        const q = player.getQueue();
        if (!q.current && !q.total) return interaction.reply({ embeds: [errorEmbed('Queue is empty!')], flags: 64 });
        await interaction.reply({ embeds: [queueEmbed(player, 0)], components: [queueButtons(player, 0)], flags: 64 });

      } else if (id === 'btn_prev') {
        if (player.currentIndex > 0) { player.currentIndex -= 2; player.audioPlayer.stop(); }
        await interaction.reply({ embeds: [successEmbed('Previous', '⏮️ Going back!')], flags: 64 });

      } else if (id === 'btn_qprev' || id === 'btn_qnext') {
        const match = interaction.message.embeds[0]?.footer?.text?.match(/Page (\d+)/);
        let page = match ? parseInt(match[1]) - 1 : 0;
        page += id === 'btn_qnext' ? 1 : -1;
        await interaction.update({ embeds: [queueEmbed(player, page)], components: [queueButtons(player, page)] });
      }
    } catch (err) {
      console.error('[Button]', err);
      interaction.replied ? null : await interaction.reply({ embeds: [errorEmbed(err.message)], flags: 64 }).catch(() => {});
    }
  }
});

// ── Prefix Commands ───────────────────────────────────────────────────────────
const PREFIX = config.prefix;
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const name = args.shift().toLowerCase();
  const valid = ['play','p','pause','resume','skip','s','stop','queue','q','np','nowplaying','shuffle','clear','volume','vol','loop','repeat','seek','remove','rm','bassboost','bb','filter','autoplay','ap','lyrics','ly','247','dj','help','h'];
  if (!valid.includes(name)) return;
  try {
    await run(name, args, message.guild, message.member, message.channel,
      o => message.reply(o), o => message.channel.send(o));
  } catch (err) {
    message.reply({ embeds: [errorEmbed(err.message)] }).catch(() => {});
  }
});

// ── Error Handling ────────────────────────────────────────────────────────────
client.on('error', err => console.error('[Client]', err));
process.on('unhandledRejection', err => console.error('[Unhandled]', err));
process.on('uncaughtException', err => console.error('[Uncaught]', err));
process.on('SIGINT', () => { console.log('\n👋 Shutting down...'); client.destroy(); process.exit(0); });

client.login(config.token);
