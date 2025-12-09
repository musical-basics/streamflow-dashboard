"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface HeaderProps {
  isLive: boolean
  onPublish: () => void
}

export function Header({ isLive, onPublish }: HeaderProps) {
  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Stream Status:</span>
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
              isLive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400",
            )}
          >
            <span className={cn("w-2 h-2 rounded-full animate-pulse", isLive ? "bg-green-400" : "bg-red-400")} />
            {isLive ? "Live" : "Offline"}
          </div>
        </div>
      </div>

      <Button onClick={onPublish} className="bg-primary hover:bg-primary/90">
        Publish Changes
      </Button>
    </header>
  )
}
