import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import play from 'play-dl';
import SpotifyWebApi from 'spotify-web-api-node';
import { config } from './config.js';

// ── Initialize play-dl ────────────────────────────────────────────────────────
try {
  const tokenConfig = {};

  if (config.ytCookie) {
    tokenConfig.youtube = { cookie: config.ytCookie };
    console.log('✅ YouTube cookies loaded');
  }

  try {
    const scId = await play.getFreeClientID();
    tokenConfig.soundcloud = { client_id: scId };
  } catch {}

  if (Object.keys(tokenConfig).length > 0) {
    await play.setToken(tokenConfig);
  }
  console.log('✅ play-dl initialized');
} catch (e) {
  console.warn('⚠️ play-dl init warning:', e.message);
}

// ── Spotify ───────────────────────────────────────────────────────────────────
let spotifyApi = null;
if (config.spotify.clientId && config.spotify.clientSecret) {
  spotifyApi = new SpotifyWebApi({
    clientId: config.spotify.clientId,
    clientSecret: config.spotify.clientSecret,
  });
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body.access_token);
    setInterval(async () => {
      try {
        const d = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(d.body.access_token);
      } catch {}
    }, (data.body.expires_in - 60) * 1000);
    console.log('✅ Spotify connected');
  } catch (e) {
    console.warn('⚠️ Spotify failed:', e.message);
    spotifyApi = null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDur(s) {
  if (!s) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`
    : `${m}:${sec.toString().padStart(2,'0')}`;
}

async function ytSearch(query) {
  // Method 1: play-dl
  try {
    const res = await play.search(query, { limit: 5, source: { youtube: 'video' } });
    const valid = res.find(r => r.url && r.durationInSec > 0 && !r.live);
    if (valid) return { url: valid.url, title: valid.title, duration: fmtDur(valid.durationInSec), thumbnail: valid.thumbnails?.[0]?.url };
  } catch (e) { console.warn('play-dl search failed:', e.message); }

  // Method 2: youtube-sr
  try {
    const YT = (await import('youtube-sr')).default;
    const res = await YT.search(query, { limit: 3, type: 'video' });
    const valid = res.find(r => r.url && r.duration > 0);
    if (valid) return { url: valid.url, title: valid.title, duration: fmtDur(Math.floor(valid.duration / 1000)), thumbnail: valid.thumbnail?.url };
  } catch (e) { console.warn('youtube-sr failed:', e.message); }

  return null;
}

async function createStream(url) {
  // Method 1: play-dl quality 2
  try {
    const s = await play.stream(url, { discordPlayerCompatibility: true, quality: 2 });
    console.log('✅ Stream via play-dl q2');
    return { stream: s.stream, type: s.type };
  } catch (e) { console.warn('play-dl q2 failed:', e.message); }

  // Method 2: play-dl quality 0
  try {
    const s = await play.stream(url, { discordPlayerCompatibility: true, quality: 0 });
    console.log('✅ Stream via play-dl q0');
    return { stream: s.stream, type: s.type };
  } catch (e) { console.warn('play-dl q0 failed:', e.message); }

  // Method 3: miniget direct
  try {
    const info = await play.video_info(url);
    const formats = (info.format || []).filter(f => f.mimeType?.includes('audio') && f.url);
    for (const fmt of formats) {
      try {
        const miniget = (await import('miniget')).default;
        const stream = miniget(fmt.url, { maxRedirects: 10 });
        console.log('✅ Stream via miniget');
        return { stream, type: 'arbitrary' };
      } catch {}
    }
  } catch (e) { console.warn('miniget failed:', e.message); }

  throw new Error('All stream methods failed');
}

// ── MusicPlayer ───────────────────────────────────────────────────────────────
export class MusicPlayer {
  constructor(client, guildId) {
    this.client = client;
    this.guildId = guildId;
    this.queue = [];
    this.currentTrack = null;
    this.currentIndex = 0;
    this.voiceConnection = null;
    this.audioPlayer = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    this.isPlaying = false;
    this.isPaused = false;
    this.loopMode = 'none';
    this.volume = 100;
    this.autoplay = false;
    this.is247 = false;
    this.djRoleId = config.djRoleId || null;
    this.textChannel = null;
    this.idleTimer = null;
    this.playlistInfo = null;
    this.failedTracks = [];
    this._resource = null;

    this.audioPlayer.on(AudioPlayerStatus.Idle, (old) => {
      if (old.status !== AudioPlayerStatus.Idle) this._onTrackEnd();
    });
    this.audioPlayer.on('error', (err) => {
      console.error('[Audio Error]', err.message);
      this._onTrackEnd(true);
    });
  }

  async _onTrackEnd(isError = false) {
    if (this.loopMode === 'song' && !isError) return this.playNext();
    this.currentIndex++;
    if (this.currentIndex < this.queue.length) {
      this.currentTrack = this.queue[this.currentIndex];
      return this.playNext();
    }
    if (this.loopMode === 'queue' && this.queue.length > 0) {
      this.currentIndex = 0;
      this.currentTrack = this.queue[0];
      return this.playNext();
    }
    if (this.autoplay && this.currentTrack) return this._doAutoplay();
    this.currentTrack = null;
    this.isPlaying = false;
    this._startIdleTimer();
  }

  async _doAutoplay() {
    try {
      const q = `${this.currentTrack?.artist || ''} ${this.currentTrack?.originalTitle || this.currentTrack?.title || 'pop'} mix`;
      const t = await ytSearch(q);
      if (t && !this.queue.some(x => x.url === t.url)) {
        t.requestedBy = { toString: () => '🤖 Autoplay' };
        this.queue.push(t);
        this.currentIndex = this.queue.length - 1;
        this.currentTrack = t;
        await this.playNext();
        this.textChannel?.send(`🤖 **Autoplay:** **${t.title}**`).catch(() => {});
        return;
      }
    } catch {}
    this.isPlaying = false;
    this._startIdleTimer();
  }

  _startIdleTimer() {
    // Always stay in VC if 24/7 is on
    if (this.is247) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.isPlaying && this.voiceConnection) {
        this.textChannel?.send('👋 Left voice channel due to inactivity. Use `/247` to keep me here forever!').catch(() => {});
        this.voiceConnection.destroy();
        this.voiceConnection = null;
      }
    }, 5 * 60 * 1000);
  }

  _clearIdleTimer() {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  async connect(vc) {
    if (this.voiceConnection) {
      const s = this.voiceConnection.state?.status;
      if (s && s !== VoiceConnectionStatus.Destroyed) return this.voiceConnection;
    }
    this.voiceConnection = joinVoiceChannel({
      channelId: vc.id,
      guildId: vc.guild.id,
      adapterCreator: vc.guild.voiceAdapterCreator,
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
    const tracks = await this._search(query);
    if (!tracks?.length) throw new Error('No results found for that query.');
    const added = tracks.map(t => ({ ...t, requestedBy: user }));
    this.queue.push(...added);
    return added;
  }

  async _search(query) {
    if (query.includes('spotify.com/playlist/')) return this._spotifyPlaylist(query);
    if (query.includes('spotify.com/track/'))    return this._spotifyTrack(query);
    if (query.includes('spotify.com/album/'))    return this._spotifyAlbum(query);
    if (query.includes('youtube.com/') || query.includes('youtu.be/')) return this._ytTrack(query);
    const t = await ytSearch(query);
    return t ? [t] : [];
  }

  async _ytTrack(url) {
    try {
      const info = await play.video_info(url);
      return [{
        url: info.video_details.url,
        title: info.video_details.title,
        duration: fmtDur(info.video_details.durationInSec),
        thumbnail: info.video_details.thumbnails?.[0]?.url
      }];
    } catch { return []; }
  }

  async _spotifyPlaylist(url) {
    if (!spotifyApi) throw new Error('Spotify not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env');
    const id = url.match(/playlist\/([a-zA-Z0-9]+)/)?.[1];
    const pl = await spotifyApi.getPlaylist(id);
    this.playlistInfo = { name: pl.body.name, image: pl.body.images?.[0]?.url };
    const tracks = [];
    for (const item of pl.body.tracks.items) {
      if (!item.track) continue;
      const { name, artists, album } = item.track;
      const artist = artists[0]?.name || '';
      const yt = await ytSearch(`${name} ${artist}`);
      if (yt) tracks.push({ ...yt, originalTitle: name, artist, title: `${name} - ${artist}`, spotifyThumbnail: album.images?.[0]?.url });
      else this.failedTracks.push(`${name} - ${artist}`);
    }
    return tracks;
  }

  async _spotifyTrack(url) {
    if (!spotifyApi) throw new Error('Spotify not configured.');
    const id = url.match(/track\/([a-zA-Z0-9]+)/)?.[1];
    const t = await spotifyApi.getTrack(id);
    const yt = await ytSearch(`${t.body.name} ${t.body.artists[0].name}`);
    if (!yt) throw new Error('Could not find this track on YouTube.');
    return [{ ...yt, originalTitle: t.body.name, artist: t.body.artists[0].name }];
  }

  async _spotifyAlbum(url) {
    if (!spotifyApi) throw new Error('Spotify not configured.');
    const id = url.match(/album\/([a-zA-Z0-9]+)/)?.[1];
    const album = await spotifyApi.getAlbum(id);
    const tracks = [];
    for (const item of album.body.tracks.items) {
      const yt = await ytSearch(`${item.name} ${item.artists[0].name}`);
      if (yt) tracks.push({ ...yt, originalTitle: item.name, artist: item.artists[0].name });
    }
    return tracks;
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
    console.log(`▶️ Playing: ${this.currentTrack.title}`);
    try {
      const { stream, type } = await createStream(this.currentTrack.url);
      const resource = createAudioResource(stream, { inputType: type, inlineVolume: true });
      resource.volume?.setVolumeLogarithmic(this.volume / 100);
      this._resource = resource;
      this.audioPlayer.play(resource);
    } catch (err) {
      console.error(`❌ Stream failed: ${err.message}`);
      this.textChannel?.send(`❌ Could not play **${this.currentTrack.title}** — skipping...`).catch(() => {});
      await this._onTrackEnd(true);
    }
  }

  pause()  { if (this.isPlaying && !this.isPaused)  { this.audioPlayer.pause();   this.isPaused = true;  return true; } return false; }
  resume() { if (this.isPaused)                      { this.audioPlayer.unpause(); this.isPaused = false; return true; } return false; }

  skip() {
    if (!this.currentTrack) return false;
    const prev = this.loopMode;
    if (this.loopMode === 'song') this.loopMode = 'none';
    this.audioPlayer.stop();
    setTimeout(() => { if (prev !== 'song') this.loopMode = prev; }, 300);
    return true;
  }

  stop() {
    this.queue = []; this.currentTrack = null; this.currentIndex = 0;
    this.isPlaying = false; this.isPaused = false; this.loopMode = 'none';
    this.audioPlayer.stop(true);
    if (this.voiceConnection) { this.voiceConnection.destroy(); this.voiceConnection = null; }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(200, vol));
    this._resource?.volume?.setVolumeLogarithmic(this.volume / 100);
    return this.volume;
  }

  setLoop(mode) {
    if (!['none', 'song', 'queue'].includes(mode)) return false;
    this.loopMode = mode; return true;
  }

  shuffle() {
    if (this.queue.length < 2) return false;
    const cur = this.queue[this.currentIndex];
    const rest = this.queue.slice(this.currentIndex + 1);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.queue = [...this.queue.slice(0, this.currentIndex), cur, ...rest];
    return true;
  }

  removeTrack(n) {
    const i = n - 1;
    if (i < 0 || i >= this.queue.length || i === this.currentIndex) return null;
    const removed = this.queue.splice(i, 1)[0];
    if (i < this.currentIndex) this.currentIndex--;
    return removed;
  }

  seek(seconds) {
    if (!this.currentTrack) return false;
    play.stream(this.currentTrack.url, { seek: seconds, discordPlayerCompatibility: true })
      .then(s => {
        const resource = createAudioResource(s.stream, { inputType: s.type, inlineVolume: true });
        resource.volume?.setVolumeLogarithmic(this.volume / 100);
        this._resource = resource;
        this.audioPlayer.play(resource);
      }).catch(e => console.error('Seek error:', e.message));
    return true;
  }

  isDJ(member) {
    if (!this.djRoleId) return true;
    return member.roles.cache.has(this.djRoleId) || member.permissions.has('Administrator');
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
      is247: this.is247,
    };
  }
}
