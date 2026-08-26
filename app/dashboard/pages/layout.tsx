"use client"

// Layout for /dashboard/pages/**: fixed sidebar on desktop, drawer on mobile, both fed by a shared PageSidebarProvider cache.
import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { PanelLeft } from "lucide-react"
import {
  PageSidebar,
  PageSidebarProvider,
} from "@/components/pages/page-sidebar"

export default function PagesLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <PageSidebarProvider>
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        {/* Desktop sidebar */}
        <div className="hidden md:flex md:w-64 lg:w-72 shrink-0 sticky top-14 self-start h-[calc(100vh-3.5rem)]">
          <PageSidebar />
        </div>

        {/* Mobile drawer */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="md:hidden fixed bottom-4 left-4 z-40 h-11 w-11 rounded-full shadow-lg"
              aria-label="Open pages sidebar"
            >
              <PanelLeft className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="p-0 w-[85vw] max-w-[320px] flex flex-col"
          >
            <SheetTitle className="sr-only">Pages</SheetTitle>
            <PageSidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </PageSidebarProvider>
  )
}
