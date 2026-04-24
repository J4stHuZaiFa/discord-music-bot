import dotenv from 'dotenv';
dotenv.config();

export const config = {
  token: process.env.DISCORD_TOKEN,
  prefix: process.env.PREFIX || '!',
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  },
  genius: process.env.GENIUS_TOKEN,
  djRoleId: process.env.DJ_ROLE_ID || null,
  ytCookie: process.env.YT_COOKIE || null,
};

export function validateConfig() {
  if (!config.token) { console.error('❌ DISCORD_TOKEN missing in .env'); return false; }
  if (!config.spotify.clientId) console.warn('⚠️  Spotify not configured');
  if (!config.genius) console.warn('⚠️  GENIUS_TOKEN not set');
  if (!config.ytCookie) console.warn('⚠️  YT_COOKIE not set — YouTube may be limited');
  return true;
}
