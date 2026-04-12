import dotenv from 'dotenv';
dotenv.config();

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN
  },
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
  }
};

export function validateConfig() {
  if (!config.discord.token) {
    console.error('❌ DISCORD_TOKEN is not set in .env file');
    return false;
  }

  if (!config.spotify.clientId || !config.spotify.clientSecret) {
    console.warn('⚠️  Spotify credentials not set. Spotify features will be disabled.');
  }

  return true;
}
