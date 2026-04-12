import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType
} from '@discordjs/voice';
import play from 'play-dl';
import SpotifyWebApi from 'spotify-web-api-node';
import { config } from './config.js';

// Init SoundCloud
await play.getFreeClientID().then((clientID) =>
  play.setToken({ soundcloud: { client_id: clientID } })
);

// Init Spotify
let spotifyApi = null;
if (config.spotify.clientId && config.spotify.clientSecret) {
  spotifyApi = new SpotifyWebApi({
    clientId: config.spotify.clientId,
    clientSecret: config.spotify.clientSecret
  });
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body.access_token);
    setInterval(async () => {
      const d = await spotifyApi.clientCredentialsGrant();
      spotifyApi.setAccessToken(d.body.access_token);
    }, data.body.expires_in * 1000 - 60000);
    console.log('✅ Spotify API connected');
  } catch (e) {
    console.error('❌ Spotify auth failed:', e.message);
    spotifyApi = null;
  }
}

// Audio filters (FFmpeg args)
export const FILTERS = {
  nightcore: 'aresample=48000,asetrate=48000*1.25',
  vaporwave: 'aresample=48000,asetrate=48000*0.8',
  bassboost: 'bass=g=20',
  '8d': 'apulsator=hz=0.08',
  echo: 'aecho=0.8:0.88:60:0.4',
  karaoke: 'pan=stereo|c0=c0|c1=c1,stereo,extrastereo=m=2.5:c=0',
  treble: 'treble=g=5',
  loud: 'volume=4.0',
  none: null
};

export class MusicPlayer {
  constructor(client, guildId) {
    this.client = client;
    this.guildId = guildId;
    this.queue = [];
    this.currentTrack = null;
    this.currentIndex = 0;
    this.voiceConnection = null;
    this.audioPlayer = createAudioPlayer();
    this.isPlaying = false;
    this.isPaused = false;
    this.playlistInfo = null;
    this.failedTracks = [];

    // PRO features state
    this.loopMode = 'none';     // 'none' | 'song' | 'queue'
    this.volume = 100;          // 0-200
    this.currentFilter = 'none';
    this.autoplay = false;
    this.is247 = false;         // stay in voice even when idle
    this.djRoleId = config.dj.roleId;
    this.textChannel = null;    // for auto-disconnect messages
    this.idleTimer = null;

    // Bind audio player events
    this.audioPlayer.on('stateChange', (oldState, newState) => {
      if (
        newState.status === AudioPlayerStatus.Idle &&
        oldState.status !== AudioPlayerStatus.Idle
      ) {
        this._onTrackEnd();
      }
    });

    this.audioPlayer.on('error', (error) => {
      console.error(`[Player Error] ${error.message}`);
      this._onTrackEnd(true);
    });
  }

  // ─── Internal: called when a track finishes ────────────────────────────────
  async _onTrackEnd(isError = false) {
    if (this.loopMode === 'song' && !isError) {
      // Replay same track
      await this.playNext();
      return;
    }

    this.currentIndex++;

    if (this.currentIndex < this.queue.length) {
      this.currentTrack = this.queue[this.currentIndex];
      await this.playNext();
    } else if (this.loopMode === 'queue' && this.queue.length > 0) {
      this.currentIndex = 0;
      this.currentTrack = this.queue[0];
      await this.playNext();
    } else if (this.autoplay && this.currentTrack) {
      // Autoplay: search a related track
      await this._autoplayNext();
    } else {
      this.currentTrack = null;
      this.isPlaying = false;
      this._startIdleTimer();
    }
  }

  // ─── Auto-disconnect timer ─────────────────────────────────────────────────
  _startIdleTimer() {
    if (this.is247) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.isPlaying && this.voiceConnection) {
        this.textChannel?.send('👋 Disconnected due to inactivity.').catch(() => {});
        this.voiceConnection.destroy();
        this.voiceConnection = null;
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  _clearIdleTimer() {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  // ─── Autoplay ─────────────────────────────────────────────────────────────
  async _autoplayNext() {
    try {
      const last = this.currentTrack;
      const searchQ = last?.artist
        ? `${last.artist} mix similar`
        : last?.title
        ? `${last.title} similar songs`
        : 'trending music';
      const results = await play.search(searchQ, { limit: 5 });
      const candidates = results.filter(
        (r) => !this.queue.find((q) => q.url === r.url)
      );
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const track = {
          url: pick.url,
          title: pick.title,
          duration: this.formatDuration(pick.durationInSec),
          thumbnail: pick.thumbnails?.[0]?.url,
          requestedBy: { tag: 'Autoplay 🤖' }
        };
        this.queue.push(track);
        this.currentIndex = this.queue.length - 1;
        this.currentTrack = track;
        await this.playNext();
        this.textChannel?.send(`🤖 **Autoplay:** Now playing **${track.title}**`).catch(() => {});
      } else {
        this.isPlaying = false;
        this._startIdleTimer();
      }
    } catch {
      this.isPlaying = false;
      this._startIdleTimer();
    }
  }

  // ─── Connect ──────────────────────────────────────────────────────────────
  async connect(voiceChannel) {
    if (this.voiceConnection) {
      try { this.voiceConnection.joinConfig; } catch { this.voiceConnection = null; }
    }
    if (!this.voiceConnection) {
      this.voiceConnection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true
      });

      this.voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(this.voiceConnection, VoiceConnectionStatus.Signalling, 5000),
            entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5000)
          ]);
        } catch {
          this.voiceConnection.destroy();
          this.voiceConnection = null;
        }
      });

      this.voiceConnection.subscribe(this.audioPlayer);
    }
    return this.voiceConnection;
  }

  // ─── Search & Queue ───────────────────────────────────────────────────────
  async addToQueue(query, user) {
    const tracks = await this.searchTracks(query);
    if (!tracks || tracks.length === 0) throw new Error('No tracks found');
    const added = tracks.map((t) => ({ ...t, requestedBy: user }));
    this.queue.push(...added);
    return added;
  }

  async searchTracks(query) {
    if (query.includes('spotify.com/playlist/')) return this.getSpotifyPlaylist(query);
    if (query.includes('spotify.com/track/')) return this.getSpotifyTrack(query);
    if (query.includes('spotify.com/album/')) return this.getSpotifyAlbum(query);
    if (query.includes('youtube.com/') || query.includes('youtu.be/')) return this.getYouTubeTrack(query);
    if (query.includes('youtube.com/playlist')) return this.getYouTubePlaylist(query);
    return this.searchYouTube(query);
  }

  async getYouTubePlaylist(url) {
    const playlist = await play.playlist_info(url, { incomplete: true });
    const videos = await playlist.all_videos();
    return videos.map((v) => ({
      url: v.url,
      title: v.title,
      duration: this.formatDuration(v.durationInSec),
      thumbnail: v.thumbnails?.[0]?.url
    }));
  }

  async getYouTubeTrack(url) {
    const info = await play.video_info(url);
    return [{
      url: info.video_details.url,
      title: info.video_details.title,
      duration: this.formatDuration(info.video_details.durationInSec),
      thumbnail: info.video_details.thumbnails?.[0]?.url
    }];
  }

  async searchYouTube(query) {
    const results = await play.search(query, { limit: 1 });
    if (!results.length) return [];
    return [{
      url: results[0].url,
      title: results[0].title,
      duration: this.formatDuration(results[0].durationInSec),
      thumbnail: results[0].thumbnails?.[0]?.url
    }];
  }

  async getSpotifyPlaylist(url) {
    if (!spotifyApi) throw new Error('Spotify not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env');
    const id = url.match(/playlist\/([a-zA-Z0-9]+)/)?.[1];
    if (!id) throw new Error('Invalid Spotify playlist URL');
    const playlist = await spotifyApi.getPlaylist(id);
    this.playlistInfo = {
      name: playlist.body.name,
      image: playlist.body.images?.[0]?.url,
      owner: playlist.body.owner?.display_name,
      total: playlist.body.tracks.total
    };
    const tracks = [];
    for (const item of playlist.body.tracks.items) {
      if (!item.track) continue;
      const { name, artists, album } = item.track;
      const artistName = artists[0]?.name || 'Unknown';
      const yt = await this._findOnYouTube(`${name} ${artistName}`);
      if (yt) tracks.push({ ...yt, title: `${name} - ${artistName}`, originalTitle: name, artist: artistName, spotifyThumbnail: album.images?.[0]?.url });
      else this.failedTracks.push(`${name} - ${artistName}`);
    }
    return tracks;
  }

  async getSpotifyTrack(url) {
    if (!spotifyApi) throw new Error('Spotify not configured');
    const id = url.match(/track\/([a-zA-Z0-9]+)/)?.[1];
    const track = await spotifyApi.getTrack(id);
    return this.searchYouTube(`${track.body.name} ${track.body.artists[0].name}`);
  }

  async getSpotifyAlbum(url) {
    if (!spotifyApi) throw new Error('Spotify not configured');
    const id = url.match(/album\/([a-zA-Z0-9]+)/)?.[1];
    const album = await spotifyApi.getAlbum(id);
    const tracks = [];
    for (const item of album.body.tracks.items) {
      const q = `${item.name} ${item.artists[0].name}`;
      const yt = await this._findOnYouTube(q);
      if (yt) tracks.push({ ...yt, title: `${item.name} - ${item.artists[0].name}`, originalTitle: item.name, artist: item.artists[0].name });
    }
    return tracks;
  }

  async _findOnYouTube(query) {
    try {
      const res = await play.search(query, { limit: 1 });
      if (!res.length) return null;
      return { url: res[0].url, title: res[0].title, duration: this.formatDuration(res[0].durationInSec), thumbnail: res[0].thumbnails?.[0]?.url };
    } catch { return null; }
  }

  // ─── Playback ─────────────────────────────────────────────────────────────
  async playNext() {
    if (this.currentIndex >= this.queue.length) {
      this.currentTrack = null;
      this.isPlaying = false;
      this._startIdleTimer();
      return;
    }

    this.currentTrack = this.queue[this.currentIndex];
    this.isPlaying = true;
    this.isPaused = false;
    this._clearIdleTimer();

    try {
      const stream = await play.stream(this.currentTrack.url, {
        quality: 2,
        discordPlayerCompatibility: true
      });
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        inlineVolume: true
      });
      resource.volume?.setVolumeLogarithmic(this.volume / 100);
      this._currentResource = resource;
      this.audioPlayer.play(resource);
    } catch (err) {
      console.error('Stream error:', err.message);
      await this._onTrackEnd(true);
    }
  }

  // ─── Controls ─────────────────────────────────────────────────────────────
  pause() {
    if (this.isPlaying && !this.isPaused) {
      this.audioPlayer.pause();
      this.isPaused = true;
      return true;
    }
    return false;
  }

  resume() {
    if (this.isPaused) {
      this.audioPlayer.unpause();
      this.isPaused = false;
      return true;
    }
    return false;
  }

  skip() {
    if (this.currentTrack) {
      // Temporarily disable song loop to skip
      const prev = this.loopMode;
      if (this.loopMode === 'song') this.loopMode = 'none';
      this.audioPlayer.stop();
      if (prev === 'song') setTimeout(() => { this.loopMode = prev; }, 100);
      return true;
    }
    return false;
  }

  stop() {
    this.queue = [];
    this.currentTrack = null;
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.loopMode = 'none';
    this.autoplay = false;
    this.audioPlayer.stop(true);
    if (this.voiceConnection) {
      this.voiceConnection.destroy();
      this.voiceConnection = null;
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(200, vol));
    if (this._currentResource?.volume) {
      this._currentResource.volume.setVolumeLogarithmic(this.volume / 100);
    }
    return this.volume;
  }

  setLoop(mode) {
    if (!['none', 'song', 'queue'].includes(mode)) return false;
    this.loopMode = mode;
    return true;
  }

  shuffle() {
    if (this.queue.length < 2) return false;
    const current = this.queue[this.currentIndex];
    const remaining = this.queue.slice(this.currentIndex + 1);
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    this.queue = [...this.queue.slice(0, this.currentIndex), current, ...remaining];
    return true;
  }

  removeTrack(index) {
    // index is 1-based (as shown to user)
    const realIndex = index - 1;
    if (realIndex < 0 || realIndex >= this.queue.length) return null;
    if (realIndex === this.currentIndex) return null; // can't remove playing track
    const removed = this.queue.splice(realIndex, 1)[0];
    if (realIndex < this.currentIndex) this.currentIndex--;
    return removed;
  }

  seek(seconds) {
    // play-dl supports seek via stream options
    if (!this.currentTrack) return false;
    this._seekTo = seconds;
    this._playWithSeek(this.currentTrack, seconds);
    return true;
  }

  async _playWithSeek(track, seconds) {
    try {
      const stream = await play.stream(track.url, {
        quality: 2,
        seek: seconds,
        discordPlayerCompatibility: true
      });
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        inlineVolume: true
      });
      resource.volume?.setVolumeLogarithmic(this.volume / 100);
      this._currentResource = resource;
      this.audioPlayer.play(resource);
    } catch (err) {
      console.error('Seek error:', err.message);
    }
  }

  // ─── DJ Role Check ────────────────────────────────────────────────────────
  isDJ(member) {
    if (!this.djRoleId) return true; // no DJ role set = everyone is DJ
    return member.roles.cache.has(this.djRoleId) || member.permissions.has('Administrator');
  }

  // ─── Utils ────────────────────────────────────────────────────────────────
  formatDuration(seconds) {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  getQueue() {
    return {
      current: this.currentTrack,
      currentIndex: this.currentIndex,
      upcoming: this.queue,
      total: this.queue.length,
      loopMode: this.loopMode,
      volume: this.volume,
      autoplay: this.autoplay,
      is247: this.is247
    };
  }
}
