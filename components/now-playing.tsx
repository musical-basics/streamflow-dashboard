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
        <div className="flex gap-3 mb-4">
            {/* Now Playing Card */}
            <Card className="p-3 flex-1 bg-gradient-to-r from-red-500/10 to-transparent border-red-500/20">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
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
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-0.5">Now Playing</p>
                        <p className="text-sm font-medium truncate">{data.current?.title || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{data.current?.duration || '--:--'}</p>
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0">
                        {data.index + 1}/{data.total}
                    </div>
                </div>
            </Card>

            {/* Up Next Card */}
            {data.next && (
                <Card className="p-3 flex-1 bg-gradient-to-r from-primary/5 to-transparent border-border/50">
                    <div className="flex items-center gap-3">
                        <SkipForward className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="w-16 h-10 rounded bg-secondary overflow-hidden flex-shrink-0">
                            {data.next.thumbnail ? (
                                <img
                                    src={getThumbnailSrc(data.next.thumbnail) || undefined}
                                    alt={data.next.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Video className="w-4 h-4 text-muted-foreground" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Up Next</p>
                            <p className="text-sm font-medium truncate">{data.next.title}</p>
                            <p className="text-xs text-muted-foreground">{data.next.duration}</p>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    )
}
