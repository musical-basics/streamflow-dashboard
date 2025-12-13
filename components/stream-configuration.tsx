"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Play, Square, Volume2, Music, Eye, EyeOff, Upload, Loader2, Check } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface AudioOverlayCardProps {
  audioEnabled: boolean
  audioVolume: number
  audioFile: string | null
  onAudioEnabledChange: (value: boolean) => void
  onAudioVolumeChange: (value: number) => void
  onAudioFileChange: (file: string | null) => void
}

function AudioOverlayCard({
  audioEnabled,
  audioVolume,
  audioFile,
  onAudioEnabledChange,
  onAudioVolumeChange,
  onAudioFileChange,
}: AudioOverlayCardProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('audio/')) {
      toast({
        title: "Invalid File",
        description: "Please upload an audio file (MP3, WAV, etc.)",
        variant: "destructive"
      })
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    // VPS URL for direct upload (bypasses Vercel proxy to avoid timeout/size limits)
    const VPS_URL = 'https://stream.musicalbasics.com'

    try {
      const formData = new FormData()
      formData.append('audio', file)

      // Use XMLHttpRequest for progress tracking
      await new Promise<void>((resolve, reject) => {
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
              const responseData = JSON.parse(xhr.responseText)
              // Update parent state with the returned filename
              onAudioFileChange(responseData.filename)

              toast({
                title: "Upload Complete",
                description: "Background audio has been updated!",
              })
              resolve()
            } catch (e) {
              // Fallback if parsing fails (though backend should return JSON)
              onAudioFileChange(file.name)
              resolve()
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

        xhr.addEventListener('error', () => reject(new Error('Upload failed')))
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

        xhr.open('POST', `${VPS_URL}/upload-audio`)
        xhr.send(formData)
      })
    } catch (error) {
      console.error('Audio upload error:', error)
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload audio",
        variant: "destructive"
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Music className="w-4 h-4 text-primary" />
          Background Audio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Rain Sounds</p>
              <p className="text-xs text-muted-foreground">
                {audioFile ? audioFile : "Looping audio overlay"}
              </p>
            </div>
          </div>
          <Switch checked={audioEnabled} onCheckedChange={onAudioEnabledChange} />
        </div>

        {/* Upload Section */}
        <div className="pt-2 border-t border-border">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
          />
          {isUploading ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleFileSelect}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Custom Audio
            </Button>
          )}
        </div>

        {/* Volume Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Volume</Label>
            <span className="text-xs text-muted-foreground">{audioVolume}%</span>
          </div>
          <Slider
            value={[audioVolume]}
            onValueChange={(v) => onAudioVolumeChange(v[0])}
            max={100}
            step={1}
            disabled={!audioEnabled}
            className="w-full"
          />
        </div>
      </CardContent>
    </Card>
  )
}


interface StreamConfigProps {
  isLive: boolean
  streamKey: string
  rtmpUrl: string
  bitrate: number
  audioEnabled: boolean
  audioVolume: number
  audioFile: string | null
  onStreamKeyChange: (value: string) => void
  onRtmpUrlChange: (value: string) => void
  onBitrateChange: (value: number) => void
  onAudioEnabledChange: (value: boolean) => void
  onAudioVolumeChange: (value: number) => void
  onAudioFileChange: (file: string | null) => void
  onStartStream: () => void
  onStopStream: () => void
}

export function StreamConfiguration({
  isLive,
  streamKey,
  rtmpUrl,
  bitrate,
  audioEnabled,
  audioVolume,
  audioFile,
  onStreamKeyChange,
  onRtmpUrlChange,
  onBitrateChange,
  onAudioEnabledChange,
  onAudioVolumeChange,
  onAudioFileChange,
  onStartStream,
  onStopStream,
}: StreamConfigProps) {
  const [showStreamKey, setShowStreamKey] = useState(false)

  return (
    <div className="flex flex-col h-full gap-4">
      <h3 className="text-lg font-semibold text-foreground">Stream Configuration</h3>

      {/* Preview Window */}
      <Card className="overflow-hidden">
        <div className="aspect-video bg-secondary flex items-center justify-center relative">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Play className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Stream Preview</p>
          </div>
          {isLive && (
            <div className="absolute top-3 left-3 flex items-center gap-2 px-2 py-1 rounded bg-red-500 text-white text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              LIVE
            </div>
          )}
        </div>
      </Card>

      {/* Audio Overlay */}
      <AudioOverlayCard
        audioEnabled={audioEnabled}
        audioVolume={audioVolume}
        audioFile={audioFile}
        onAudioEnabledChange={onAudioEnabledChange}
        onAudioVolumeChange={onAudioVolumeChange}
        onAudioFileChange={onAudioFileChange}
      />

      {/* Stream Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Stream Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rtmp-url" className="text-xs text-muted-foreground">
              RTMP URL
            </Label>
            <Input
              id="rtmp-url"
              value={rtmpUrl}
              onChange={(e) => onRtmpUrlChange(e.target.value)}
              placeholder="rtmp://live.example.com/stream"
              className="bg-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stream-key" className="text-xs text-muted-foreground">
              Stream Key
            </Label>
            <div className="relative">
              <Input
                id="stream-key"
                type={showStreamKey ? "text" : "password"}
                value={streamKey}
                onChange={(e) => onStreamKeyChange(e.target.value)}
                placeholder="Enter your stream key"
                className="bg-input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowStreamKey(!showStreamKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showStreamKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bitrate" className="text-xs text-muted-foreground">
              Bitrate: {bitrate} Kbps
            </Label>
            <Slider
              id="bitrate"
              value={[bitrate]}
              onValueChange={(v) => onBitrateChange(v[0])}
              min={1000}
              max={12000}
              step={500}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3 mt-auto">
        <Button onClick={onStartStream} disabled={isLive} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
          <Play className="w-4 h-4 mr-2" />
          Start Stream
        </Button>
        <Button onClick={onStopStream} disabled={!isLive} variant="destructive" className="flex-1">
          <Square className="w-4 h-4 mr-2" />
          Stop Stream
        </Button>
      </div>
    </div>
  )
}
