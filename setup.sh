#!/bin/bash
# Music Bot PRO - Oracle VPS Setup Script
# Run this once on your fresh Ubuntu server

echo "🚀 Setting up Music Bot PRO..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install FFmpeg (required for audio)
sudo apt install -y ffmpeg

# Install PM2 globally (keeps bot running 24/7)
sudo npm install -g pm2

# Install dependencies
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "Now do:"
echo "  1. cp .env.example .env"
echo "  2. nano .env   (paste your Discord token)"
echo "  3. npm start   (test it works)"
echo "  4. pm2 start ecosystem.config.cjs"
echo "  5. pm2 save && pm2 startup"
echo ""
echo "Your bot will now run 24/7 forever!"
