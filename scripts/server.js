/**
 * StreamFlow VPS Backend Server
 * 
 * Features:
 * - Express server with static file serving
 * - Video upload with Multer
 * - FFmpeg thumbnail generation
 * - Supabase integration for metadata storage
 * - Broadcast engine with polling
 * - Audio overlay mixing
 * 
 * Run with: node --env-file=.env server.js
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import ffmpeg from 'fluent-ffmpeg';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.PORT || 3000;
const VIDEOS_DIR = path.join(__dirname, 'public', 'videos');
const THUMBNAILS_DIR = path.join(__dirname, 'public', 'thumbnails');
const RAIN_AUDIO_PATH = path.join(__dirname, 'public', 'rain.mp3');
const PLAYLIST_FILE = path.join(__dirname, 'list.txt');
const POLL_INTERVAL = 10000; // 10 seconds

// =============================================================================
// SUPABASE INITIALIZATION
// =============================================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  console.log('Please create a .env file with:');
  console.log('  SUPABASE_URL=your-project-url');
  console.log('  SUPABASE_SERVICE_KEY=your-service-role-key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =============================================================================
// DIRECTORY SETUP
// =============================================================================

// Ensure directories exist
[VIDEOS_DIR, THUMBNAILS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// =============================================================================
// EXPRESS APP SETUP
// =============================================================================

const app = express();

// Middleware
app.use(express.json());

// CORS for frontend access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Static file serving
app.use('/videos', express.static(VIDEOS_DIR));
app.use('/thumbnails', express.static(THUMBNAILS_DIR));

// =============================================================================
// MULTER CONFIGURATION (File Uploads)
// =============================================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, VIDEOS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${basename}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video files are allowed.'));
    }
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get video duration using FFprobe
 */
function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const duration = metadata.format.duration || 0;
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const seconds = Math.floor(duration % 60);

      if (hours > 0) {
        resolve(`${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      } else {
        resolve(`${minutes}:${String(seconds).padStart(2, '0')}`);
      }
    });
  });
}

/**
 * Generate thumbnail from video
 */
function generateThumbnail(videoPath, thumbnailPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['10%'], // Take screenshot at 10% of video
        filename: path.basename(thumbnailPath),
        folder: path.dirname(thumbnailPath),
        size: '320x180'
      })
      .on('end', () => {
        console.log(`📸 Thumbnail generated: ${thumbnailPath}`);
        resolve(thumbnailPath);
      })
      .on('error', (err) => {
        console.error('❌ Thumbnail generation failed:', err.message);
        reject(err);
      });
  });
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    isStreaming,
    uptime: process.uptime()
  });
});

/**
 * Upload Video Endpoint
 */
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const { filename, originalname, path: filePath, size } = req.file;
    console.log(`📤 Received upload: ${originalname}`);

    // Get video duration
    let duration = '0:00';
    try {
      duration = await getVideoDuration(filePath);
      console.log(`⏱️ Duration: ${duration}`);
    } catch (err) {
      console.error('Could not get duration:', err.message);
    }

    // Generate thumbnail
    const thumbnailFilename = filename.replace(/\.[^/.]+$/, '.jpg');
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

    try {
      await generateThumbnail(filePath, thumbnailPath);
    } catch (err) {
      console.error('Thumbnail generation failed, using placeholder');
    }

    // Insert into Supabase videos table
    const videoData = {
      filename,
      title: path.basename(originalname, path.extname(originalname)).replace(/[-_]/g, ' '),
      duration,
      size: formatFileSize(size),
      thumbnail_url: `/thumbnails/${thumbnailFilename}`,
    };

    const { data, error } = await supabase
      .from('videos')
      .insert(videoData)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase insert error:', error.message);
      return res.status(500).json({ error: 'Failed to save video metadata' });
    }

    console.log(`✅ Upload complete: ${filename}`);

    // Return the new video object
    res.json({
      id: data.id,
      filename: data.filename,
      title: data.title,
      duration: data.duration,
      size: data.size,
      thumbnail: data.thumbnail_url,
      url: `/videos/${filename}`,
      created_at: data.created_at
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Upload Audio Endpoint (for background audio/rain sounds)
 */
const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Store in public directory
      const audioDir = path.join(__dirname, 'public');
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }
      cb(null, audioDir);
    },
    filename: (req, file, cb) => {
      // Always save as rain.mp3 to replace existing
      cb(null, 'rain.mp3');
    }
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max for audio
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/x-wav', 'audio/aac'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.mp3')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

app.post('/upload-audio', audioUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const { originalname, size } = req.file;
    console.log(`🎵 Received audio upload: ${originalname}`);
    console.log(`📦 Size: ${(size / 1024 / 1024).toFixed(2)} MB`);

    // If stream is currently running, it will use the new audio on next restart
    console.log(`✅ Audio file replaced: rain.mp3`);

    res.json({
      success: true,
      filename: 'rain.mp3',
      originalName: originalname,
      size: `${(size / 1024 / 1024).toFixed(2)} MB`,
      message: 'Background audio updated. Changes will apply on stream restart.'
    });

  } catch (error) {
    console.error('❌ Audio upload error:', error);
    res.status(500).json({ error: error.message });
  }
});


/**
 * List all videos
 */
app.get('/videos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete a video
 */
app.delete('/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get video info first
    const { data: video, error: fetchError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Delete from Supabase
    const { error: deleteError } = await supabase
      .from('videos')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    // Delete files from disk
    const videoPath = path.join(VIDEOS_DIR, video.filename);
    const thumbnailPath = path.join(THUMBNAILS_DIR, video.filename.replace(/\.[^/.]+$/, '.jpg'));

    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
    }

    console.log(`🗑️ Deleted video: ${video.filename}`);
    res.json({ success: true, deleted: video.id });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get stream status
 */
app.get('/stream/status', (req, res) => {
  res.json({
    isStreaming,
    currentConfigId,
    uptime: process.uptime()
  });
});

// =============================================================================
// BROADCAST ENGINE
// =============================================================================

let ffmpegProcess = null;
let isStreaming = false;
let currentConfigId = null;
let lastConfig = null;

/**
 * Fetch stream configuration from Supabase
 */
async function getStreamConfig() {
  const { data, error } = await supabase
    .from('stream_config')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    console.error('Error fetching stream config:', error.message);
    return null;
  }

  return data;
}

/**
 * Create playlist file for FFmpeg concat
 */
function createPlaylistFile(playlist) {
  if (!Array.isArray(playlist) || playlist.length === 0) {
    console.error('❌ Playlist is empty or invalid');
    return false;
  }

  console.log('📋 Processing playlist items:', JSON.stringify(playlist, null, 2));

  const validLines = [];

  for (const item of playlist) {
    let filePath = null;

    if (typeof item === 'string') {
      // Direct string path
      filePath = item;
    } else if (item.filename) {
      // Best option: use filename directly
      filePath = path.join(VIDEOS_DIR, item.filename);
    } else if (item.url) {
      // Has url property - need to extract the filename and construct local path
      let extractedPath = item.url;

      // If it's a full HTTP URL, extract just the path part
      if (item.url.startsWith('http')) {
        try {
          const urlObj = new URL(item.url);
          extractedPath = urlObj.pathname; // Gets /videos/filename.mp4
        } catch (e) {
          console.error('❌ Invalid URL:', item.url);
          continue;
        }
      }

      // Convert /videos/filename.mp4 to local path
      if (extractedPath.startsWith('/videos/')) {
        const filename = extractedPath.replace('/videos/', '');
        filePath = path.join(VIDEOS_DIR, filename);
      } else if (extractedPath.startsWith('/')) {
        filePath = path.join(__dirname, 'public', extractedPath);
      } else {
        filePath = extractedPath;
      }
    } else if (item.path) {
      filePath = item.path;
    } else if (item.id) {
      // Try to find video by ID - look in videos directory
      console.log(`⚠️ Playlist item has only id: ${item.id}, title: ${item.title}`);
      // Skip items without a valid path
      continue;
    }

    if (!filePath) {
      console.error('❌ Could not determine file path for item:', item);
      continue;
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }

    validLines.push(`file '${filePath}'`);
    console.log(`✅ Added to playlist: ${filePath}`);
  }

  if (validLines.length === 0) {
    console.error('❌ No valid video files found in playlist');
    return false;
  }

  fs.writeFileSync(PLAYLIST_FILE, validLines.join('\n'));
  console.log(`📝 Created playlist file with ${validLines.length} items`);
  return true;
}

/**
 * Start FFmpeg stream using child_process.spawn for better control
 */
function startStream(config) {
  if (isStreaming) {
    console.log('⚠️ Stream already running');
    return;
  }

  const {
    playlist,
    rtmp_url,
    stream_key,
    bitrate,
    audio_overlay_enabled,
    audio_volume
  } = config;

  if (!playlist || !Array.isArray(playlist) || playlist.length === 0) {
    console.error('❌ No playlist items found in config');
    return;
  }

  if (!rtmp_url || !stream_key) {
    console.error('❌ Missing RTMP URL or stream key');
    return;
  }

  // Create playlist file
  if (!createPlaylistFile(playlist)) {
    console.error('❌ Failed to create playlist file');
    return;
  }

  const outputUrl = `${rtmp_url}/${stream_key}`;
  const vBitrate = bitrate || 8000;
  const audioMixWeight = audio_overlay_enabled ? (audio_volume || 35) / 100 : 0;

  console.log('🎬 Starting stream to:', rtmp_url);
  console.log('📋 Playlist items:', playlist.length);
  console.log('🔊 Audio overlay:', audio_overlay_enabled ? `${audio_volume}%` : 'disabled');

  // Build FFmpeg arguments
  let ffmpegArgs = [
    '-re',
    '-stream_loop', '-1',
    '-f', 'concat',
    '-safe', '0',
    '-i', PLAYLIST_FILE
  ];

  // Add rain audio if overlay is enabled
  const useAudioOverlay = audio_overlay_enabled && fs.existsSync(RAIN_AUDIO_PATH);

  if (useAudioOverlay) {
    ffmpegArgs.push(
      '-stream_loop', '-1',
      '-i', RAIN_AUDIO_PATH
    );

    // Add complex filter for audio mixing with normalization
    // Normalize both audio streams to stereo 44100Hz before mixing to prevent format mismatches
    const audioFilter = [
      // Normalize video audio: force to stereo 44100Hz
      '[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[audio1]',
      // Normalize rain audio: force to stereo 44100Hz
      '[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[audio2]',
      // Mix the normalized audio streams
      `[audio1][audio2]amix=inputs=2:duration=first:weights=1 ${audioMixWeight}[aout]`
    ].join(';');

    ffmpegArgs.push(
      '-filter_complex', audioFilter,
      '-map', '0:v',
      '-map', '[aout]'
    );
  } else {
    // No audio overlay - still normalize the video audio
    ffmpegArgs.push(
      '-af', 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo',
      '-map', '0:v',
      '-map', '0:a'
    );
  }

  // Add output options
  ffmpegArgs.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-b:v', `${vBitrate}k`,
    '-maxrate', `${vBitrate}k`,
    '-bufsize', `${vBitrate * 2}k`,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-r', '30',
    '-g', '60',
    '-f', 'flv',
    outputUrl
  );

  console.log('🚀 FFmpeg command: ffmpeg', ffmpegArgs.join(' '));

  // Spawn FFmpeg process
  ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`FFmpeg stdout: ${data}`);
  });

  ffmpegProcess.stderr.on('data', (data) => {
    const line = data.toString();
    if (line.includes('frame=') && line.includes('fps=')) {
      // Log progress occasionally
      if (Math.random() < 0.01) {
        console.log('📡 Streaming:', line.trim());
      }
    } else if (line.toLowerCase().includes('error')) {
      console.error('FFmpeg:', line.trim());
    }
  });

  ffmpegProcess.on('spawn', () => {
    console.log('🚀 FFmpeg process spawned');
    isStreaming = true;
  });

  ffmpegProcess.on('error', (err) => {
    console.error('❌ FFmpeg spawn error:', err.message);
    isStreaming = false;
    ffmpegProcess = null;
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`🛑 FFmpeg process exited with code ${code}`);
    isStreaming = false;
    ffmpegProcess = null;
  });
}

/**
 * Stop FFmpeg stream
 */
function stopStream() {
  if (ffmpegProcess) {
    console.log('🛑 Stopping stream...');
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
    isStreaming = false;
    console.log('✅ Stream stopped');
  }
}

/**
 * Check if config has changed significantly (excluding playlist)
 * Note: We don't restart on playlist changes - those require manual restart
 */
function configChanged(oldConfig, newConfig) {
  if (!oldConfig) return false;

  // Only restart on audio/bitrate changes, NOT playlist changes
  // Playlist changes require manual stop/start to take effect
  return (
    oldConfig.audio_volume !== newConfig.audio_volume ||
    oldConfig.audio_overlay_enabled !== newConfig.audio_overlay_enabled ||
    oldConfig.bitrate !== newConfig.bitrate
    // Removed: JSON.stringify(oldConfig.playlist) !== JSON.stringify(newConfig.playlist)
  );
}

/**
 * Poll stream configuration
 */
async function pollStreamConfig() {
  try {
    const config = await getStreamConfig();

    if (!config) {
      console.log('⚠️ No stream config found');
      if (isStreaming) {
        stopStream();
      }
      return;
    }

    currentConfigId = config.id;

    // Start stream if active and not running
    if (config.is_active && !isStreaming) {
      console.log('▶️ Stream config is active, starting stream...');
      startStream(config);
      lastConfig = config;
    }
    // Stop stream if inactive and running
    else if (!config.is_active && isStreaming) {
      console.log('⏹️ Stream config is inactive, stopping stream...');
      stopStream();
      lastConfig = null;
    }
    // Restart if settings changed while streaming
    else if (isStreaming && configChanged(lastConfig, config)) {
      console.log('🔄 Config changed, restarting stream...');
      stopStream();
      setTimeout(() => {
        startStream(config);
        lastConfig = config;
      }, 2000);
    }

  } catch (error) {
    console.error('❌ Error polling stream config:', error);
  }
}

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGINT', () => {
  console.log('\n👋 Received SIGINT, shutting down...');
  stopStream();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down...');
  stopStream();
  process.exit(0);
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 StreamFlow VPS Backend Server');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  🌐 Server:     http://localhost:${PORT}`);
  console.log(`  📁 Videos:     ${VIDEOS_DIR}`);
  console.log(`  📸 Thumbnails: ${THUMBNAILS_DIR}`);
  console.log(`  🔊 Rain Audio: ${RAIN_AUDIO_PATH}`);
  console.log('');
  console.log('  📡 Endpoints:');
  console.log(`     POST   /upload         - Upload video`);
  console.log(`     GET    /videos         - List all videos`);
  console.log(`     DELETE /videos/:id     - Delete a video`);
  console.log(`     GET    /stream/status  - Stream status`);
  console.log(`     GET    /health         - Health check`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
});

// Start polling for stream config
console.log(`⏱️ Starting stream config polling (every ${POLL_INTERVAL / 1000}s)...`);
console.log('⏳ Waiting for is_active to be true in stream_config table...\n');

// Initial poll
pollStreamConfig();

// Poll every 10 seconds
setInterval(pollStreamConfig, POLL_INTERVAL);
