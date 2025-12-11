"use client"

import type React from "react"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, Search, Grid, List, MoreVertical, Play, Clock, Film, X, Loader2, Trash2 } from "lucide-react"
import { createBrowserClient } from "@supabase/ssr"

interface Video {
  id: string
  filename: string
  title: string
  duration: string
  size: string
  created_at: string
}

function getThumbnailUrl(filename: string) {
  // Remove file extension and add .jpg for thumbnail
  const thumbName = filename.replace(/\.[^/.]+$/, '.jpg')
  return `https://stream.musicalbasics.com/thumbnails/${thumbName}`
}

function getSupabaseClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

export function MediaLibrary() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [videos, setVideos] = useState<Video[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<{
    id: string
    file: File
    status: 'pending' | 'uploading' | 'completed' | 'error'
    progress: number
  }[]>([])
  const [isUploading, setIsUploading] = useState(false)

  // Auto-refresh when queue is empty and was previously uploading?
  // Actually, we can just refresh after individual uploads or at the end.
  // We'll keep it simple and refresh the list after each successful upload to show immediate feedback.

  useEffect(() => {
    async function fetchVideos() {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.from("videos").select("*").order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching videos:", error)
      } else {
        setVideos(data || [])
      }
      setIsLoading(false)
    }
    fetchVideos()
  }, [])

  const processQueue = useCallback(async (queue: typeof uploadQueue) => {
    setIsUploading(true)
    let hasUpdates = false

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      if (item.status === 'completed') continue

      // Update status to uploading directly in the state
      setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'uploading', progress: 0 } : q))

      try {
        // Use XMLHttpRequest for upload progress
        await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          const formData = new FormData()
          formData.append('video', item.file)

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100)
              setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, progress: percentComplete } : q))
            }
          })

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText))
              } catch {
                resolve({})
              }
            } else {
              reject(new Error(`Upload failed: ${xhr.statusText}`))
            }
          })

          xhr.addEventListener('error', () => reject(new Error('Network error')))

          // Use proxy route to VPS
          xhr.open('POST', 'https://stream.musicalbasics.com/upload')
          xhr.send(formData)
        })

        // Mark as completed
        setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'completed', progress: 100 } : q))
        hasUpdates = true

        // Refresh list immediately after this file is done
        const supabase = getSupabaseClient()
        const { data } = await supabase
          .from("videos")
          .select("*")
          .order("created_at", { ascending: false })

        if (data) {
          setVideos(data)
        }

      } catch (error) {
        console.error("Upload error:", error)
        setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'error', progress: 0 } : q))
      }
    }

    setIsUploading(false)

    // Auto close only if all completed successfully? Or just leave it open for user to close.
    // User asked: "when the upload finishes, it should just automatically refresh the page so we can see that the video is in the media library"
    // We already refreshed the list. Let's close modal if all succeeded after a short delay.

    // Check if we should close (all completed)
    setUploadQueue(currentQueue => {
      const allCompleted = currentQueue.every(item => item.status === 'completed')
      if (allCompleted) {
        setTimeout(() => {
          setShowUploadModal(false)
          setUploadQueue([])
        }, 1000)
      }
      return currentQueue // return unchecked, effect will strictly trigger on state change but we are inside callback
      // Actually, we can't reliably check the *current* state inside here without refs or function update patterns heavily.
      // But since we are awaiting the loop, we are effectively at the end.
    })

  }, [])


  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)

    if (fileArray.length > 20) {
      alert("You can only upload up to 20 videos at a time.")
      return
    }

    const newQueue = fileArray.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'pending' as const,
      progress: 0
    }))

    setUploadQueue(newQueue)
    processQueue(newQueue)

  }, [processQueue])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files)
      }
    },
    [handleFileUpload],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileUpload(e.target.files)
      }
    },
    [handleFileUpload],
  )

  const filteredMedia = videos.filter((item) => item.title.toLowerCase().includes(searchQuery.toLowerCase()))

  const handleDelete = async (video: Video) => {
    if (!confirm(`Delete "${video.title}"? This will permanently remove the file.`)) {
      return
    }

    try {
      // Delete from VPS
      const response = await fetch(`/api/proxy/videos/${video.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete from VPS')
      }

      // Remove from local state
      setVideos((prev) => prev.filter((v) => v.id !== video.id))
    } catch (error) {
      console.error('Error deleting video:', error)
      alert('Failed to delete video. Please try again.')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  return (
    <div className="space-y-6">
      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Upload Media</h2>
              <button
                onClick={() => {
                  if (isUploading) {
                    if (!confirm("Uploads are in progress. Are you sure you want to cancel?")) return
                  }
                  setShowUploadModal(false)
                  setUploadQueue([])
                }}
                className="p-1 hover:bg-secondary rounded"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Drop Zone - Hide if queue has items */}
            {uploadQueue.length === 0 ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging ? "border-violet-500 bg-violet-500/10" : "border-border hover:border-violet-500/50"
                  }`}
              >
                <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-foreground mb-2">Drag and drop your files here</p>
                <p className="text-sm text-muted-foreground mb-4">or</p>
                <label>
                  <input type="file" multiple accept="video/*" onChange={handleFileSelect} className="hidden" />
                  <span className="inline-block px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg cursor-pointer transition-colors">
                    Browse Files
                  </span>
                </label>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                <p className="text-sm text-muted-foreground mb-2">
                  Processing {uploadQueue.filter(i => i.status === 'completed').length} of {uploadQueue.length} files...
                </p>
                {uploadQueue.map((item) => (
                  <div key={item.id} className="bg-secondary rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 truncate flex-1 mr-4">
                        {item.status === 'completed' ? (
                          <Film className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : item.status === 'error' ? (
                          <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                        ) : (
                          <Loader2 className={`w-4 h-4 text-violet-500 flex-shrink-0 ${item.status === 'uploading' ? 'animate-spin' : ''}`} />
                        )}
                        <span className="text-sm text-foreground truncate" title={item.file.name}>{item.file.name}</span>
                      </div>

                      <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                        {item.status === 'pending' ? 'Wait' : item.status === 'error' ? 'Err' : `${item.progress}%`}
                      </span>
                    </div>

                    <div className="w-full bg-background rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${item.status === 'error' ? "bg-red-500" :
                            item.status === 'completed' ? "bg-green-500" :
                              "bg-violet-600"
                          }`}
                        style={{ width: `${item.status === 'pending' ? 0 : Math.max(0, item.progress)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Media Library</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your videos and media files</p>
        </div>
        <Button onClick={() => setShowUploadModal(true)} className="bg-violet-600 hover:bg-violet-700 text-white">
          <Upload className="w-4 h-4 mr-2" />
          Upload Media
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search media..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary border-border"
          />
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-md transition-colors ${viewMode === "grid" ? "bg-violet-600 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-md transition-colors ${viewMode === "list" ? "bg-violet-600 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
      ) : filteredMedia.length === 0 ? (
        <div className="text-center py-12">
          <Film className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-foreground">No videos found</p>
          <p className="text-sm text-muted-foreground mt-1">Upload your first video to get started</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMedia.map((item) => (
            <div key={item.id} className="bg-card rounded-lg border border-border overflow-hidden group">
              <div className="relative aspect-video bg-secondary">
                <img
                  src={getThumbnailUrl(item.filename) || "/placeholder.svg"}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/video-thumbnail.png"
                  }}
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button className="w-12 h-12 rounded-full bg-violet-600 flex items-center justify-center">
                    <Play className="w-5 h-5 text-white ml-0.5" />
                  </button>
                </div>
                <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {item.duration}
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{item.size}</span>
                      <span>•</span>
                      <span>{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(item)}
                    className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded transition-colors"
                    title="Delete video"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Name</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Duration</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Size</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Uploaded</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredMedia.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-10 rounded bg-secondary overflow-hidden flex-shrink-0">
                        <img
                          src={getThumbnailUrl(item.filename) || "/placeholder.svg"}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/video-production-setup.png"
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Film className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{item.title}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">{item.duration}</td>
                  <td className="p-4 text-sm text-muted-foreground">{item.size}</td>
                  <td className="p-4 text-sm text-muted-foreground">{formatDate(item.created_at)}</td>
                  <td className="p-4">
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded transition-colors"
                      title="Delete video"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}
