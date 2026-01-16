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
const STATE_FILE = path.join(__dirname, 'stream_state.json');

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
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
        '-r', '30',           // 30fps constant
        '-g', '60',           // GOP size = 2 seconds (for 30fps) - helps seeking/concat
        '-preset', 'veryfast',
        '-crf', '23',
        '-profile:v', 'main', // Main profile for better compatibility
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart'
      ])
      // Audio: AAC 44.1kHz stereo
      .audioCodec('aac')
      .audioFrequency(44100)
      .audioChannels(2)
      .audioBitrate('128k')
      // Output format
      .format('mp4')
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

    // Save to temp directory first
    const tempFilename = `${Date.now()}_${filename}`;
    const tempFilePath = path.join(TEMP_DIR, tempFilename);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(tempFilePath, buffer);
    const size = buffer.length;
    console.log(`💾 Downloaded to temp: ${tempFilePath} (${formatFileSize(size)})`);

    // Generate normalized filename
    const baseName = path.basename(filename, path.extname(filename))
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();
    const normalizedFilename = `${baseName}_${timestamp}.mp4`;
    const normalizedPath = path.join(VIDEOS_DIR, normalizedFilename);

    // Normalize
    try {
      await normalizeVideo(tempFilePath, normalizedPath);
    } catch (err) {
      console.error('❌ Normalization failed:', err.message);
      fs.unlink(tempFilePath, () => { }); // Cleanup
      return res.status(500).json({ error: 'Video normalization failed' });
    }

    // Cleanup temp
    fs.unlink(tempFilePath, () => { });

    // Get video duration from normalized file
    let duration = '0:00';
    try {
      duration = await getVideoDuration(normalizedPath);
      console.log(`⏱️ Duration: ${duration}`);
    } catch (err) {
      console.error('Could not get duration:', err.message);
    }

    // Generate thumbnail from normalized file
    const thumbnailFilename = normalizedFilename.replace(/\.mp4$/, '.jpg');
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

    try {
      await generateThumbnail(normalizedPath, thumbnailPath);
    } catch (err) {
      console.error('Thumbnail generation failed, using placeholder');
    }

    // Get normalized size
    const normalizedStats = fs.statSync(normalizedPath);
    const normalizedSize = formatFileSize(normalizedStats.size);

    // Derive title
    const titleSource = originalName || filename;
    const title = path.basename(titleSource, path.extname(titleSource))
      .replace(/[-_]/g, ' ')
      .replace(/_\d+$/, '');

    // Insert into Supabase videos table
    const videoData = {
      filename: normalizedFilename,
      title,
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

    console.log(`✅ Upload and normalization complete: ${normalizedFilename}`);

    // Return the new video object
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
      // Store in public/audio directory for better organization
      const audioDir = path.join(__dirname, 'public', 'audio');
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }
      cb(null, audioDir);
    },
    filename: (req, file, cb) => {
      // Sanitize and timestamp
      const ext = path.extname(file.originalname);
      const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${basename}_${Date.now()}${ext}`;
      cb(null, filename);
    }
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
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

    const { filename, originalname, size } = req.file;
    console.log(`🎵 Received audio upload: ${originalname} -> ${filename}`);
    console.log(`📦 Size: ${(size / 1024 / 1024).toFixed(2)} MB`);

    res.json({
      success: true,
      filename: filename, // Return the actual filename
      originalName: originalname,
      size: `${(size / 1024 / 1024).toFixed(2)} MB`,
      message: 'Background audio uploaded successfully.'
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

    // Update Playlist: Remove deleted video from active stream config
    try {
      const { data: config } = await getStreamConfig();
      if (config && Array.isArray(config.playlist)) {
        const originalLength = config.playlist.length;
        const newPlaylist = config.playlist.filter(item => {
          // Check by ID or Filename
          if (item.id && item.id === video.id) return false;
          if (item.filename && item.filename === video.filename) return false;
          return true;
        });

        if (newPlaylist.length < originalLength) {
          console.log(`🧹 Removing deleted video from playlist (${originalLength} -> ${newPlaylist.length})`);
          await supabase
            .from('stream_config')
            .update({ playlist: newPlaylist })
            .eq('id', config.id);
          console.log('✅ Playlist updated');
        }
      }
    } catch (err) {
      console.error('⚠️ Failed to cleanup playlist:', err.message);
    }

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
/**
 * Get currently playing video info based on DJ index
 */
app.get('/now-playing', (req, res) => {
  if (!isStreaming || currentPlaylist.length === 0) {
    return res.json({
      current: null,
      next: null,
      index: 0,
      total: 0,
      isStreaming: false
    });
  }

  // With DJ Mode, we always know exactly which index is feeding the master stream
  const current = currentPlaylist[currentIndex];
  // Next is simply index + 1 (wrapping around)
  const nextIndex = (currentIndex + 1) % currentPlaylist.length;
  const next = currentPlaylist[nextIndex];

  // We don't have exact "elapsed" time within the file easily available 
  // without parsing the feeder ffmpeg output, but for now we can omit it 
  // or return 0. The frontend uses it for progress bars.
  // TODO: Improved elapsed time tracking by monitoring start time of current feeder.

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
    elapsedSeconds: 0 // Placeholder
  });
});

// =============================================================================
// BROADCAST ENGINE (DJ MODE)
// =============================================================================

let masterFfmpeg = null; // The persistent process sending to RTMP
let currentFeederProcess = null; // The process reading the current file
let isStreaming = false;
let currentConfigId = null;
let lastConfig = null;

// Playlist State
let currentPlaylist = [];
let currentIndex = 0;
let skipToTarget = false; // Flag to indicate manual skip
let masterStdin = null; // Stream to write video data to

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
 * Save current stream state to file
 */
function saveStreamState(data) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
    // console.log('💾 Stream state saved:', data.lastPlayedVideoId); // verbose
  } catch (err) {
    console.error('⚠️ Failed to save stream state:', err.message);
  }
}

/**
 * Load stream state from file
 */
function loadStreamState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('⚠️ Failed to load stream state:', err.message);
  }
  return null;
}

/**
 * Handle skip controls
 */
app.post('/control/skip', (req, res) => {
  if (!isStreaming) {
    return res.status(400).json({ error: 'Stream not active' });
  }

  const { direction } = req.body;
  if (!direction || (direction !== 'next' && direction !== 'previous')) {
    return res.status(400).json({ error: 'Invalid direction' });
  }

  console.log(`⏭️ specific Manual skip requested: ${direction}`);

  // Calculate new index
  if (direction === 'next') {
    currentIndex++;
    if (currentIndex >= currentPlaylist.length) currentIndex = 0;
  } else {
    currentIndex--;
    if (currentIndex < 0) currentIndex = currentPlaylist.length - 1;
  }

  // Set flag so the exit handler knows NOT to auto-increment
  skipToTarget = true;

  // Kill feeder to force switch
  if (currentFeederProcess) {
    currentFeederProcess.kill();
  }

  res.json({ success: true, newIndex: currentIndex });
});

/**
 * Play the next video in the playlist (The DJ Logic)
 */
function playNextVideo() {
  if (!isStreaming || !masterStdin) return;
  if (currentPlaylist.length === 0) {
    console.log('⚠️ Playlist empty. Waiting...');
    setTimeout(playNextVideo, 2000);
    return;
  }

  // Ensure index is valid (sanity check)
  if (currentIndex < 0) currentIndex = 0;
  if (currentIndex >= currentPlaylist.length) currentIndex = 0;

  const video = currentPlaylist[currentIndex];
  // ... (rest of playNextVideo remains similar until close handler)

  const filePath = getVideoPath(video);

  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`❌ File not found for index ${currentIndex}: ${video.title}`);
    currentIndex++;
    playNextVideo();
    return;
  }

  console.log(`\n🎵 DJ CUE: [${currentIndex + 1}/${currentPlaylist.length}] "${video.title}"`);
  console.log(`   File: ${path.basename(filePath)}`);

  // PERSIST STATE: Save current video ID so we can resume if restarted
  saveStreamState({
    lastPlayedVideoId: video.id,
    timestamp: Date.now()
  });

  // Spawn Feeder Process
  // Convert MP4 to MPEG-TS and pipe to stdout
  const feederArgs = [
    '-re',                // Read at native framerate (crucial for streaming)
    '-i', filePath,
    '-c', 'copy',         // Copy streams (fast, requires normalization)
    '-bsf:v', 'h264_mp4toannexb', // Convert to Annex B bitstream for MPEG-TS
    '-f', 'mpegts',       // Output formatted as MPEG-TS
    'pipe:1'              // Write to stdout
  ];

  currentFeederProcess = spawn('ffmpeg', feederArgs);

  // Pipe feeder stdout -> master stdin
  currentFeederProcess.stdout.pipe(masterStdin, { end: false }); // Don't close master when feeder ends

  // CRITICAL: We MUST consume stderr, otherwise the process hangs when the buffer fills (64KB)!
  currentFeederProcess.stderr.on('data', (data) => {
    // Drain buffer
  });

  currentFeederProcess.on('error', (err) => {
    console.error('❌ Feeder Error:', err);
    // Try next
    if (currentFeederProcess) currentFeederProcess.kill();
    currentIndex++;
    setTimeout(playNextVideo, 1000);
  });

  currentFeederProcess.on('close', (code) => {
    if (skipToTarget) {
      console.log('⏭️ Skipping to target video...');
      skipToTarget = false;
      // Do NOT increment currentIndex, just play the one we set
      playNextVideo();
    } else {
      if (code === 0) {
        console.log(`✅ Finished: "${video.title}"`);
        // Normal flow: Move to next
        currentIndex++;
        playNextVideo();
      } else if (code !== null) {
        console.log(`⚠️ Feeder exited with code ${code}, trying next...`);
        currentIndex++;
        setTimeout(playNextVideo, 1000);
      }
    }
  });
}

/**
 * Get absolute file path for a playlist item
 */
function getVideoPath(item) {
  let filePath = null;

  if (typeof item === 'string') {
    filePath = item;
  } else if (item.filename) {
    filePath = path.join(VIDEOS_DIR, item.filename);
  } else if (item.url) {
    // Has url property - need to extract the filename and construct local path
    let extractedPath = item.url;
    // If it's a full HTTP URL, extract just the path part
    if (item.url.startsWith('http')) {
      try {
        const urlObj = new URL(item.url);
        extractedPath = urlObj.pathname;
      } catch (e) {
        return null;
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
  }
  return filePath;
}

/**
 * Validate and clean playlist (remove missing files)
 */
function cleanPlaylist(playlist) {
  if (!Array.isArray(playlist)) return { validPlaylist: [], hasChanges: false, removedCount: 0 };

  const validPlaylist = [];
  let removedCount = 0;

  for (const item of playlist) {
    const filePath = getVideoPath(item);

    if (filePath && fs.existsSync(filePath)) {
      validPlaylist.push(item);
    } else {
      removedCount++;
      console.log(`⚠️ Removing missing file from playlist: ${item.title || item.filename || 'unknown'}`);
    }
  }

  return {
    validPlaylist,
    hasChanges: removedCount > 0,
    removedCount
  };
}

/**
 * Start the Master FFmpeg Process
 * This process listens to stdin (MPEG-TS) and pushes to RTMP
 */
function startMasterStream(config) {
  if (masterFfmpeg) return;

  const {
    rtmp_url,
    stream_key,
    bitrate
  } = config;

  if (!rtmp_url || !stream_key) {
    console.error('❌ Missing RTMP URL or stream key');
    return;
  }

  const outputUrl = `${rtmp_url}/${stream_key}`;
  const vBitrate = bitrate || 8000;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎬 STARTING MASTER STREAM ENGINE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📡 RTMP URL:', rtmp_url);
  console.log('📊 Bitrate:', vBitrate, 'kbps');
  console.log('');

  // Master args: Read MPEG-TS from stdin, Re-encode to ensure continuous timestamps
  // We MUST re-encode because concatenating MPEG-TS pipes resets timestamps, 
  // and -c copy would pass those resets to RTMP, breaking the stream.

  // Audio Overlay Setup
  const audioEnabled = config.audio_overlay_enabled !== false; // Default true
  const audioVolumeRaw = config.audio_volume || 35;
  const audioFile = config.audio_file || 'rain.mp3'; // Default to rain.mp3

  let audioInputPath = null;
  // Check specific audio directory first
  const audioDirFile = path.join(__dirname, 'public', 'audio', audioFile);
  const publicDirFile = path.join(__dirname, 'public', audioFile); // Backwards compatibility

  if (fs.existsSync(audioDirFile)) {
    audioInputPath = audioDirFile;
  } else if (fs.existsSync(publicDirFile)) {
    audioInputPath = publicDirFile;
  }

  const masterArgs = [
    '-fflags', '+genpts+discardcorrupt',
    '-f', 'mpegts',
    '-i', 'pipe:0' // Input 0: Video Stream from Feeder
  ];

  // Logic: Add background audio input if enabled and exists
  if (audioEnabled && audioInputPath) {
    console.log(`🎵 Background Audio: Enabled (${audioVolumeRaw}%) - ${path.basename(audioInputPath)}`);
    masterArgs.push('-stream_loop', '-1', '-i', audioInputPath); // Input 1: Background Loop
  } else {
    console.log('🔇 Background Audio: Disabled or not found');
  }

  // Video Encoding (Basic)
  const videoEncodingArgs = [
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-b:v', `${vBitrate}k`,
    '-maxrate', `${vBitrate}k`,
    '-bufsize', `${vBitrate * 2}k`,
    '-g', '60',
    '-pix_fmt', 'yuv420p'
  ];
  masterArgs.push(...videoEncodingArgs);

  // Audio Encoding & Mixing
  if (audioEnabled && audioInputPath) {
    // Calculate volume 0.0 - 1.0 (Assume video is 1.0)
    const vol = (audioVolumeRaw / 100).toFixed(2);

    // Mix Input 0 (Stream) and Input 1 (Background)
    masterArgs.push(
      '-filter_complex', `[0:a]volume=1.0[a1];[1:a]volume=${vol}[a2];[a1][a2]amix=inputs=2:duration=first[aout]`,
      '-map', '0:v',   // Map Video from Input 0
      '-map', '[aout]' // Map Mixed Audio
    );
  } else {
    // Pass through audio from Input 0
    // Note: We still re-encode AAC to ensure consistency
    // No mapping needed, FFmpeg picks 0:v and 0:a by default for single input
  }

  // Common Audio Encoding Settings
  masterArgs.push(
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-f', 'flv',
    outputUrl
  );

  console.log('🚀 Master Command: ffmpeg ' + masterArgs.join(' '));

  masterFfmpeg = spawn('ffmpeg', masterArgs);
  masterStdin = masterFfmpeg.stdin; // We will pipe into this

  isStreaming = true;

  masterFfmpeg.stderr.on('data', (data) => {
    // Log master status (maybe filter spam)
    const line = data.toString().trim();
    if (!line) return;
    if (line.includes('frame=') && line.includes('size=')) return; // Filter stats

    // FILTER OUT METADATA SPAM (MP3/Video Details)
    const lower = line.toLowerCase();
    if (
      lower.includes('metadata:') ||
      lower.includes('title           :') ||
      lower.includes('artist          :') ||
      lower.includes('comment         :') ||
      lower.includes('description     :') ||
      lower.includes('album           :') ||
      lower.includes('genre           :') ||
      lower.includes('date            :') ||
      lower.includes('encoder         :') ||
      line.trim().startsWith('Stream #') ||
      line.trim().startsWith('Duration:') ||
      line.trim().startsWith('Side data:')
    ) {
      return;
    }

    console.log(`[MASTER] ${line}`);
  });

  masterFfmpeg.on('close', (code) => {
    console.log(`🛑 Master process exited with code ${code}`);
    masterFfmpeg = null;
    masterStdin = null;
    isStreaming = false;
    // If master dies, kill feeder too
    if (currentFeederProcess) {
      currentFeederProcess.kill();
      currentFeederProcess = null;
    }
  });

  // Start feeding video !
  playNextVideo();
}



/**
 * Stop Everything
 */
function stopStream() {
  console.log('🛑 Stopping Stream Config...');
  if (currentFeederProcess) {
    currentFeederProcess.kill();
    currentFeederProcess = null;
  }
  if (masterFfmpeg) {
    masterFfmpeg.kill(); // This will close the stream
    masterFfmpeg = null;
    masterStdin = null;
  }
  isStreaming = false;
}

/**
 * Poll config and handle updates
 */
async function pollStreamConfig() {
  try {
    const config = await getStreamConfig();
    if (!config) return;

    // 1. Handle ON/OFF Toggle
    if (config.is_active && !isStreaming) {
      console.log('▶️ Stream activated. Initializing...');
      // Clean playlist first
      const { validPlaylist, hasChanges } = cleanPlaylist(config.playlist);
      if (hasChanges) {
        // Should update DB, but for now just use valid in memory
        config.playlist = validPlaylist;
      }
      currentPlaylist = config.playlist;

      // Smart Restart Logic: Try to find where we left off (from FILE)
      currentIndex = 0;
      const savedState = loadStreamState();

      if (savedState && savedState.lastPlayedVideoId) {
        console.log(`🧐 Smart Restart: Looking for last played video ID ${savedState.lastPlayedVideoId}...`);
        const foundIndex = currentPlaylist.findIndex(v => v.id === savedState.lastPlayedVideoId);

        if (foundIndex !== -1) {
          // Found it! Start from the NEXT one
          const nextIndex = (foundIndex + 1) % currentPlaylist.length;
          console.log(`📍 Found last video at index ${foundIndex}. Resuming from index ${nextIndex} ("${currentPlaylist[nextIndex].title}")`);
          currentIndex = nextIndex;
        } else {
          console.log('⚠️ Last played video not found in new playlist. Starting from beginning.');
        }
      }

      startMasterStream(config);
      lastConfig = config;
    }
    else if (!config.is_active && isStreaming) {
      console.log('⏹️ Stream deactivated. Stopping.');
      stopStream();
      return;
    }

    // 2. Handle Runtime Updates (if streaming)
    if (isStreaming && config.is_active) {
      // CHECK FOR CRITICAL CHANGES (Stream Key, URL, Audio)
      // If these change, we MUST restart the master process
      const criticalChanged =
        config.stream_key !== lastConfig.stream_key ||
        config.rtmp_url !== lastConfig.rtmp_url ||
        config.audio_overlay_enabled !== lastConfig.audio_overlay_enabled ||
        config.audio_volume !== lastConfig.audio_volume ||
        config.audio_file !== lastConfig.audio_file;

      if (criticalChanged) {
        console.log('⚠️ Critical Configuration Changed (Key/URL/Audio) - Restarting Stream...');

        // Save state before stopping
        // No need to manually save state here, as it's saved every time a song starts

        stopStream();
        // The next poll will pick it up as is_active=true but isStreaming=false and start fresh
        return;
      }

      // Check for Playlist Changes
      const oldJson = JSON.stringify(lastConfig?.playlist || []);
      const newJson = JSON.stringify(config.playlist || []);

      if (oldJson !== newJson) {
        console.log('🔄 Playlist updated!');

        const oldVideo = currentPlaylist[currentIndex];

        // Update playlist in memory
        const { validPlaylist } = cleanPlaylist(config.playlist);
        currentPlaylist = validPlaylist;

        // POINTER CORRECTION
        // Find where the currently playing video went
        if (oldVideo) {
          const newIndex = currentPlaylist.findIndex(v =>
            (v.id && v.id === oldVideo.id) ||
            (v.filename && v.filename === oldVideo.filename)
          );

          if (newIndex !== -1) {
            console.log(`📍 Pointer Correction: Index moved from ${currentIndex} to ${newIndex}`);
            currentIndex = newIndex;
          } else {
            console.log(`⚠️ Current video removed from playlist. Keeping index ${currentIndex} (might jump)`);
            // Clamp index just in case
            if (currentIndex >= currentPlaylist.length) currentIndex = 0;
          }
        }

        lastConfig = config;
      }
    }

  } catch (error) {
    console.error('Poll Error:', error);
  }
} // End pollStreamConfig

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
