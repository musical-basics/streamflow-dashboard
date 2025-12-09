"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { PlaylistEditor, type VideoItem } from "@/components/playlist-editor"
import { StreamConfiguration } from "@/components/stream-configuration"
import { NowPlaying } from "@/components/now-playing"
import { supabase } from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"

const initialVideos: VideoItem[] = []

export default function Dashboard() {
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos)
  const [isLive, setIsLive] = useState(false)
  const [streamKey, setStreamKey] = useState("")
  const [rtmpUrl, setRtmpUrl] = useState("")
  const [bitrate, setBitrate] = useState(8000)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [audioVolume, setAudioVolume] = useState(35)
  const [configId, setConfigId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load configuration from Supabase on mount
  useEffect(() => {
    async function loadConfig() {
      setIsLoading(true)

      const { data, error } = await supabase
        .from('stream_config')
        .select('*')
        .single()

      if (error) {
        toast({
          title: "Error Loading Config",
          description: error.message,
          variant: "destructive"
        })
        setIsLoading(false)
        return
      }

      // Update state with database values
      setConfigId(data.id)
      setStreamKey(data.stream_key || "")
      setRtmpUrl(data.rtmp_url || "")
      setBitrate(data.bitrate || 8000)
      setAudioEnabled(data.audio_overlay_enabled ?? true)
      setAudioVolume(data.audio_volume || 35)
      setVideos(data.playlist || [])
      setIsLive(data.is_active || false)
      setIsLoading(false)
    }

    loadConfig()
  }, [])

  const handleReorder = (newVideos: VideoItem[]) => {
    setVideos(newVideos)
  }

  const handleDelete = (id: string) => {
    setVideos(videos.filter((v) => v.id !== id))
  }

  const handleUpload = (video: VideoItem) => {
    console.log('handleUpload called with:', video)
    setVideos((prevVideos) => {
      console.log('Previous videos:', prevVideos)
      const newVideos = [...prevVideos, video]
      console.log('New videos:', newVideos)
      return newVideos
    })
  }

  const handlePublish = async () => {
    console.log('Publish button clicked')
    console.log('configId:', configId)

    if (!configId) {
      console.log('No configId - showing error toast')
      toast({
        title: "Error",
        description: "Configuration not loaded yet.",
        variant: "destructive"
      })
      return
    }

    const { error } = await supabase
      .from('stream_config')
      .update({
        stream_key: streamKey,
        rtmp_url: rtmpUrl,
        bitrate,
        audio_overlay_enabled: audioEnabled,
        audio_volume: audioVolume,
        playlist: videos,
        updated_at: new Date().toISOString(),
      })
      .eq('id', configId)

    if (error) {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive"
      })
      return
    }

    // If stream is live, restart it to apply playlist changes
    if (isLive) {
      toast({
        title: "Restarting Stream",
        description: "Applying playlist changes..."
      })

      // Stop stream
      await supabase
        .from('stream_config')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', configId)

      // Wait for VPS to stop the stream
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Start stream again with new playlist
      await supabase
        .from('stream_config')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', configId)

      toast({
        title: "Stream Restarted",
        description: "Playlist changes are now live!"
      })
    } else {
      toast({
        title: "Success",
        description: "Configuration saved successfully!"
      })
    }
  }

  const handleStartStream = async () => {
    if (!configId) {
      toast({
        title: "Error",
        description: "Configuration not loaded yet.",
        variant: "destructive"
      })
      return
    }

    const { error } = await supabase
      .from('stream_config')
      .update({
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', configId)

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      })
    } else {
      setIsLive(true)
      toast({
        title: "Stream Started",
        description: "Your stream is now live!"
      })
    }
  }

  const handleStopStream = async () => {
    if (!configId) {
      toast({
        title: "Error",
        description: "Configuration not loaded yet.",
        variant: "destructive"
      })
      return
    }

    const { error } = await supabase
      .from('stream_config')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', configId)

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      })
    } else {
      setIsLive(false)
      toast({
        title: "Stream Stopped",
        description: "Your stream has ended."
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading configuration...</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header isLive={isLive} onPublish={handlePublish} />

        <main className="flex-1 flex overflow-hidden">
          {/* Left Panel - Playlist Editor */}
          <div className="w-1/2 border-r border-border p-6 overflow-hidden flex flex-col">
            <NowPlaying isLive={isLive} />
            <PlaylistEditor videos={videos} onReorder={handleReorder} onDelete={handleDelete} onUpload={handleUpload} />
          </div>

          {/* Right Panel - Stream Configuration */}
          <div className="w-1/2 p-6 overflow-y-auto">
            <StreamConfiguration
              isLive={isLive}
              streamKey={streamKey}
              rtmpUrl={rtmpUrl}
              bitrate={bitrate}
              audioEnabled={audioEnabled}
              audioVolume={audioVolume}
              onStreamKeyChange={setStreamKey}
              onRtmpUrlChange={setRtmpUrl}
              onBitrateChange={setBitrate}
              onAudioEnabledChange={setAudioEnabled}
              onAudioVolumeChange={setAudioVolume}
              onStartStream={handleStartStream}
              onStopStream={handleStopStream}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
