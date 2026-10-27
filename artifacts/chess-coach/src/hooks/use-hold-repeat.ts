import { useCallback, useEffect, useRef } from 'react';

// Press and hold a button to repeat its action (e.g. the move arrows speed
// through the game). A tap steps once; holding steps again after a short
// pause and then keeps going, faster the longer you hold.
/** `step` returns false when it can't go any further (end of the game), which ends the hold. */
export function useHoldRepeat(step: (repeat: boolean) => boolean | void) {
  const stepRef = useRef(step);
  stepRef.current = step;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usedPointer = useRef(false);

  const stop = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      stop();
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, [stop]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    usedPointer.current = true;
    stop();
    stepRef.current(false);
    let n = 0;
    const tick = () => {
      timer.current = null;
      if (stepRef.current(true) === false) return;
      n++;
      timer.current = setTimeout(tick, n < 4 ? 160 : n < 12 ? 110 : 70);
    };
    timer.current = setTimeout(tick, 380);
  }, [stop]);

  // Keyboard (Enter/Space) still works; a pointer press already stepped.
  const onClick = useCallback(() => {
    if (usedPointer.current) { usedPointer.current = false; return; }
    stepRef.current(false);
  }, []);

  return {
    onPointerDown,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onClick,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    style: { touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties,
  };
}
