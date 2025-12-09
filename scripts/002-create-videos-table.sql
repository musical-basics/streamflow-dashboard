-- Create videos table for storing media metadata
CREATE TABLE IF NOT EXISTS videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  duration TEXT DEFAULT '0:00:00',
  size TEXT DEFAULT '0 B',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust as needed for your auth setup)
CREATE POLICY "Allow all operations on videos" ON videos
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for faster searches
CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);
