"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { CheckSquare, Youtube, Info, Split, X } from "lucide-react"

const TAG_COLORS: Record<string, string> = {
  "beautiful classical": "bg-yellow-600",
  "ludovico einaudi": "bg-emerald-600",
  meditation: "bg-orange-500",
  piano: "bg-cyan-600",
  prayer: "bg-rose-600",
  relaxation: "bg-purple-600",
  work: "bg-lime-600",
  yiruma: "bg-gray-500",
}

export function StreamSettingsForm() {
  const [streamName, setStreamName] = useState("24/7 Amazing Piano Music For Work, Relaxation And P")
  const [platform, setPlatform] = useState("youtube")
  const [resolution, setResolution] = useState("1080p-horizontal")
  const [frameRate, setFrameRate] = useState("30")
  const [sourceUrl, setSourceUrl] = useState("rtmp://a.rtmp.youtube.com/live2")
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [videoBitrate, setVideoBitrate] = useState("8000")
  const [audioBitrate, setAudioBitrate] = useState("128")
  const [tags, setTags] = useState([
    "beautiful classical",
    "ludovico einaudi",
    "meditation",
    "piano",
    "prayer",
    "relaxation",
    "work",
    "yiruma",
  ])

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Stream Settings</h1>
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
            <CheckSquare className="w-4 h-4 mr-2" />
            Stream builder
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Youtube className="w-4 h-4 mr-2" />
            Convert to YouTube Connect
          </Button>
        </div>
      </div>

      {/* General Section */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <h2 className="text-lg font-medium text-foreground mb-1">General</h2>
          <p className="text-sm text-muted-foreground mb-6">Configure your stream settings and connection details.</p>

          {/* Important Notice */}
          <div className="flex items-start gap-4 p-4 rounded-lg bg-violet-950/50 border border-violet-800/30 mb-6">
            <div className="w-10 h-10 rounded-lg bg-violet-900/50 flex items-center justify-center flex-shrink-0">
              <Info className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-violet-300">
                Important <span className="text-violet-500 ml-1">↗</span>
              </p>
              <p className="text-sm text-orange-400">
                Learn how to start a permanent 24/7 permanent 24/7 YouTube livestream
              </p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-6">
            {/* Stream Name */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Stream name (required)</Label>
              <Input
                value={streamName}
                onChange={(e) => setStreamName(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>

            {/* Platform */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">Youtube</SelectItem>
                  <SelectItem value="twitch">Twitch</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="custom">Custom RTMP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Resolution */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Resolution & Orientation</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080p-horizontal">1080p (Horizontal)</SelectItem>
                  <SelectItem value="1080p-vertical">1080p (Vertical)</SelectItem>
                  <SelectItem value="720p-horizontal">720p (Horizontal)</SelectItem>
                  <SelectItem value="720p-vertical">720p (Vertical)</SelectItem>
                  <SelectItem value="480p-horizontal">480p (Horizontal)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Frame Rate */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Frame rate (FPS)</Label>
              <Input
                value={frameRate}
                onChange={(e) => setFrameRate(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>

            {/* Source URL */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Source URL</Label>
              <Select value={sourceUrl} onValueChange={setSourceUrl}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rtmp://a.rtmp.youtube.com/live2">rtmp://a.rtmp.youtube.com/live2</SelectItem>
                  <SelectItem value="rtmp://b.rtmp.youtube.com/live2">rtmp://b.rtmp.youtube.com/live2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* YouTube Livestream URL */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">YouTube Livestream URL (optional)</Label>
              <Input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder=""
                className="bg-secondary border-border"
              />
              <a href="#" className="text-sm text-violet-400 hover:text-violet-300 underline">
                Where do I find my YouTube Livestream URL?
              </a>
            </div>

            {/* Video Bitrate */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Video bitrate (kbps)</Label>
              <Input
                value={videoBitrate}
                onChange={(e) => setVideoBitrate(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>

            {/* Audio Bitrate */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Audio bitrate (kbps)</Label>
              <Input
                value={audioBitrate}
                onChange={(e) => setAudioBitrate(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
          </div>

          {/* Tags Section */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Label className="text-sm text-muted-foreground">Tags (on Upstream)</Label>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm text-white ${TAG_COLORS[tag] || "bg-gray-600"}`}
                >
                  <span className="w-2.5 h-2.5 rounded bg-white/30" />
                  {tag}
                  <button onClick={() => removeTag(tag)} className="ml-1 hover:bg-white/20 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Stream Key Update */}
          <div className="mt-6 p-4 rounded-lg bg-secondary/50 flex items-center gap-3">
            <Button className="bg-violet-600 hover:bg-violet-700 text-white">Click Here</Button>
            <span className="text-sm text-muted-foreground">to update your stream key</span>
          </div>
        </CardContent>
      </Card>

      {/* Multistreaming Section */}
      <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Multistreaming</h2>
      <Card className="bg-card border-border">
        <CardContent className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center mb-6">
              <Split className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No multistreams added yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Multistreaming allows you to broadcast to multiple platforms simultaneously from a single stream source.
            </p>
            <Button className="mt-6 bg-violet-600 hover:bg-violet-700 text-white">Add Multistream</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
