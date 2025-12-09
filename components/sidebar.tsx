"use client"

import { cn } from "@/lib/utils"
import { LayoutDashboard, FolderOpen, Settings, HelpCircle, ChevronDown } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/media", label: "Media Library", icon: FolderOpen },
  { href: "/settings", label: "Stream Settings", icon: Settings },
  { href: "/help", label: "Help Center", icon: HelpCircle },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col h-screen">
      <div className="p-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-foreground flex items-center justify-center">
            <span className="text-xs font-bold">⚡</span>
          </div>
          <span className="font-semibold text-foreground">upstream</span>
        </Link>
        <button className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <span className="text-xs">🌙</span>
        </button>
      </div>

      <nav className="flex-1 px-3 py-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-violet-600 text-white"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="px-3 pb-3">
        <div className="rounded-lg overflow-hidden bg-secondary">
          <div className="relative h-20 bg-gradient-to-r from-violet-600 to-pink-500">
            <span className="absolute top-2 left-2 text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-medium">
              NEW RELEASE
            </span>
            <div className="absolute bottom-2 left-2 text-[8px] text-white/80">
              Live Studio, Team Access
              <br />& 10+ Improvements
            </div>
          </div>
          <div className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">NOV, 07 2025</p>
            <p className="text-xs font-medium text-foreground">Live Studio and Team Access Updates</p>
            <div className="flex items-center gap-3 mt-2">
              <a href="#" className="text-[10px] text-violet-400 hover:text-violet-300">
                Read more →
              </a>
              <a href="#" className="text-[10px] text-muted-foreground hover:text-foreground">
                See all ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-sidebar-border">
        <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-secondary transition-colors">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-medium">
            LY
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-foreground">Lionel Yu</p>
            <p className="text-xs text-muted-foreground">Your account</p>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </aside>
  )
}
