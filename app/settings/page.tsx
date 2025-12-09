"use client"
import { Sidebar } from "@/components/sidebar"
import { StreamSettingsForm } from "@/components/stream-settings-form"

export default function SettingsPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-8">
          <StreamSettingsForm />
        </main>
      </div>
    </div>
  )
}
