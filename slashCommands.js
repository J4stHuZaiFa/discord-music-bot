import { SlashCommandBuilder } from 'discord.js';

export const slashCommands = [
  new SlashCommandBuilder().setName('play').setDescription('Play a song or playlist')
    .addStringOption(o => o.setName('query').setDescription('Song name, YouTube or Spotify URL').setRequired(true)),
  new SlashCommandBuilder().setName('pause').setDescription('Pause the current song'),
  new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  new SlashCommandBuilder().setName('skip').setDescription('Skip the current song'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop music and clear queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show what is currently playing'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the music queue')
    .addIntegerOption(o => o.setName('page').setDescription('Page number').setRequired(false)),
  new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue'),
  new SlashCommandBuilder().setName('clear').setDescription('Clear the queue'),
  new SlashCommandBuilder().setName('volume').setDescription('Set or check volume')
    .addIntegerOption(o => o.setName('level').setDescription('0-200').setRequired(false).setMinValue(0).setMaxValue(200)),
  new SlashCommandBuilder().setName('loop').setDescription('Set loop mode')
    .addStringOption(o => o.setName('mode').setDescription('Loop mode').setRequired(false)
      .addChoices({name:'Off',value:'none'},{name:'Song',value:'song'},{name:'Queue',value:'queue'})),
  new SlashCommandBuilder().setName('seek').setDescription('Seek to a position')
    .addStringOption(o => o.setName('time').setDescription('e.g. 1:30 or 90').setRequired(true)),
  new SlashCommandBuilder().setName('remove').setDescription('Remove a song from queue')
    .addIntegerOption(o => o.setName('position').setDescription('Track number').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('bassboost').setDescription('Set bass boost')
    .addStringOption(o => o.setName('level').setDescription('Level').setRequired(false)
      .addChoices({name:'Off',value:'off'},{name:'Low',value:'low'},{name:'Medium',value:'medium'},{name:'High',value:'high'},{name:'Extreme',value:'extreme'})),
  new SlashCommandBuilder().setName('filter').setDescription('Apply audio filter')
    .addStringOption(o => o.setName('name').setDescription('Filter').setRequired(true)
      .addChoices({name:'None',value:'none'},{name:'Nightcore',value:'nightcore'},{name:'Vaporwave',value:'vaporwave'},{name:'8D',value:'8d'},{name:'Echo',value:'echo'},{name:'Karaoke',value:'karaoke'},{name:'Treble',value:'treble'},{name:'Loud',value:'loud'})),
  new SlashCommandBuilder().setName('autoplay').setDescription('Toggle autoplay'),
  new SlashCommandBuilder().setName('lyrics').setDescription('Get lyrics')
    .addStringOption(o => o.setName('song').setDescription('Song name').setRequired(false)),
  new SlashCommandBuilder().setName('247').setDescription('Toggle 24/7 mode'),
  new SlashCommandBuilder().setName('dj').setDescription('Manage DJ role')
    .addSubcommand(s => s.setName('set').setDescription('Set DJ role').addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(s => s.setName('clear').setDescription('Remove DJ restriction')),
  new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
].map(cmd => cmd.toJSON());
