# Project Structure

This document explains how the Discord music bot is organized.

## File Structure

```
discord-music-bot/
├── bot.js                    # Main bot entry point
├── config.js                 # Configuration management
├── musicPlayer.js            # Music player logic and queue management
├── commands/                 # Bot commands
│   ├── play.js              # Play music command
│   ├── pause.js             # Pause command
│   ├── resume.js            # Resume command
│   ├── skip.js              # Skip command
│   ├── stop.js              # Stop command
│   ├── queue.js             # Show queue command
│   └── nowplaying.js        # Now playing command
├── .env                     # Your configuration (DO NOT COMMIT)
├── .env.example             # Example configuration
├── package.json             # Dependencies
├── README.md                # Full documentation
├── QUICKSTART.md            # Quick start guide
└── PROJECT_STRUCTURE.md     # This file
```

## Core Files

### bot.js
The main entry point for the bot. It:
- Initializes the Discord client
- Registers all commands
- Handles incoming messages
- Creates music player instances for each channel

### config.js
Manages configuration from environment variables:
- Discord bot token
- Spotify API credentials
- Configuration validation

### musicPlayer.js
The heart of the music system. It handles:
- Voice connection management
- Music queue management
- YouTube and Spotify integration
- Audio playback control
- Track searching and streaming

## Commands

Each command is in its own file in the `commands/` folder:

- **play.js**: Searches and adds tracks to the queue, starts playback
- **pause.js**: Pauses the current track
- **resume.js**: Resumes paused playback
- **skip.js**: Skips to the next track in queue
- **stop.js**: Stops playback and clears the queue
- **queue.js**: Displays the current queue
- **nowplaying.js**: Shows currently playing track info

## How It Works

1. User sends a command in Discord (e.g., `!play song name`)
2. `bot.js` receives the message and routes it to the appropriate command
3. The command interacts with the `MusicPlayer` instance
4. `MusicPlayer` handles:
   - Searching for tracks (YouTube/Spotify)
   - Managing the queue
   - Connecting to voice channels
   - Streaming audio
5. User receives feedback in Discord

## Adding New Commands

To add a new command:

1. Create a new file in `commands/` folder (e.g., `shuffle.js`)
2. Export an async function that takes `(message, args, player)`
3. Import it in `bot.js`
4. Add it to the `commands` object in `bot.js`

Example:
```javascript
// commands/shuffle.js
export async function shuffleCommand(message, args, player) {
  // Your command logic here
  player.queue = player.queue.sort(() => Math.random() - 0.5);
  return message.reply('Queue shuffled!');
}

// In bot.js
import { shuffleCommand } from './commands/shuffle.js';
const commands = {
  // ... other commands
  shuffle: shuffleCommand
};
```

## Environment Variables

The bot uses these environment variables (configured in `.env`):

- `DISCORD_TOKEN`: Your Discord bot token (required)
- `SPOTIFY_CLIENT_ID`: Spotify API client ID (optional)
- `SPOTIFY_CLIENT_SECRET`: Spotify API client secret (optional)

## Dependencies

Key dependencies and their purposes:

- **discord.js**: Discord API wrapper
- **@discordjs/voice**: Voice connection handling
- **opusscript**: Audio encoding
- **play-dl**: YouTube streaming and searching
- **spotify-web-api-node**: Spotify API integration
- **libsodium-wrappers**: Voice encryption
- **dotenv**: Environment variable management

## Music Flow

```
User Command
    ↓
bot.js (routes to command)
    ↓
Command Handler
    ↓
MusicPlayer.addToQueue()
    ↓
Search YouTube/Spotify
    ↓
Add to Queue
    ↓
MusicPlayer.playNext()
    ↓
Stream Audio
    ↓
Play in Voice Channel
```
