"use client"

import { useEffect, useState } from "react"
import { Menu, X, Github, ExternalLink, Bell, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { kpiSnapshot, fmtInt } from "@/lib/cascade-data"

interface NavItem {
  id: string
  label: string
  description: string
}

interface TopbarProps {
  active: string
  nav: NavItem[]
  onNavigate: (id: any) => void
}

export function Topbar({ active, nav, onNavigate }: TopbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const activeItem = nav.find((n) => n.id === active)

  useEffect(() => {
    // Initial tick to populate `now` after mount (avoids SSR hydration mismatch),
    // then refresh every second. The synchronous setState is acceptable here
    // because the state starts as null and this only fires once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
        {/* Mobile menu */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base md:text-lg font-semibold tracking-tight truncate">
              {activeItem?.label ?? "Overview"}
            </h1>
            <span className="hidden md:inline text-xs text-muted-foreground truncate">
              {activeItem?.description}
            </span>
          </div>
        </div>

        {/* Live counter — tokens saved */}
        <div className="hidden md:flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.18_162)] animate-pulse" />
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Tokens saved
          </span>
          <span className="text-sm font-mono font-semibold text-[oklch(0.72_0.18_162)] tabular-nums">
            {fmtInt(kpiSnapshot.tokensSaved)}
          </span>
        </div>

        {/* Clock — only render after mount to avoid SSR hydration mismatch */}
        {now && (
          <div className="hidden xl:flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
              UTC
            </span>
            <span className="text-sm font-mono tabular-nums">
              {now.toISOString().slice(11, 19)}
            </span>
          </div>
        )}

        {/* Actions */}
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </Button>
        <Button variant="outline" size="sm" className="hidden md:inline-flex" asChild>
          <a
            href="https://lablab.ai"
            target="_blank"
            rel="noreferrer noopener"
            className="gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Submit
          </a>
        </Button>
        <Button variant="default" size="sm" className="gap-1.5" asChild>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer noopener"
            className="gap-1.5"
          >
            <Github className="h-3.5 w-3.5" />
            Repo
          </a>
        </Button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-sidebar/95 backdrop-blur-xl p-2 space-y-0.5">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id)
                setMobileOpen(false)
              }}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left",
                active === item.id
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40"
              )}
            >
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
