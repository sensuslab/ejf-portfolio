import { useEffect, useMemo, useRef, useState } from 'react';
import { Glass, glassValue } from '@samasante/liquid-glass';

/**
 * CursorGlass — demo-faithful liquid-glass loupe from glass.samasante.com,
 * tuned to be more legible and to fade out when the cursor rests.
 *
 * Wiring mirrors the demo's GlassDemo.tsx exactly:
 *   <Glass refract={<PageScene />} pixelUnits behind={pageBg}
 *          center={{ x: mv, y: mv }} width={...} height={...} radius={...}
 *          style={{ position:'absolute', inset:0 }} />
 *
 * Adjustments on top of the demo:
 *  - Round, thick 192 x 192 lens (r=96) — 20% smaller than 240, still
 *    substantial enough to read as solid glass material
 *  - Subtle white tint veil via unstable_lens so the material registers
 *    clearly against the dark hero / section gradients
 *  - Opacity fades out 500ms after the cursor stops moving, fades back in
 *    instantly on the next move (no drift-in from centre, no jump)
 */

// ── Lens geometry (round, 20% smaller than the previous 240) ──────────────
const LENS_SIZE = 192; // full px — round, thick
const LENS_RADIUS = LENS_SIZE / 2;

// ── Optics: verbatim from the demo's DEFAULT_LENS ─────────────────────────
const DEMO_OPTICS = {
  // shape
  mapSize: 512,
  clipToShape: true,
  softEdge: true,
  splay: 0,
  sheenAngle: 0,
  sheenDark: false,
  // edge / meniscus
  bend: 0.4,
  bendWidth: 0.07,
  // refraction
  depth: 0.95,
  curvature: 0.5,
  dispersion: 0.2,
  strength: 0.14,
  // background
  frost: 1,
  brightness: 0,
  // specular
  specular: 1.55,
  sheen: 1.2,
  sheenWidth: 3.5,
  sheenFalloff: 1.7,
  // glow
  glow: 0.1,
  glowSpread: 1,
  glowFalloff: 0.6,
} as const;

/**
 * The <Scene> the lens refracts. Demo pattern: page bg + dot grid +
 * content, so the refracted copy reads as a real page.
 */
function PageScene() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        backgroundColor: '#0A0A0C',
        backgroundImage: [
          // Dot grid (matches the demo's anchor pattern)
          'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
          // Hero purple bloom (top-right)
          'radial-gradient(50% 50% at 80% 20%, rgba(43, 42, 99, 0.55) 0%, transparent 60%)',
          // Hero orange bloom (bottom-left)
          'radial-gradient(40% 40% at 10% 90%, rgba(217, 122, 74, 0.32) 0%, transparent 60%)',
          // Subtle teal sheen (centre, very faint)
          'radial-gradient(60% 60% at 50% 50%, rgba(63, 184, 176, 0.10) 0%, transparent 70%)',
        ].join(', '),
        backgroundSize: '23px 23px, 100% 100%, 100% 100%, 100% 100%',
      }}
    >
      {/* Ghost type — a few dim headlines so the refracted copy reads
          as a page-with-content rather than a flat field. */}
      <div
        style={{
          position: 'absolute',
          left: '6%',
          top: '32%',
          color: 'rgba(245, 245, 240, 0.22)',
          fontFamily: 'ui-serif, Georgia, serif',
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: 'clamp(40px, 7vw, 88px)',
          lineHeight: 0.95,
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        Unique perspectives,
      </div>
      <div
        style={{
          position: 'absolute',
          left: '6%',
          top: '44%',
          color: 'rgba(245, 245, 240, 0.18)',
          fontFamily: 'ui-serif, Georgia, serif',
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: 'clamp(40px, 7vw, 88px)',
          lineHeight: 0.95,
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        built with intent.
      </div>
      <div
        style={{
          position: 'absolute',
          right: '8%',
          top: '18%',
          color: 'rgba(217, 122, 74, 0.28)',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          fontWeight: 500,
          fontSize: '11px',
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        Accepting clients
      </div>
      <div
        style={{
          position: 'absolute',
          left: '6%',
          bottom: '12%',
          color: 'rgba(245, 245, 240, 0.12)',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          fontWeight: 400,
          fontSize: '14px',
          lineHeight: 1.55,
          maxWidth: '38ch',
          userSelect: 'none',
        }}
      >
        AI consulting, design &amp; deployment. Operating as OpusAI, the
        applied arm of Sensus InVista.
      </div>
    </div>
  );
}

// Fade-out grace period after the cursor stops moving.
const IDLE_FADE_MS = 500;
// Fade-in is instant (no animation) so the loupe pops into view under
// the cursor. Fade-out is smooth so it doesn't snap away.
const FADE_OUT_MS = 350;

/**
 * The loupe. Cursor following uses the demo's pattern (glassValue motion
 * values for centre, eased via rAF). Adds an opacity fade-out after the
 * cursor rests — pointer-events: none keeps it harmless whether visible
 * or not.
 */
export function CursorGlass() {
  const x = useMemo(() => glassValue(0.5), []);
  const y = useMemo(() => glassValue(0.5), []);
  const targetRef = useRef({ x: 0.5, y: 0.5 });
  const visibleRef = useRef(false);
  const enabledRef = useRef(true);

  // 1 = visible, 0 = hidden. Driven by the cursor-rest timer below.
  const [opacity, setOpacity] = useState(0);
  const fadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      enabledRef.current = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }
  }, []);

  // rAF loop: ease centre towards the cursor target.
  useEffect(() => {
    if (!enabledRef.current) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cx = x.get();
      const cy = y.get();
      const tx = targetRef.current.x;
      const ty = targetRef.current.y;
      const ease = 0.3;
      const nx = cx + (tx - cx) * ease;
      const ny = cy + (ty - cy) * ease;
      if (Math.abs(nx - cx) > 0.0003 || Math.abs(ny - cy) > 0.0003) {
        x.set(nx);
        y.set(ny);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [x, y]);

  // Track the cursor: 0..1 fraction of the viewport, plus the idle fade.
  useEffect(() => {
    if (!enabledRef.current) return;
    const onMove = (e: PointerEvent) => {
      const tx = e.clientX / window.innerWidth;
      const ty = e.clientY / window.innerHeight;
      targetRef.current = { x: tx, y: ty };
      if (!visibleRef.current) {
        x.set(tx);
        y.set(ty);
        visibleRef.current = true;
      }
      // Show the loupe, schedule the fade-out.
      setOpacity(1);
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
      fadeTimerRef.current = window.setTimeout(() => {
        setOpacity(0);
        fadeTimerRef.current = null;
      }, IDLE_FADE_MS);
    };
    const onLeave = () => {
      // Cursor left the window — hide immediately so the loupe
      // doesn't sit orphaned at the last edge position.
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      setOpacity(0);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
    };
  }, [x, y]);

  if (!enabledRef.current) return null;

  return (
    <div
      aria-hidden
      data-cursor-glass=""
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 60,
        // Instant fade-in (the loupe pops under the cursor), smooth fade-out
        // when the cursor rests. The 0ms side preserves snappy re-entry.
        opacity,
        transition: opacity === 0
          ? `opacity ${FADE_OUT_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
          : 'opacity 0ms linear',
      }}
    >
      <Glass
        refract={<PageScene />}
        pixelUnits
        behind="#0A0A0C"
        optics={DEMO_OPTICS}
        center={{ x, y }}
        width={LENS_SIZE}
        height={LENS_SIZE}
        radius={LENS_RADIUS}
        // Subtle white tint veil — makes the material register clearly
        // against the dark hero / section gradients without overcooking it.
        unstable_lens={{
          tintColor: 'white',
          tintOpacity: 0.06,
          tintBlur: 0,
          restShadowOpacity: 1,
          edgeBias: 0.5,
        }}
        style={{ position: 'absolute', inset: 0 }}
      />
    </div>
  );
}
