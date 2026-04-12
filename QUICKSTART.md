# Quick Start Guide

## Step 1: Get Your Discord Bot Token

1. Visit https://discord.com/developers/applications
2. Click "New Application" and name it
3. Go to "Bot" tab and click "Add Bot"
4. Enable these intents:
   - Message Content Intent
   - Server Members Intent
5. Click "Reset Token" and copy it

## Step 2: Invite Your Bot

1. Go to "OAuth2" > "URL Generator"
2. Select scope: `bot`
3. Select permissions: Send Messages, Read Messages, Connect, Speak
4. Copy and open the URL to invite your bot

## Step 3: Set Up Your Bot

1. Create a `.env` file:
```bash
cp .env.example .env
```

2. Edit `.env` and paste your Discord token:
```
DISCORD_TOKEN=paste_your_token_here
```

3. Install dependencies:
```bash
npm install
```

4. Start the bot:
```bash
npm start
```

## Step 4: Use in Group Calls

1. Create a group DM with friends
2. Start a voice call
3. Type `!play <song name>` in the chat

## Basic Commands

- `!play <song>` - Play music from YouTube
- `!pause` - Pause
- `!resume` - Resume
- `!skip` - Next song
- `!stop` - Stop and clear queue
- `!queue` - Show queue

## Examples

```
!play never gonna give you up
!play https://www.youtube.com/watch?v=dQw4w9WgXcQ
!play lofi hip hop
```

## Adding Spotify Support (Optional)

1. Go to https://developer.spotify.com/dashboard
2. Create an app
3. Copy Client ID and Client Secret
4. Add to `.env`:
```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```
5. Restart bot

Now you can use:
```
!play https://open.spotify.com/playlist/...
!play https://open.spotify.com/track/...
```

## Need Help?

Check the full README.md for detailed troubleshooting!
