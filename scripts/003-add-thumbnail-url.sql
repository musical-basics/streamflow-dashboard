-- Update videos table to include thumbnail_url column
-- Run this migration in your Supabase SQL editor

-- Add thumbnail_url column if it doesn't exist
ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT '';

-- Update the column comment
COMMENT ON COLUMN videos.thumbnail_url IS 'Path to the video thumbnail image';
