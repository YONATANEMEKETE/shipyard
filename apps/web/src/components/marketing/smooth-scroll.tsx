'use client';

import { ReactLenis, type LenisRef } from 'lenis/react';
import 'lenis/dist/lenis.css';
import { cancelFrame, frame } from 'motion/react';
import { useEffect, useRef } from 'react';

/**
 * Smooth scrolling for the marketing surface.
 *
 * Lenis is mounted here rather than in the root layout on purpose: it is the
 * landing page's feel, and the product's own surfaces (boards, lists, dialogs)
 * should scroll the way the platform scrolls them. The shell that renders this
 * is the marketing layout, so nothing inside a workspace ever sees it.
 *
 * The scroll loop and motion's animation loop are the *same* loop. `frame` is
 * motion's own ticker (`frame.update(update, true)` keeps it alive), and Lenis
 * is stepped from inside it with `autoRaf: false` so it does not also run a
 * `requestAnimationFrame` of its own. Two independent loops is what makes a
 * smooth scroll shake as it settles: motion's in-view entrances and Lenis's
 * scroll write then land on different frames, so the page is painted with one
 * frame's scroll offset and the other's animation state. This is the
 * integration `lenis/react` documents for Framer Motion.
 *
 * `respectReducedMotion` is on by default: with `prefers-reduced-motion: reduce`
 * the library drops its smoothing and jumps programmatically, so this needs no
 * reduced-motion branch of its own. `data-lenis-prevent` is the documented
 * escape hatch for anything that has to scroll itself.
 *
 * The stylesheet is imported here because its rules only matter where an
 * instance exists: `html.lenis` height, and the `lenis-stopped` / iframe rules.
 * `ReactLenis` with `root` renders nothing of its own (the document is the
 * scroll container), so it adds no element to the layout.
 */
export function SmoothScroll() {
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    function update(data: { timestamp: number }) {
      lenisRef.current?.lenis?.raf(data.timestamp);
    }

    frame.update(update, true);

    return () => cancelFrame(update);
  }, []);

  return <ReactLenis root options={{ autoRaf: false }} ref={lenisRef} />;
}
