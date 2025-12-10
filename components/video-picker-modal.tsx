"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X, Search, Check, Loader2, Film } from "lucide-react"
import { supabase } from "@/lib/supabase"

interface Video {
    id: string
    filename: string
    title: string
    duration: string
    size: string
    thumbnail_url?: string
}

interface VideoPickerModalProps {
    isOpen: boolean
    onClose: () => void
    onSelectVideos: (videos: Video[]) => void
    existingVideoIds: string[] // Videos already in playlist
}

export function VideoPickerModal({ isOpen, onClose, onSelectVideos, existingVideoIds }: VideoPickerModalProps) {
    const [videos, setVideos] = useState<Video[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (!isOpen) return

        async function fetchVideos() {
            setIsLoading(true)
            const { data, error } = await supabase
                .from("videos")
                .select("*")
                .order("created_at", { ascending: false })

            if (error) {
                console.error("Error fetching videos:", error)
            } else {
                setVideos(data || [])
            }
            setIsLoading(false)
        }

        fetchVideos()
        setSelectedIds(new Set()) // Reset selection when opening
    }, [isOpen])

    if (!isOpen) return null

    const filteredVideos = videos.filter(
        (video) =>
            video.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !existingVideoIds.includes(video.id) // Hide videos already in playlist
    )

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const handleAddSelected = () => {
        const selected = videos.filter((v) => selectedIds.has(v.id))
        onSelectVideos(selected)
        onClose()
    }

    const getThumbnailSrc = (video: Video) => {
        if (video.thumbnail_url) {
            if (video.thumbnail_url.startsWith('/thumbnails/')) {
                return `/api/proxy${video.thumbnail_url}`
            }
            return video.thumbnail_url
        }
        // Fallback: construct from filename
        const thumbName = video.filename.replace(/\.[^/.]+$/, '.jpg')
        return `/api/proxy/thumbnails/${thumbName}`
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold">Add from Media Library</h2>
                    <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search videos..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-secondary border-border"
                        />
                    </div>
                </div>

                {/* Video Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : filteredVideos.length === 0 ? (
                        <div className="text-center py-12">
                            <Film className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-muted-foreground">
                                {videos.length === 0
                                    ? "No videos in library. Upload videos in the Media Library."
                                    : "All library videos are already in the playlist."}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {filteredVideos.map((video) => {
                                const isSelected = selectedIds.has(video.id)
                                return (
                                    <div
                                        key={video.id}
                                        onClick={() => toggleSelection(video.id)}
                                        className={`cursor-pointer rounded-lg border-2 overflow-hidden transition-all ${isSelected
                                                ? "border-primary ring-2 ring-primary/20"
                                                : "border-border hover:border-primary/50"
                                            }`}
                                    >
                                        <div className="relative aspect-video bg-secondary">
                                            <img
                                                src={getThumbnailSrc(video)}
                                                alt={video.title}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none'
                                                }}
                                            />
                                            {isSelected && (
                                                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                                                        <Check className="w-5 h-5 text-primary-foreground" />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-xs text-white">
                                                {video.duration}
                                            </div>
                                        </div>
                                        <div className="p-2">
                                            <p className="text-sm font-medium truncate">{video.title}</p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-border">
                    <span className="text-sm text-muted-foreground">
                        {selectedIds.size} video{selectedIds.size !== 1 ? "s" : ""} selected
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={handleAddSelected} disabled={selectedIds.size === 0}>
                            Add to Playlist
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
