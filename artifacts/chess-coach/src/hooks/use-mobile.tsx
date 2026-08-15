import * as React from "react"

const MOBILE_BREAKPOINT = 768

function checkIsMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.innerWidth < MOBILE_BREAKPOINT
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(checkIsMobile)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    // Re-check on mount too — some mobile browsers report a transient/incorrect
    // viewport width on the very first paint before settling, so the
    // lazy-initial value above can occasionally still be wrong for a frame.
    onChange()
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
