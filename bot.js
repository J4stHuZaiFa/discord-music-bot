import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config, validateConfig } from './config.js';
import { playCommand } from './commands/play.js';
import { pauseCommand } from './commands/pause.js';
import { resumeCommand } from './commands/resume.js';
import { skipCommand } from './commands/skip.js';
import { stopCommand } from './commands/stop.js';
import { queueCommand } from './commands/queue.js';
import { nowPlayingCommand } from './commands/nowplaying.js';
import { PlaylistDisplay } from './playlistDisplay.js';
import { MusicPlayer } from './musicPlayer.js';

if (!validateConfig()) {
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping
  ]
});

client.musicPlayers = new Collection();

const commands = {
  play: playCommand,
  p: playCommand,
  pause: pauseCommand,
  resume: resumeCommand,
  skip: skipCommand,
  s: skipCommand,
  stop: stopCommand,
  queue: queueCommand,
  q: queueCommand,
  np: nowPlayingCommand,
  nowplaying: nowPlayingCommand
};

client.once('ready', () => {
  console.log('🎵 Music Bot is ready!');
  console.log(`📝 Logged in as ${client.user.tag}`);
  console.log(`🤖 Bot ID: ${client.user.id}`);
  console.log('\n📋 Available commands:');
  console.log('  !play <spotify-playlist-url> - Play a Spotify playlist');
  console.log('  !pause - Pause playback');
  console.log('  !resume - Resume playback');
  console.log('  !skip - Skip to the next song');
  console.log('  !queue - Show the playlist');
  console.log('  !np - Show now playing');
  console.log('  !stop - Stop playback and clear queue');
  console.log('\n✅ Ready to play music in servers!');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = commands[commandName];
  if (!command) return;

  try {
    const channelId = message.channel.id;

    if (!client.musicPlayers.has(channelId)) {
      client.musicPlayers.set(channelId, new MusicPlayer(client, channelId));
    }

    const player = client.musicPlayers.get(channelId);
    await command(message, args, player);
  } catch (error) {
    console.error('Error executing command:', error);
    await message.reply(`❌ An error occurred: ${error.message}`);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    const channelId = interaction.channel.id;
    const player = client.musicPlayers.get(channelId);

    if (!player) {
      return interaction.reply({ content: '❌ No player active in this channel', ephemeral: true });
    }

    const customId = interaction.customId;

    if (customId === 'pause_resume') {
      if (player.isPaused) {
        player.resume();
        await interaction.reply({ content: '▶️ Resumed', ephemeral: true });
      } else {
        player.pause();
        await interaction.reply({ content: '⏸️ Paused', ephemeral: true });
      }

      const embed = PlaylistDisplay.createPlaylistEmbed(player, 0);
      const buttons = PlaylistDisplay.createPlaylistButtons(player, 0);
      await interaction.message.edit({ embeds: [embed], components: [buttons] });
    } else if (customId === 'skip_track') {
      const skipped = player.currentTrack?.title || 'Unknown';
      player.skip();
      await interaction.reply({ content: `⏭️ Skipped: ${skipped}`, ephemeral: true });
    } else if (customId === 'stop_player') {
      player.stop();
      await interaction.reply({ content: '⏹️ Playback stopped', ephemeral: true });
      await interaction.message.delete().catch(() => {});
    } else if (customId === 'next_page' || customId === 'prev_page') {
      const pageMatch = interaction.message.embeds[0]?.footer?.text?.match(/Page (\d+)/);
      let currentPage = pageMatch ? parseInt(pageMatch[1]) - 1 : 0;

      if (customId === 'next_page') {
        currentPage++;
      } else if (customId === 'prev_page') {
        currentPage--;
      }

      const embed = PlaylistDisplay.createPlaylistEmbed(player, currentPage);
      const buttons = PlaylistDisplay.createPlaylistButtons(player, currentPage);
      await interaction.update({ embeds: [embed], components: [buttons] });
    }
  } catch (error) {
    console.error('Button interaction error:', error);
    await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
  }
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

client.login(config.discord.token);
