"use client"

import type React from "react"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Video, Trash2, GripVertical, Plus, Volume2 } from "lucide-react"
import { VideoPickerModal } from "@/components/video-picker-modal"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface VideoItem {
  id: string
  title: string
  duration: string
  thumbnail: string
  url?: string
  filename?: string
  thumbnail_url?: string
  volume?: number
}

interface PlaylistEditorProps {
  videos: VideoItem[]
  onReorder: (videos: VideoItem[]) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<VideoItem>) => void
  onAddVideos?: (videos: VideoItem[]) => void
}

export function PlaylistEditor({ videos, onReorder, onDelete, onUpdate, onAddVideos }: PlaylistEditorProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newVideos = [...videos]
      const [removed] = newVideos.splice(draggedIndex, 1)
      newVideos.splice(dragOverIndex, 0, removed)
      onReorder(newVideos)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleSelectVideos = (selectedVideos: any[]) => {
    // Convert from library format to playlist format
    const formatted: VideoItem[] = selectedVideos.map(v => ({
      id: v.id,
      title: v.title,
      duration: v.duration,
      thumbnail: v.thumbnail_url || `/thumbnails/${v.filename?.replace(/\.[^/.]+$/, '.jpg')}`,
      filename: v.filename,
      url: `/videos/${v.filename}`,
      volume: 100 // Default volume
    }))

    if (onAddVideos) {
      onAddVideos(formatted)
    }
  }

  const getThumbnailSrc = (video: VideoItem) => {
    const thumb = video.thumbnail || video.thumbnail_url
    if (!thumb) return null

    if (thumb.startsWith('https://stream.musicalbasics.com')) {
      return thumb.replace('https://stream.musicalbasics.com', '/api/proxy')
    } else if (thumb.startsWith('http://62.146.175.144:3000')) {
      return thumb.replace('http://62.146.175.144:3000', '/api/proxy')
    } else if (thumb.startsWith('/thumbnails/')) {
      return `/api/proxy${thumb}`
    } else if (!thumb.startsWith('http') && !thumb.startsWith('/')) {
      return `/api/proxy/thumbnails/${thumb}`
    }
    return thumb
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Playlist Editor</h3>
        <span className="text-sm text-muted-foreground">{videos.length} videos</span>
      </div>

      {/* Add from Library Button */}
      <Button
        onClick={() => setShowPicker(true)}
        variant="outline"
        className="mb-4 border-dashed border-2 py-6 hover:border-primary hover:bg-primary/5"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add from Library
      </Button>

      {/* Video Picker Modal */}
      <VideoPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelectVideos={handleSelectVideos}
        existingVideoIds={videos.map(v => v.id)}
      />

      {/* Video List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {videos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Video className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No videos in playlist</p>
            <p className="text-sm">Add videos from your Media Library</p>
          </div>
        ) : (
          videos.map((video, index) => (
            <Card
              key={video.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`p-3 cursor-grab active:cursor-grabbing transition-all ${draggedIndex === index ? "opacity-50" : ""
                } ${dragOverIndex === index && draggedIndex !== index ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />

                {/* Thumbnail */}
                <div className="w-20 h-12 rounded bg-secondary flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {getThumbnailSrc(video) ? (
                    <img
                      src={getThumbnailSrc(video) || undefined}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <Video className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{video.title}</p>
                  <p className="text-sm text-muted-foreground">{video.duration}</p>
                </div>

                {/* Volume Control */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <Volume2 className="w-4 h-4 mr-1.5" />
                      <span className="text-xs font-mono w-9 text-right inline-block">
                        {video.volume ?? 100}%
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" side="left">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <h4 className="font-medium leading-none">Volume</h4>
                        <p className="text-sm text-muted-foreground">
                          Adjust playback volume for this track.
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Slider
                          defaultValue={[video.volume ?? 100]}
                          max={100}
                          step={1}
                          className="flex-1"
                          onValueChange={(value) => onUpdate(video.id, { volume: value[0] })}
                        />
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={video.volume ?? 100}
                            onChange={(e) => {
                              const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                              onUpdate(video.id, { volume: val })
                            }}
                            className="w-16 h-8 text-right"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Remove from Playlist */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(video.id)}
                  className="text-muted-foreground hover:text-destructive flex-shrink-0"
                  title="Remove from playlist"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
