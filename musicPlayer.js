import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} from '@discordjs/voice';
import play from 'play-dl';
import SpotifyWebApi from 'spotify-web-api-node';
import { config } from './config.js';

await play.getFreeClientID().then((clientID) => play.setToken({
  soundcloud: {
    client_id: clientID
  }
}));

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
      const data = await spotifyApi.clientCredentialsGrant();
      spotifyApi.setAccessToken(data.body.access_token);
    }, data.body.expires_in * 1000 - 60000);
  } catch (error) {
    console.error('Failed to authenticate with Spotify:', error);
    spotifyApi = null;
  }
}

export class MusicPlayer {
  constructor(client, channelId) {
    this.client = client;
    this.channelId = channelId;
    this.queue = [];
    this.currentTrack = null;
    this.currentIndex = 0;
    this.voiceConnection = null;
    this.audioPlayer = createAudioPlayer();
    this.isPlaying = false;
    this.isPaused = false;
    this.playlistInfo = null;
    this.failedTracks = [];

    this.audioPlayer.on('stateChange', (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
        this.currentIndex++;
        if (this.currentIndex < this.queue.length) {
          this.currentTrack = this.queue[this.currentIndex];
          this.playNext();
        } else {
          this.currentTrack = null;
          this.isPlaying = false;
          this.currentIndex = 0;
        }
      }
    });

    this.audioPlayer.on('error', (error) => {
      console.error('Audio player error:', error);
      this.currentIndex++;
      if (this.currentIndex < this.queue.length) {
        this.currentTrack = this.queue[this.currentIndex];
        this.playNext();
      } else {
        this.currentTrack = null;
        this.isPlaying = false;
        this.currentIndex = 0;
      }
    });
  }

  async connect(voiceChannel) {
    if (this.voiceConnection) {
      return this.voiceConnection;
    }

    this.voiceConnection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false
    });

    this.voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.voiceConnection, VoiceConnectionStatus.Signalling, 5000),
          entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch (error) {
        this.voiceConnection.destroy();
        this.voiceConnection = null;
      }
    });

    this.voiceConnection.subscribe(this.audioPlayer);
    return this.voiceConnection;
  }

  async addToQueue(query, user) {
    const tracks = await this.searchTracks(query);

    if (!tracks || tracks.length === 0) {
      throw new Error('No tracks found');
    }

    const addedTracks = tracks.map(track => ({
      ...track,
      requestedBy: user
    }));

    this.queue.push(...addedTracks);
    return addedTracks;
  }

  async searchTracks(query) {
    if (query.includes('spotify.com/playlist/')) {
      return await this.getSpotifyPlaylist(query);
    } else if (query.includes('spotify.com/track/')) {
      return await this.getSpotifyTrack(query);
    } else if (query.includes('spotify.com/album/')) {
      return await this.getSpotifyAlbum(query);
    } else if (query.includes('youtube.com/') || query.includes('youtu.be/')) {
      return await this.getYouTubeTrack(query);
    } else {
      return await this.searchYouTube(query);
    }
  }

  async getSpotifyPlaylist(url) {
    if (!spotifyApi) {
      throw new Error('Spotify is not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env');
    }

    const playlistId = url.match(/playlist\/([a-zA-Z0-9]+)?/)?.[1];
    if (!playlistId) {
      throw new Error('Invalid Spotify playlist URL');
    }

    const playlist = await spotifyApi.getPlaylist(playlistId);

    this.playlistInfo = {
      name: playlist.body.name,
      image: playlist.body.images?.[0]?.url,
      owner: playlist.body.owner?.display_name,
      total: playlist.body.tracks.total
    };

    const tracks = [];
    let foundCount = 0;

    for (const item of playlist.body.tracks.items) {
      if (item.track) {
        const trackName = item.track.name;
        const artistName = item.track.artists[0]?.name || 'Unknown Artist';
        const thumbnail = item.track.album.images?.[0]?.url;

        const searchQuery = `${trackName} ${artistName}`;
        const ytResults = await this.findTrackWithFallback(searchQuery, trackName, artistName);

        if (ytResults) {
          tracks.push({
            ...ytResults,
            title: `${trackName} - ${artistName}`,
            originalTitle: trackName,
            artist: artistName,
            spotifyThumbnail: thumbnail
          });
          foundCount++;
        } else {
          this.failedTracks.push(searchQuery);
        }
      }
    }

    return tracks;
  }

  async getSpotifyTrack(url) {
    if (!spotifyApi) {
      throw new Error('Spotify is not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env');
    }

    const trackId = url.match(/track\/([a-zA-Z0-9]+)/)?.[1];
    if (!trackId) {
      throw new Error('Invalid Spotify track URL');
    }

    const track = await spotifyApi.getTrack(trackId);
    const searchQuery = `${track.body.name} ${track.body.artists[0].name}`;
    return await this.searchYouTube(searchQuery);
  }

  async getSpotifyAlbum(url) {
    if (!spotifyApi) {
      throw new Error('Spotify is not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env');
    }

    const albumId = url.match(/album\/([a-zA-Z0-9]+)/)?.[1];
    if (!albumId) {
      throw new Error('Invalid Spotify album URL');
    }

    const album = await spotifyApi.getAlbum(albumId);
    const tracks = [];

    for (const item of album.body.tracks.items) {
      const searchQuery = `${item.name} ${item.artists[0].name}`;
      const ytResults = await this.searchYouTube(searchQuery);
      if (ytResults.length > 0) {
        tracks.push({
          ...ytResults[0],
          title: `${item.name} - ${item.artists[0].name}`
        });
      }
    }

    return tracks;
  }

  async getYouTubeTrack(url) {
    const info = await play.video_info(url);
    return [{
      url: info.video_details.url,
      title: info.video_details.title,
      duration: this.formatDuration(info.video_details.durationInSec),
      thumbnail: info.video_details.thumbnails[0].url
    }];
  }

  async searchYouTube(query) {
    const results = await play.search(query, { limit: 1 });

    if (results.length === 0) {
      return [];
    }

    return [{
      url: results[0].url,
      title: results[0].title,
      duration: this.formatDuration(results[0].durationInSec),
      thumbnail: results[0].thumbnails[0].url
    }];
  }

  async findTrackWithFallback(fullQuery, trackName, artistName) {
    try {
      const results = await play.search(fullQuery, { limit: 3 });
      if (results.length > 0) {
        return {
          url: results[0].url,
          title: results[0].title,
          duration: this.formatDuration(results[0].durationInSec),
          thumbnail: results[0].thumbnails[0].url
        };
      }
    } catch (error) {
      console.log(`Search failed for "${fullQuery}", trying alternative searches...`);
    }

    try {
      const artistSearch = await play.search(`${trackName} ${artistName} audio`, { limit: 3 });
      if (artistSearch.length > 0) {
        return {
          url: artistSearch[0].url,
          title: artistSearch[0].title,
          duration: this.formatDuration(artistSearch[0].durationInSec),
          thumbnail: artistSearch[0].thumbnails[0].url
        };
      }
    } catch (error) {
      console.log(`Artist search failed for "${trackName}"`);
    }

    try {
      const trackSearch = await play.search(trackName, { limit: 3 });
      if (trackSearch.length > 0) {
        return {
          url: trackSearch[0].url,
          title: trackSearch[0].title,
          duration: this.formatDuration(trackSearch[0].durationInSec),
          thumbnail: trackSearch[0].thumbnails[0].url
        };
      }
    } catch (error) {
      console.log(`Track name search failed for "${trackName}"`);
    }

    return null;
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  async playNext() {
    if (this.currentIndex >= this.queue.length) {
      this.currentTrack = null;
      this.isPlaying = false;
      return;
    }

    this.currentTrack = this.queue[this.currentIndex];
    this.isPlaying = true;
    this.isPaused = false;

    try {
      const stream = await play.stream(this.currentTrack.url);
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type
      });

      this.audioPlayer.play(resource);
    } catch (error) {
      console.error('Error playing track:', error);
      this.currentIndex++;
      if (this.currentIndex < this.queue.length) {
        this.playNext();
      } else {
        this.currentTrack = null;
        this.isPlaying = false;
        this.currentIndex = 0;
      }
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
    if (this.currentTrack) {
      this.audioPlayer.stop();
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
    this.audioPlayer.stop();

    if (this.voiceConnection) {
      this.voiceConnection.destroy();
      this.voiceConnection = null;
    }
  }

  getQueue() {
    return {
      current: this.currentTrack,
      currentIndex: this.currentIndex,
      upcoming: this.queue,
      total: this.queue.length
    };
  }
}
