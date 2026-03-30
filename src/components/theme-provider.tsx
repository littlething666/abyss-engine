'use client'

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * next-themes injects a blocking inline script to avoid theme flash. React 19 logs a dev error for
 * `<script>` rendered from components even though SSR output is valid. Filter that single message.
 *
 * Only patch in the browser: mutating `console.error` during Node/RSC evaluation breaks Turbopack dev
 * (e.g. “Failed to load chunk server/chunks/ssr/…” when loading routes).
 * @see https://github.com/shadcn-ui/ui/issues/10104
 */
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const w = window as Window & { __abyssNextThemesScriptWarnFiltered?: boolean }
  if (!w.__abyssNextThemesScriptWarnFiltered) {
    w.__abyssNextThemesScriptWarnFiltered = true
    const orig = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      const first = args[0]
      if (
        typeof first === "string" &&
        first.includes("Encountered a script tag while rendering React component")
      ) {
        return
      }
      orig(...args)
    }
  }
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

