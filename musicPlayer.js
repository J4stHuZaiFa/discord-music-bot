import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior
} from '@discordjs/voice';
import play from 'play-dl';
import SpotifyWebApi from 'spotify-web-api-node';
import { config } from './config.js';

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
    }, (data.body.expires_in - 60) * 1000);
    console.log('✅ Spotify connected');
  } catch (e) {
    console.warn('⚠️ Spotify auth failed:', e.message);
    spotifyApi = null;
  }
}

export const FILTERS = {
  nightcore: 'aresample=48000,asetrate=48000*1.25',
  vaporwave: 'aresample=48000,asetrate=48000*0.8',
  bassboost: 'bass=g=20',
  '8d': 'apulsator=hz=0.08',
  echo: 'aecho=0.8:0.88:60:0.4',
  karaoke: 'pan=stereo|c0=c0|c1=c1',
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
    this.audioPlayer = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
    });
    this.isPlaying = false;
    this.isPaused = false;
    this.loopMode = 'none';
    this.volume = 100;
    this.currentFilter = null;
    this.autoplay = false;
    this.is247 = false;
    this.djRoleId = config.dj?.roleId || null;
    this.textChannel = null;
    this.idleTimer = null;
    this.playlistInfo = null;
    this.failedTracks = [];
    this._currentResource = null;

    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      if (this.isPlaying) this._onTrackEnd();
    });

    this.audioPlayer.on('error', (err) => {
      console.error('[Audio Error]', err.message);
      this._onTrackEnd(true);
    });
  }

  async _onTrackEnd(isError = false) {
    if (this.loopMode === 'song' && !isError) {
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
      await this._autoplayNext();
    } else {
      this.currentTrack = null;
      this.isPlaying = false;
      this._startIdleTimer();
    }
  }

  _startIdleTimer() {
    if (this.is247) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.isPlaying && this.voiceConnection) {
        this.textChannel?.send('👋 Left voice channel due to inactivity.').catch(() => {});
        this.voiceConnection.destroy();
        this.voiceConnection = null;
      }
    }, 5 * 60 * 1000);
  }

  _clearIdleTimer() {
    clearTimeout(this.idleTimer);
  }

  async _autoplayNext() {
    try {
      const q = `${this.currentTrack?.artist || ''} ${this.currentTrack?.originalTitle || this.currentTrack?.title || 'pop music'} mix`;
      const results = await play.search(q, { limit: 5 });
      const pick = results.find(r => !this.queue.find(t => t.url === r.url));
      if (pick) {
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
        this.textChannel?.send(`🤖 Autoplay: **${track.title}**`).catch(() => {});
      } else {
        this.isPlaying = false;
        this._startIdleTimer();
      }
    } catch {
      this.isPlaying = false;
      this._startIdleTimer();
    }
  }

  async connect(voiceChannel) {
    if (this.voiceConnection) {
      const state = this.voiceConnection.state.status;
      if (state !== VoiceConnectionStatus.Destroyed) return this.voiceConnection;
    }

    this.voiceConnection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.voiceConnection, VoiceConnectionStatus.Signalling, 5000),
          entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        this.voiceConnection.destroy();
        this.voiceConnection = null;
      }
    });

    this.voiceConnection.subscribe(this.audioPlayer);
    return this.voiceConnection;
  }

  async addToQueue(query, user) {
    const tracks = await this.searchTracks(query);
    if (!tracks?.length) throw new Error('No tracks found');
    const added = tracks.map(t => ({ ...t, requestedBy: user }));
    this.queue.push(...added);
    return added;
  }

  async searchTracks(query) {
    if (query.includes('spotify.com/playlist/')) return this.getSpotifyPlaylist(query);
    if (query.includes('spotify.com/track/')) return this.getSpotifyTrack(query);
    if (query.includes('spotify.com/album/')) return this.getSpotifyAlbum(query);
    if (query.includes('youtube.com/playlist')) return this.getYouTubePlaylist(query);
    if (query.includes('youtube.com/') || query.includes('youtu.be/')) return this.getYouTubeTrack(query);
    return this.searchYouTube(query);
  }

  async getYouTubePlaylist(url) {
    const pl = await play.playlist_info(url, { incomplete: true });
    const videos = await pl.all_videos();
    return videos.map(v => ({ url: v.url, title: v.title, duration: this.formatDuration(v.durationInSec), thumbnail: v.thumbnails?.[0]?.url }));
  }

  async getYouTubeTrack(url) {
    const info = await play.video_info(url);
    return [{ url: info.video_details.url, title: info.video_details.title, duration: this.formatDuration(info.video_details.durationInSec), thumbnail: info.video_details.thumbnails?.[0]?.url }];
  }

  async searchYouTube(query) {
    const results = await play.search(query, { limit: 1 });
    if (!results.length) return [];
    return [{ url: results[0].url, title: results[0].title, duration: this.formatDuration(results[0].durationInSec), thumbnail: results[0].thumbnails?.[0]?.url }];
  }

  async getSpotifyPlaylist(url) {
    if (!spotifyApi) throw new Error('Spotify not configured');
    const id = url.match(/playlist\/([a-zA-Z0-9]+)/)?.[1];
    const pl = await spotifyApi.getPlaylist(id);
    this.playlistInfo = { name: pl.body.name, image: pl.body.images?.[0]?.url, owner: pl.body.owner?.display_name, total: pl.body.tracks.total };
    const tracks = [];
    for (const item of pl.body.tracks.items) {
      if (!item.track) continue;
      const { name, artists, album } = item.track;
      const artist = artists[0]?.name || '';
      const yt = await this._findOnYT(`${name} ${artist}`);
      if (yt) tracks.push({ ...yt, originalTitle: name, artist, spotifyThumbnail: album.images?.[0]?.url, title: `${name} - ${artist}` });
      else this.failedTracks.push(`${name} - ${artist}`);
    }
    return tracks;
  }

  async getSpotifyTrack(url) {
    if (!spotifyApi) throw new Error('Spotify not configured');
    const id = url.match(/track\/([a-zA-Z0-9]+)/)?.[1];
    const t = await spotifyApi.getTrack(id);
    return this.searchYouTube(`${t.body.name} ${t.body.artists[0].name}`);
  }

  async getSpotifyAlbum(url) {
    if (!spotifyApi) throw new Error('Spotify not configured');
    const id = url.match(/album\/([a-zA-Z0-9]+)/)?.[1];
    const album = await spotifyApi.getAlbum(id);
    const tracks = [];
    for (const item of album.body.tracks.items) {
      const yt = await this._findOnYT(`${item.name} ${item.artists[0].name}`);
      if (yt) tracks.push({ ...yt, originalTitle: item.name, artist: item.artists[0].name });
    }
    return tracks;
  }

  async _findOnYT(query) {
    try {
      const res = await play.search(query, { limit: 1 });
      if (!res.length) return null;
      return { url: res[0].url, title: res[0].title, duration: this.formatDuration(res[0].durationInSec), thumbnail: res[0].thumbnails?.[0]?.url };
    } catch { return null; }
  }

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
      console.log(`[Playing] ${this.currentTrack.title}`);
      
      const stream = await play.stream(this.currentTrack.url, {
        discordPlayerCompatibility: true
      });

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        inlineVolume: true,
      });

      resource.volume?.setVolumeLogarithmic(this.volume / 100);
      this._currentResource = resource;
      this.audioPlayer.play(resource);
      console.log(`[Stream started] ${this.currentTrack.title}`);
    } catch (err) {
      console.error(`[Play Error] ${err.message}`);
      await this._onTrackEnd(true);
    }
  }

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
    if (!this.currentTrack) return false;
    const prev = this.loopMode;
    if (this.loopMode === 'song') this.loopMode = 'none';
    this.audioPlayer.stop();
    setTimeout(() => { this.loopMode = prev === 'song' ? 'none' : prev; }, 200);
    return true;
  }

  stop() {
    this.queue = [];
    this.currentTrack = null;
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.loopMode = 'none';
    this.audioPlayer.stop(true);
    if (this.voiceConnection) {
      this.voiceConnection.destroy();
      this.voiceConnection = null;
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(200, vol));
    this._currentResource?.volume?.setVolumeLogarithmic(this.volume / 100);
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
    const rest = this.queue.slice(this.currentIndex + 1);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.queue = [...this.queue.slice(0, this.currentIndex), current, ...rest];
    return true;
  }

  removeTrack(index) {
    const real = index - 1;
    if (real < 0 || real >= this.queue.length || real === this.currentIndex) return null;
    const removed = this.queue.splice(real, 1)[0];
    if (real < this.currentIndex) this.currentIndex--;
    return removed;
  }

  seek(seconds) {
    if (!this.currentTrack) return false;
    this._playWithSeek(this.currentTrack, seconds);
    return true;
  }

  async _playWithSeek(track, seconds) {
    try {
      const stream = await play.stream(track.url, { seek: seconds, discordPlayerCompatibility: true });
      const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
      resource.volume?.setVolumeLogarithmic(this.volume / 100);
      this._currentResource = resource;
      this.audioPlayer.play(resource);
    } catch (err) {
      console.error('Seek error:', err.message);
    }
  }

  isDJ(member) {
    if (!this.djRoleId) return true;
    return member.roles.cache.has(this.djRoleId) || member.permissions.has('Administrator');
  }

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
