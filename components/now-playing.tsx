"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Video, SkipForward } from "lucide-react"

interface NowPlayingVideo {
    id: string
    title: string
    thumbnail: string
    duration: string
    filename: string
}

interface NowPlayingData {
    current: NowPlayingVideo | null
    next: NowPlayingVideo | null
    index: number
    total: number
    isStreaming: boolean
    startedAt: string | null
}

interface NowPlayingProps {
    isLive: boolean
}

export function NowPlaying({ isLive }: NowPlayingProps) {
    const [data, setData] = useState<NowPlayingData | null>(null)

    useEffect(() => {
        if (!isLive) {
            setData(null)
            return
        }

        const fetchNowPlaying = async () => {
            try {
                const res = await fetch('/api/proxy/now-playing')
                if (res.ok) {
                    const nowPlaying = await res.json()
                    setData(nowPlaying)
                }
            } catch (error) {
                console.error('Error fetching now playing:', error)
            }
        }

        // Initial fetch
        fetchNowPlaying()

        // Poll every 5 seconds
        const interval = setInterval(fetchNowPlaying, 5000)

        return () => clearInterval(interval)
    }, [isLive])

    if (!isLive || !data?.isStreaming) {
        return null
    }

    const getThumbnailSrc = (thumbnail: string | undefined) => {
        if (!thumbnail) return null
        if (thumbnail.startsWith('https://stream.musicalbasics.com')) {
            return thumbnail.replace('https://stream.musicalbasics.com', '/api/proxy')
        } else if (thumbnail.startsWith('http://62.146.175.144:3000')) {
            return thumbnail.replace('http://62.146.175.144:3000', '/api/proxy')
        } else if (thumbnail.startsWith('/thumbnails/')) {
            return `/api/proxy${thumbnail}`
        } else if (!thumbnail.startsWith('http') && !thumbnail.startsWith('/')) {
            return `/api/proxy/thumbnails/${thumbnail}`
        }
        return thumbnail
    }

    return (
        <Card className="p-4 mb-4 bg-gradient-to-r from-primary/10 to-transparent border-primary/20">
            <div className="flex items-center gap-6">
                {/* Now Playing */}
                <div className="flex items-center gap-3 flex-1">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-medium text-red-400 uppercase tracking-wide">Now Playing</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-16 h-10 rounded bg-secondary overflow-hidden flex-shrink-0">
                            {data.current?.thumbnail ? (
                                <img
                                    src={getThumbnailSrc(data.current.thumbnail) || undefined}
                                    alt={data.current.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Video className="w-4 h-4 text-muted-foreground" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{data.current?.title || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">{data.current?.duration || '--:--'}</p>
                        </div>
                    </div>
                </div>

                {/* Up Next */}
                {data.next && (
                    <div className="flex items-center gap-3 opacity-70">
                        <SkipForward className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Up next:</span>
                        <div className="w-12 h-8 rounded bg-secondary overflow-hidden flex-shrink-0">
                            {data.next.thumbnail ? (
                                <img
                                    src={getThumbnailSrc(data.next.thumbnail) || undefined}
                                    alt={data.next.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Video className="w-3 h-3 text-muted-foreground" />
                                </div>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate max-w-[150px]">{data.next.title}</p>
                    </div>
                )}

                {/* Progress indicator */}
                <div className="text-xs text-muted-foreground">
                    {data.index + 1} / {data.total}
                </div>
            </div>
        </Card>
    )
}
