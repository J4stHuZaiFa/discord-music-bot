import { REST, Routes } from 'discord.js';
import { slashCommands } from './slashCommands.js';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('❌ DISCORD_TOKEN and CLIENT_ID must be set in .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

try {
  console.log('🔄 Registering slash commands...');
  await rest.put(Routes.applicationCommands(clientId), { body: slashCommands });
  console.log(`✅ Registered ${slashCommands.length} slash commands globally!`);
  console.log('⏳ Note: Global commands can take up to 1 hour to appear in Discord.');
  console.log('💡 Tip: For instant testing, use guild commands instead.');
} catch (err) {
  console.error('❌ Failed to register commands:', err);
}
