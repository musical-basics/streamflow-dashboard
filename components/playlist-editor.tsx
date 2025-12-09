"use client"

import type React from "react"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Video, Trash2, Upload, GripVertical, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

export interface VideoItem {
  id: string
  title: string
  duration: string
  thumbnail: string
  url?: string      // Full URL to video file on VPS
  filename?: string // Video filename on VPS
}

interface PlaylistEditorProps {
  videos: VideoItem[]
  onReorder: (videos: VideoItem[]) => void
  onDelete: (id: string) => void
  onUpload?: (video: VideoItem) => void
}

export function PlaylistEditor({ videos, onReorder, onDelete, onUpload }: PlaylistEditorProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState<'uploading' | 'processing'>('uploading')
  const [isDragOver, setIsDragOver] = useState(false)



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

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast({
        title: "Invalid File",
        description: "Please upload a video file.",
        variant: "destructive"
      })
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setUploadStage('uploading')

    // Direct VPS upload
    const VPS_URL = 'https://stream.musicalbasics.com'

    try {
      const formData = new FormData()
      formData.append('video', file)

      console.log('Uploading directly to VPS:', `${VPS_URL}/upload`)

      // Use XMLHttpRequest for progress tracking
      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100)
            setUploadProgress(percent)
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText))
            } catch {
              reject(new Error('Invalid response'))
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText)
              reject(new Error(errorData.error || 'Upload failed'))
            } catch {
              reject(new Error('Upload failed'))
            }
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Upload failed - check if VPS is accessible')))
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

        xhr.open('POST', `${VPS_URL}/upload`)
        xhr.send(formData)
      })

      const newVideo: VideoItem = {
        id: data.id,
        title: data.title,
        duration: data.duration,
        thumbnail: data.thumbnail ? `${VPS_URL}${data.thumbnail}` : '',
        url: data.url ? `${VPS_URL}${data.url}` : undefined,
        filename: data.filename,
      }

      console.log('Upload success, newVideo:', newVideo)
      console.log('onUpload prop exists:', !!onUpload)

      // Call the onUpload callback to add to parent state
      if (onUpload) {
        console.log('Calling onUpload...')
        onUpload(newVideo)
      }

      toast({
        title: "Upload Complete",
        description: `"${newVideo.title}" added to playlist.`
      })
    } catch (error) {
      console.error('Upload error:', error)
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload video. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      setUploadStage('uploading')
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const handleDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDropZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Playlist Editor</h3>
        <span className="text-sm text-muted-foreground">{videos.length} videos</span>
      </div>

      {/* Upload Zone */}
      <Card
        className={`border-2 border-dashed transition-colors mb-4 ${isDragOver
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
          } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={handleDropZoneDragOver}
        onDragLeave={handleDropZoneDragLeave}
        onDrop={handleDropZoneDrop}
      >
        <label className="flex flex-col items-center justify-center py-8 cursor-pointer">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            {isUploading ? (
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            ) : (
              <Upload className="w-6 h-6 text-primary" />
            )}
          </div>
          {isUploading ? (
            <div className="w-full px-4">
              <p className="text-sm font-medium text-foreground mb-2 text-center">
                {uploadStage === 'uploading' ? `Uploading... ${uploadProgress}%` : 'Processing video...'}
              </p>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ease-out ${uploadStage === 'processing' ? 'bg-green-500 animate-pulse' : 'bg-primary'}`}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {uploadStage === 'uploading' ? 'Uploading to cloud storage' : 'Generating thumbnail...'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground mb-1">Drag & Drop Video</p>
              <p className="text-xs text-muted-foreground">or click to browse</p>
            </>
          )}
          <input
            type="file"
            className="sr-only"
            accept="video/*"
            onChange={handleFileInputChange}
            disabled={isUploading}
          />
        </label>
      </Card>

      {/* Video List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {videos.map((video, index) => (
          <Card
            key={video.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`p-3 cursor-grab active:cursor-grabbing transition-all ${draggedIndex === index ? "opacity-50 scale-95" : ""
              } ${dragOverIndex === index && draggedIndex !== index ? "border-primary ring-1 ring-primary" : ""}`}
          >
            <div className="flex items-center gap-3">
              <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />

              {/* Thumbnail */}
              <div className="w-20 h-12 rounded bg-secondary flex items-center justify-center flex-shrink-0 overflow-hidden">
                {video.thumbnail ? (() => {
                  // Convert VPS URLs to use the proxy to avoid mixed content
                  let thumbnailSrc = video.thumbnail
                  if (thumbnailSrc.startsWith('https://stream.musicalbasics.com')) {
                    thumbnailSrc = thumbnailSrc.replace('https://stream.musicalbasics.com', '/api/proxy')
                  } else if (!thumbnailSrc.startsWith('http') && !thumbnailSrc.startsWith('/')) {
                    thumbnailSrc = `/api/proxy/thumbnails/${thumbnailSrc}`
                  }
                  return (
                    <img
                      src={thumbnailSrc}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Hide broken image, show video icon instead
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )
                })() : (
                  <Video className="w-5 h-5 text-muted-foreground" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
                <p className="text-xs text-muted-foreground">{video.duration}</p>
              </div>

              {/* Actions */}
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(video.id)}
              >
                <Trash2 className="w-4 h-4" />
                <span className="sr-only">Delete video</span>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
