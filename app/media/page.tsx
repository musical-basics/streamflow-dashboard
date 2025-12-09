import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { MediaLibrary } from "@/components/media-library"

export default function MediaPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <MediaLibrary />
        </main>
      </div>
    </div>
  )
}
