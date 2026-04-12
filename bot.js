import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { config, validateConfig } from './config.js';
import { MusicPlayer } from './musicPlayer.js';
import { Display } from './display.js';
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

client.musicPlayers = new Collection();

function getPlayer(guildId) {
  if (!client.musicPlayers.has(guildId)) {
    client.musicPlayers.set(guildId, new MusicPlayer(client, guildId));
  }
  return client.musicPlayers.get(guildId);
}

// ─── Register Slash Commands ──────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n🎵 Music Bot PRO v3 is online!`);
  console.log(`📝 Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(config.discord.token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
    console.log('✅ Slash commands registered globally!');
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
  }

  client.user.setActivity('/play | Music Bot PRO', { type: 2 });
  console.log('✅ Ready!\n');
});

// ─── Handle both slash commands AND prefix commands ───────────────────────────
async function handleCommand(name, args, guildId, member, channel, reply, followUp) {
  const player = getPlayer(guildId);
  player.textChannel = channel;

  switch (name) {

    case 'play': case 'p': {
      const query = args.join(' ');
      if (!query) return reply({ embeds: [Display.errorEmbed('Please provide a song name or URL!')], flags: 64 });
      const vc = member?.voice?.channel;
      if (!vc) return reply({ embeds: [Display.errorEmbed('Join a voice channel first!')], flags: 64 });

      await reply({ embeds: [Display.loadingEmbed(query.length > 50 ? query.slice(0, 50) + '...' : query)] });
      try {
        const tracks = await player.addToQueue(query, member.user);
        if (!tracks.length) return followUp({ embeds: [Display.errorEmbed('No results found.')] });

        await player.connect(vc);
        if (!player.isPlaying) {
          player.currentIndex = player.queue.length - tracks.length;
          player.currentTrack = player.queue[player.currentIndex];
          await player.playNext();
        }

        const embed = Display.nowPlayingEmbed(player);
        const buttons = Display.controlButtons(player);
        await followUp({ embeds: [embed], components: buttons });
      } catch (err) {
        await followUp({ embeds: [Display.errorEmbed(err.message)] });
      }
      break;
    }

    case 'pause': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      player.pause();
      return reply({ embeds: [Display.successEmbed('Paused', '⏸️ Music paused.')] });
    }

    case 'resume': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      player.resume();
      return reply({ embeds: [Display.successEmbed('Resumed', '▶️ Music resumed!')] });
    }

    case 'skip': case 's': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      const title = player.currentTrack?.originalTitle || player.currentTrack?.title || 'Unknown';
      player.skip();
      return reply({ embeds: [Display.successEmbed('Skipped', `⏭️ Skipped **${title}**`)] });
    }

    case 'stop': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      player.stop();
      return reply({ embeds: [Display.successEmbed('Stopped', '⏹️ Stopped and cleared the queue.')] });
    }

    case 'nowplaying': case 'np': {
      if (!player.currentTrack) return reply({ embeds: [Display.errorEmbed('Nothing is playing!')] });
      const buttons = Display.controlButtons(player);
      return reply({ embeds: [Display.nowPlayingEmbed(player)], components: buttons });
    }

    case 'queue': case 'q': {
      const page = Math.max(0, (parseInt(args[0]) || 1) - 1);
      const q = player.getQueue();
      if (!q.current && !q.total) return reply({ embeds: [Display.errorEmbed('Queue is empty!')] });
      return reply({ embeds: [Display.queueEmbed(player, page)], components: [Display.queueButtons(player, page)] });
    }

    case 'shuffle': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      player.shuffle();
      return reply({ embeds: [Display.successEmbed('Shuffled', '🔀 Queue shuffled!')] });
    }

    case 'clear': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      const current = player.currentTrack;
      player.queue = current ? [current] : [];
      player.currentIndex = 0;
      return reply({ embeds: [Display.successEmbed('Cleared', '🗑️ Queue cleared!')] });
    }

    case 'volume': case 'vol': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      const vol = parseInt(args[0]);
      if (isNaN(vol)) return reply({ embeds: [Display.infoEmbed('Volume', `Current volume: **${player.volume}%**`)] });
      player.setVolume(vol);
      const icon = vol === 0 ? '🔇' : vol < 50 ? '🔈' : vol < 120 ? '🔉' : '🔊';
      return reply({ embeds: [Display.successEmbed('Volume', `${icon} Volume set to **${vol}%**`)] });
    }

    case 'loop': case 'repeat': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      const modes = { none: 'song', song: 'queue', queue: 'none' };
      const mode = args[0] || modes[player.loopMode];
      player.setLoop(mode);
      const labels = { none: '➡️ Loop **off**', song: '🔂 Looping **current song**', queue: '🔁 Looping **entire queue**' };
      return reply({ embeds: [Display.successEmbed('Loop', labels[player.loopMode])] });
    }

    case 'seek': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      if (!player.currentTrack) return reply({ embeds: [Display.errorEmbed('Nothing is playing!')] });
      const input = args[0];
      let seconds;
      if (input?.includes(':')) {
        const parts = input.split(':').map(Number);
        seconds = parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2] : parts[0]*60+parts[1];
      } else seconds = parseInt(input);
      if (isNaN(seconds)) return reply({ embeds: [Display.errorEmbed('Invalid time. Use `1:30` or `90`')] });
      player.seek(seconds);
      const m = Math.floor(seconds/60), s = seconds%60;
      return reply({ embeds: [Display.successEmbed('Seeked', `⏩ Jumped to **${m}:${s.toString().padStart(2,'0')}**`)] });
    }

    case 'remove': case 'rm': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      const idx = parseInt(args[0]);
      if (isNaN(idx)) return reply({ embeds: [Display.errorEmbed('Usage: `/remove <number>`')] });
      const removed = player.removeTrack(idx);
      if (!removed) return reply({ embeds: [Display.errorEmbed('Invalid track number!')] });
      return reply({ embeds: [Display.successEmbed('Removed', `🗑️ Removed **${removed.originalTitle || removed.title}**`)] });
    }

    case 'bassboost': case 'bb': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      const levels = { off: null, low: 'bass=g=10', medium: 'bass=g=20', high: 'bass=g=30', extreme: 'bass=g=40' };
      const level = args[0]?.toLowerCase() || (player.currentFilter?.includes('bass') ? 'off' : 'medium');
      player.currentFilter = levels[level] ?? null;
      return reply({ embeds: [Display.successEmbed('Bass Boost', `🔊 Bass boost: **${level}**`)] });
    }

    case 'filter': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      const FILTERS = { nightcore:'aresample=48000,asetrate=48000*1.25', vaporwave:'aresample=48000,asetrate=48000*0.8', '8d':'apulsator=hz=0.08', echo:'aecho=0.8:0.88:60:0.4', karaoke:'pan=stereo|c0=c0|c1=c1', treble:'treble=g=5', loud:'volume=4.0', none: null };
      const name = args[0]?.toLowerCase();
      if (!name || !FILTERS.hasOwnProperty(name)) return reply({ embeds: [Display.errorEmbed('Available: nightcore, vaporwave, 8d, echo, karaoke, treble, loud, none')] });
      player.currentFilter = FILTERS[name];
      return reply({ embeds: [Display.successEmbed('Filter', `🎛️ Filter set to **${name}**`)] });
    }

    case 'autoplay': case 'ap': {
      if (!player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('You need the DJ role!')], flags: 64 });
      player.autoplay = !player.autoplay;
      return reply({ embeds: [Display.successEmbed('Autoplay', player.autoplay ? '🤖 Autoplay **enabled**!' : '🤖 Autoplay **disabled**.')] });
    }

    case 'lyrics': case 'ly': {
      const query = args.join(' ') || player.currentTrack?.originalTitle || player.currentTrack?.title;
      if (!query) return reply({ embeds: [Display.errorEmbed('Provide a song name or have a song playing.')] });
      if (!process.env.GENIUS_TOKEN) return reply({ embeds: [Display.errorEmbed('Add `GENIUS_TOKEN` to Railway Variables to enable lyrics!')] });
      await reply({ embeds: [Display.loadingEmbed(`Searching lyrics for: ${query}`)] });
      try {
        const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${process.env.GENIUS_TOKEN}` } });
        const data = await res.json();
        const hit = data.response?.hits?.[0]?.result;
        if (!hit) return followUp({ embeds: [Display.errorEmbed(`No lyrics found for **${query}**`)] });
        const pageRes = await fetch(hit.url);
        const html = await pageRes.text();
        const blocks = html.match(/data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g);
        let lyrics = blocks ? blocks.map(b => b.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/\[/g,'\n[')).join('\n').replace(/&amp;/g,'&').trim() : 'Lyrics not found.';
        if (lyrics.length > 4000) lyrics = lyrics.slice(0, 4000) + '\n...';
        await followUp({ embeds: [new (await import('discord.js')).EmbedBuilder().setColor(0xFFFF64).setTitle(`🎤 ${hit.full_title}`).setDescription(lyrics).setURL(hit.url).setThumbnail(hit.song_art_image_thumbnail_url).setFooter({ text: 'Powered by Genius' })] });
      } catch { await followUp({ embeds: [Display.errorEmbed('Failed to fetch lyrics.')] }); }
      break;
    }

    case '247': {
      if (!member.permissions.has('Administrator') && !player.isDJ(member)) return reply({ embeds: [Display.errorEmbed('Admin or DJ only!')], flags: 64 });
      player.is247 = !player.is247;
      return reply({ embeds: [Display.successEmbed('24/7 Mode', player.is247 ? '🕐 24/7 mode **ON** — I\'ll stay forever!' : '🕐 24/7 mode **OFF**')] });
    }

    case 'dj': {
      if (!member.permissions.has('Administrator')) return reply({ embeds: [Display.errorEmbed('Administrator only!')], flags: 64 });
      const sub = args[0]?.toLowerCase();
      if (sub === 'clear') { player.djRoleId = null; return reply({ embeds: [Display.successEmbed('DJ Role', '🎧 DJ role removed — everyone can control music.')] }); }
      const roleId = args[1]?.replace(/[<@&>]/g, '');
      if (!roleId) return reply({ embeds: [Display.infoEmbed('DJ Role', `Current: ${player.djRoleId ? `<@&${player.djRoleId}>` : 'None'}\n\nUsage: \`/dj set @role\` or \`/dj clear\``)] });
      player.djRoleId = roleId;
      return reply({ embeds: [Display.successEmbed('DJ Role', `🎧 DJ role set to <@&${roleId}>!`)] });
    }

    case 'help': case 'h':
      return reply({ embeds: [Display.helpEmbed()] });

    default:
      return;
  }
}

// ─── Slash Command Handler ────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (!interaction.guild) return interaction.reply({ content: '❌ Use me in a server!', flags: 64 });

    const name = interaction.commandName;
    let args = [];

    // Extract args from slash command options
    const query = interaction.options.getString?.('query') || interaction.options.getString?.('song') || interaction.options.getString?.('time') || interaction.options.getString?.('name') || interaction.options.getString?.('level') || interaction.options.getString?.('mode') || '';
    const num = interaction.options.getInteger?.('level') ?? interaction.options.getInteger?.('position') ?? interaction.options.getInteger?.('page');

    if (name === 'dj') {
      const sub = interaction.options.getSubcommand();
      const role = interaction.options.getRole?.('role');
      args = [sub, role ? `<@&${role.id}>` : ''];
    } else if (query) args = [query];
    else if (num !== null && num !== undefined) args = [String(num)];

    try {
      await handleCommand(
        name, args,
        interaction.guild.id,
        interaction.member,
        interaction.channel,
        (opts) => interaction.reply(opts),
        (opts) => interaction.followUp(opts)
      );
    } catch (err) {
      console.error(`[Slash Error] ${name}:`, err);
      const errMsg = { embeds: [Display.errorEmbed(err.message)], flags: 64 };
      interaction.replied ? interaction.followUp(errMsg) : interaction.reply(errMsg);
    }
  }

  // ─── Button Handler ─────────────────────────────────────────────────────
  if (interaction.isButton()) {
    if (!interaction.guild) return;
    const player = client.musicPlayers.get(interaction.guild.id);
    if (!player) return interaction.reply({ embeds: [Display.errorEmbed('No active player.')], flags: 64 });

    const id = interaction.customId;

    try {
      if (id === 'btn_pause') {
        player.isPaused ? player.resume() : player.pause();
        await interaction.update({ embeds: [Display.nowPlayingEmbed(player)], components: Display.controlButtons(player) });

      } else if (id === 'btn_skip') {
        player.skip();
        await interaction.reply({ embeds: [Display.successEmbed('Skipped', '⏭️ Skipped!')], flags: 64 });

      } else if (id === 'btn_stop') {
        player.stop();
        await interaction.update({ embeds: [Display.successEmbed('Stopped', '⏹️ Music stopped.')], components: [] });

      } else if (id === 'btn_loop') {
        const modes = { none: 'song', song: 'queue', queue: 'none' };
        player.setLoop(modes[player.loopMode]);
        await interaction.update({ embeds: [Display.nowPlayingEmbed(player)], components: Display.controlButtons(player) });

      } else if (id === 'btn_shuffle') {
        player.shuffle();
        await interaction.reply({ embeds: [Display.successEmbed('Shuffled', '🔀 Queue shuffled!')], flags: 64 });

      } else if (id === 'btn_volup') {
        player.setVolume(Math.min(200, player.volume + 10));
        await interaction.update({ embeds: [Display.nowPlayingEmbed(player)], components: Display.controlButtons(player) });

      } else if (id === 'btn_voldown') {
        player.setVolume(Math.max(0, player.volume - 10));
        await interaction.update({ embeds: [Display.nowPlayingEmbed(player)], components: Display.controlButtons(player) });

      } else if (id === 'btn_autoplay') {
        player.autoplay = !player.autoplay;
        await interaction.update({ embeds: [Display.nowPlayingEmbed(player)], components: Display.controlButtons(player) });

      } else if (id === 'btn_queue') {
        await interaction.reply({ embeds: [Display.queueEmbed(player, 0)], components: [Display.queueButtons(player, 0)], flags: 64 });

      } else if (id === 'btn_prev') {
        if (player.currentIndex > 0) {
          player.currentIndex -= 2;
          player.audioPlayer.stop();
        }
        await interaction.reply({ embeds: [Display.successEmbed('Previous', '⏮️ Going back!')], flags: 64 });

      } else if (id === 'btn_qprev' || id === 'btn_qnext') {
        const pageMatch = interaction.message.embeds[0]?.footer?.text?.match(/Page (\d+)/);
        let page = pageMatch ? parseInt(pageMatch[1]) - 1 : 0;
        page += id === 'btn_qnext' ? 1 : -1;
        await interaction.update({ embeds: [Display.queueEmbed(player, page)], components: [Display.queueButtons(player, page)] });
      }
    } catch (err) {
      console.error('[Button Error]', err);
      interaction.replied ? null : await interaction.reply({ embeds: [Display.errorEmbed(err.message)], flags: 64 }).catch(() => {});
    }
  }
});

// ─── Prefix Commands (!play etc) ──────────────────────────────────────────────
const PREFIX = config.discord.prefix;
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const name = args.shift().toLowerCase();

  const validCmds = ['play','p','pause','resume','skip','s','stop','queue','q','np','nowplaying','shuffle','clear','volume','vol','loop','repeat','seek','remove','rm','bassboost','bb','filter','autoplay','ap','lyrics','ly','247','dj','help','h'];
  if (!validCmds.includes(name)) return;

  try {
    await handleCommand(
      name, args,
      message.guild.id,
      message.member,
      message.channel,
      (opts) => message.reply(opts),
      (opts) => message.channel.send(opts)
    );
  } catch (err) {
    console.error(`[Prefix Error] ${name}:`, err);
    message.reply({ embeds: [Display.errorEmbed(err.message)] }).catch(() => {});
  }
});

// ─── Error Handling ───────────────────────────────────────────────────────────
client.on('error', (err) => console.error('[Client Error]', err));
process.on('unhandledRejection', (err) => console.error('[Unhandled]', err));
process.on('uncaughtException', (err) => console.error('[Uncaught]', err));
process.on('SIGINT', () => { client.destroy(); process.exit(0); });

client.login(config.discord.token);
