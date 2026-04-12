import dotenv from 'dotenv';
dotenv.config();

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    prefix: process.env.PREFIX || '!'
  },
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
  },
  genius: {
    token: process.env.GENIUS_TOKEN
  },
  dj: {
    roleId: process.env.DJ_ROLE_ID || null
  }
};

export function validateConfig() {
  if (!config.discord.token) {
    console.error('❌ DISCORD_TOKEN is not set in .env file');
    return false;
  }
  if (!config.spotify.clientId || !config.spotify.clientSecret) {
    console.warn('⚠️  Spotify credentials not set. Spotify features disabled.');
  }
  if (!config.genius.token) {
    console.warn('⚠️  GENIUS_TOKEN not set. Lyrics feature disabled.');
  }
  return true;
}
