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
const TEMP_DIR = path.join(__dirname, 'public', 'temp');
[VIDEOS_DIR, THUMBNAILS_DIR, TEMP_DIR].forEach(dir => {
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
    cb(null, TEMP_DIR); // Save to temp dir, normalize later
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
 * Normalize video to consistent format for concat demuxer
 * Target: 1920x1080, 30fps, H.264, AAC 44.1kHz stereo, MP4
 */
function normalizeVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`🔄 Normalizing video: ${path.basename(inputPath)}`);
    console.log(`   → Target: 1080p30fps H.264/AAC MP4`);

    ffmpeg(inputPath)
      // Video: Scale to 1080p with padding to maintain aspect ratio
      .videoCodec('libx264')
      .outputOptions([
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black',
        '-r', '30',           // 30fps constant
        '-preset', 'veryfast', // Fast encoding
        '-crf', '23',         // Good quality
        '-pix_fmt', 'yuv420p' // Compatibility
      ])
      // Audio: AAC 44.1kHz stereo
      .audioCodec('aac')
      .audioFrequency(44100)
      .audioChannels(2)
      .audioBitrate('128k')
      // Output format
      .format('mp4')
      .outputOptions('-movflags', '+faststart') // Web-friendly
      .on('start', (cmd) => {
        console.log(`   FFmpeg command: ${cmd.substring(0, 100)}...`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r   Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`\n✅ Normalization complete: ${path.basename(outputPath)}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`\n❌ Normalization failed: ${err.message}`);
        reject(err);
      })
      .save(outputPath);
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

    const { originalname, path: tempFilePath, size } = req.file;
    console.log(`📤 Received upload: ${originalname} (${formatFileSize(size)})`);

    // Generate normalized filename (always .mp4)
    const baseName = path.basename(originalname, path.extname(originalname))
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();
    const normalizedFilename = `${baseName}_${timestamp}.mp4`;
    const normalizedPath = path.join(VIDEOS_DIR, normalizedFilename);

    // Step 1: Normalize video to 1080p30fps H.264/AAC
    console.log('🎬 Starting normalization...');
    try {
      await normalizeVideo(tempFilePath, normalizedPath);
    } catch (err) {
      console.error('❌ Normalization failed:', err.message);
      // Clean up temp file
      fs.unlink(tempFilePath, () => { });
      return res.status(500).json({ error: 'Video normalization failed: ' + err.message });
    }

    // Step 2: Delete temp file
    fs.unlink(tempFilePath, (err) => {
      if (err) console.error('Could not delete temp file:', err.message);
      else console.log('🗑️ Temp file deleted');
    });

    // Step 3: Get duration from normalized video
    let duration = '0:00';
    try {
      duration = await getVideoDuration(normalizedPath);
      console.log(`⏱️ Duration: ${duration}`);
    } catch (err) {
      console.error('Could not get duration:', err.message);
    }

    // Step 4: Generate thumbnail from normalized video
    const thumbnailFilename = normalizedFilename.replace(/\.mp4$/, '.jpg');
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

    try {
      await generateThumbnail(normalizedPath, thumbnailPath);
    } catch (err) {
      console.error('Thumbnail generation failed, using placeholder');
    }

    // Step 5: Get file size of normalized video
    const normalizedStats = fs.statSync(normalizedPath);
    const normalizedSize = formatFileSize(normalizedStats.size);

    // Step 6: Insert into Supabase
    const videoData = {
      filename: normalizedFilename,
      title: baseName.replace(/[-_]/g, ' '),
      duration,
      size: normalizedSize,
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

    console.log(`✅ Upload complete: ${normalizedFilename}`);

    res.json({
      id: data.id,
      filename: data.filename,
      title: data.title,
      duration: data.duration,
      size: data.size,
      thumbnail: data.thumbnail_url,
      url: `/videos/${normalizedFilename}`,
      created_at: data.created_at
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Upload from Supabase Dropzone Endpoint
 * Downloads a file from Supabase storage and processes it locally
 */
app.post('/upload-from-url', async (req, res) => {
  try {
    const { filename, originalName } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Missing filename' });
    }

    console.log(`📥 Downloading from Supabase dropzone: ${filename}`);

    // Construct the public URL for the file in dropzone bucket
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/dropzone/${filename}`;
    console.log(`🔗 Fetching from: ${publicUrl}`);

    // Download the file
    const response = await fetch(publicUrl);

    if (!response.ok) {
      console.error(`❌ Failed to download: ${response.status} ${response.statusText}`);
      return res.status(400).json({ error: `Failed to download file: ${response.statusText}` });
    }

    // Save to local videos directory
    const localFilename = filename;
    const filePath = path.join(VIDEOS_DIR, localFilename);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    const size = buffer.length;
    console.log(`💾 Saved to: ${filePath} (${formatFileSize(size)})`);

    // Get video duration
    let duration = '0:00';
    try {
      duration = await getVideoDuration(filePath);
      console.log(`⏱️ Duration: ${duration}`);
    } catch (err) {
      console.error('Could not get duration:', err.message);
    }

    // Generate thumbnail
    const thumbnailFilename = localFilename.replace(/\.[^/.]+$/, '.jpg');
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

    try {
      await generateThumbnail(filePath, thumbnailPath);
    } catch (err) {
      console.error('Thumbnail generation failed, using placeholder');
    }

    // Derive title from original filename or the dropzone filename
    const titleSource = originalName || filename;
    const title = path.basename(titleSource, path.extname(titleSource))
      .replace(/[-_]/g, ' ')
      .replace(/_\d+$/, ''); // Remove timestamp suffix

    // Insert into Supabase videos table
    const videoData = {
      filename: localFilename,
      title,
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

    console.log(`✅ Upload from URL complete: ${localFilename}`);

    // Optionally delete from dropzone to free up space
    // (uncomment if you want automatic cleanup)
    // try {
    //   await supabase.storage.from('dropzone').remove([filename]);
    //   console.log(`🗑️ Cleaned up dropzone: ${filename}`);
    // } catch (cleanupErr) {
    //   console.error('Cleanup failed:', cleanupErr.message);
    // }

    // Return the new video object
    res.json({
      id: data.id,
      filename: data.filename,
      title: data.title,
      duration: data.duration,
      size: data.size,
      thumbnail: data.thumbnail_url,
      url: `/videos/${localFilename}`,
      created_at: data.created_at
    });

  } catch (error) {
    console.error('❌ Upload from URL error:', error);
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

/**
 * Parse duration string (e.g., "3:45" or "1:23:45") to seconds
 */
function parseDurationToSeconds(duration) {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Get currently playing video info based on elapsed time
 */
app.get('/now-playing', (req, res) => {
  if (!isStreaming || currentPlaylist.length === 0 || !streamStartTime) {
    return res.json({
      current: null,
      next: null,
      index: 0,
      total: 0,
      isStreaming: false
    });
  }

  // Calculate elapsed seconds since stream started
  const elapsedMs = Date.now() - streamStartTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  // Calculate total playlist duration
  const durations = currentPlaylist.map(item => parseDurationToSeconds(item.duration));
  const totalDuration = durations.reduce((sum, d) => sum + d, 0);

  if (totalDuration === 0) {
    // Fallback if no duration data
    return res.json({
      current: currentPlaylist[0] || null,
      next: currentPlaylist[1] || null,
      index: 0,
      total: currentPlaylist.length,
      isStreaming: true
    });
  }

  // Find which video is currently playing based on elapsed time (with looping)
  let timeInLoop = elapsedSeconds % totalDuration;
  let currentIndex = 0;
  let cumulativeTime = 0;

  for (let i = 0; i < currentPlaylist.length; i++) {
    cumulativeTime += durations[i];
    if (timeInLoop < cumulativeTime) {
      currentIndex = i;
      break;
    }
  }

  const nextIndex = (currentIndex + 1) % currentPlaylist.length;
  const current = currentPlaylist[currentIndex];
  const next = currentPlaylist[nextIndex];

  res.json({
    current: current ? {
      id: current.id,
      title: current.title,
      thumbnail: current.thumbnail || current.thumbnail_url,
      duration: current.duration,
      filename: current.filename
    } : null,
    next: next ? {
      id: next.id,
      title: next.title,
      thumbnail: next.thumbnail || next.thumbnail_url,
      duration: next.duration,
      filename: next.filename
    } : null,
    index: currentIndex,
    total: currentPlaylist.length,
    isStreaming: true,
    elapsedSeconds
  });
});

// =============================================================================
// BROADCAST ENGINE
// =============================================================================

let ffmpegProcess = null;
let isStreaming = false;
let currentConfigId = null;
let lastConfig = null;

// Now Playing tracking
let currentPlaylist = [];
let streamStartTime = null; // Timestamp when stream started

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

  // Track current playlist for now-playing feature
  currentPlaylist = playlist;
  streamStartTime = Date.now(); // Unix timestamp for time-based tracking

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎬 STARTING STREAM');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📡 RTMP URL:', rtmp_url);
  console.log('🔊 Audio overlay:', audio_overlay_enabled ? `${audio_volume}%` : 'disabled');
  console.log('📊 Bitrate:', bitrate || 8000, 'kbps');
  console.log('');
  console.log('📋 PLAYLIST (' + playlist.length + ' videos):');
  playlist.forEach((video, i) => {
    console.log(`   ${i + 1}. ${video.title || video.filename} (${video.duration || 'unknown'})`);
  });
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

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
    // Convert buffer to string and split by lines to handle chunks correctly
    const outputLines = data.toString().split('\n');

    for (const line of outputLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 1. Filter out the spammy progress bar
      if (trimmed.includes('frame=') && trimmed.includes('fps=')) {
        // Do nothing (hides the spam)
        continue;
      }

      // 2. Log EVERYTHING else so we can see the "Opening" message format
      console.log(`[FFMPEG] ${trimmed}`);

      // 3. Try to catch the now playing (standard format)
      if (trimmed.includes("Opening '")) {
        try {
          // Extract filename between single quotes
          const match = trimmed.match(/'([^']+)'/);
          if (match && match[1]) {
            const filename = match[1].split('/').pop();
            console.log(`🎵 NOW PLAYING: ${filename}`);
          }
        } catch (e) { /* ignore parse errors */ }
      }
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
 * Check if config has changed significantly
 * Now includes playlist changes to auto-restart when playlist is updated
 */
function configChanged(oldConfig, newConfig) {
  if (!oldConfig) return false;

  const playlistChanged = JSON.stringify(oldConfig.playlist) !== JSON.stringify(newConfig.playlist);
  const settingsChanged = (
    oldConfig.audio_volume !== newConfig.audio_volume ||
    oldConfig.audio_overlay_enabled !== newConfig.audio_overlay_enabled ||
    oldConfig.bitrate !== newConfig.bitrate
  );

  if (playlistChanged) {
    console.log('🔄 Playlist changed - will restart stream');
    console.log('📋 Old playlist:', oldConfig.playlist?.length || 0, 'videos');
    console.log('📋 New playlist:', newConfig.playlist?.length || 0, 'videos');
  }
  if (settingsChanged) {
    console.log('🔄 Stream settings changed - will restart stream');
  }

  return playlistChanged || settingsChanged;
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
