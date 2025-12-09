-- Create stream_config table for managing livestream settings
CREATE TABLE IF NOT EXISTS stream_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  is_active BOOLEAN DEFAULT false,
  stream_name TEXT NOT NULL,
  platform TEXT DEFAULT 'youtube',
  rtmp_url TEXT,
  stream_key TEXT,
  resolution TEXT DEFAULT '1080p',
  frame_rate INTEGER DEFAULT 30,
  video_bitrate INTEGER DEFAULT 8000,
  audio_bitrate INTEGER DEFAULT 128,
  playlist JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index for faster is_active lookups
CREATE INDEX IF NOT EXISTS idx_stream_config_is_active ON stream_config(is_active);

-- Insert a default config row
INSERT INTO stream_config (
  stream_name,
  platform,
  rtmp_url,
  resolution,
  frame_rate,
  video_bitrate,
  audio_bitrate,
  playlist
) VALUES (
  '24/7 Amazing Piano Music For Work, Relaxation And Peace',
  'youtube',
  'rtmp://a.rtmp.youtube.com/live2',
  '1080p',
  30,
  8000,
  128,
  '[
    {"url": "/videos/lofi-video-1.mp4", "title": "Lofi Video 1"},
    {"url": "/videos/lofi-video-2.mp4", "title": "Lofi Video 2"}
  ]'::jsonb
);
