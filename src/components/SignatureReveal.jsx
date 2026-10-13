import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { animate, useMotionValue, useReducedMotion } from 'framer-motion';
// Transparent cutout of pen.jpg (studio gray keyed out, cropped, 227×420)
import penSrc from '../assets/pen-cutout.png';
import './SignatureReveal.css';

/*
 * A name "signed" in script, left to right, by a fountain pen.
 *
 * SVG <text> has no centreline to follow, so a writing path is built from
 * the rendered ink: the name is drawn once to an offscreen canvas and, column
 * by column, the path follows the ink stroke nearest its previous point. That
 * becomes a real <path>; each frame the pen's nib sits exactly at
 * getPointAtLength() on it, and the ink is revealed up to the nib — so the
 * nib is always at the end of the ink trail and finishes on the last pixel
 * of the final letter.
 *
 * Pace: progress is re-timed by the path's curvature, so the pen slows
 * through loops and flourishes (the capital G, the N) and moves faster on
 * flatter runs, under an overall gentle ease.
 *
 * Reduced motion: the signature appears complete, no drawing and no pen.
 */
const FONT = 'Alex Brush';
const FONT_STACK = `"${FONT}", "Pinyon Script", cursive`;
const FONT_SIZE = 64;
const PAD = 10; // room for swashes and the rough edge
const EDGE = 5; // soft tip of the ink trail at the nib (user units)
const FILL_LAG = 36; // ink fills in this far behind the traced outline
const DASH = 900; // longer than any single glyph outline
const EASE_PACE = [0.4, 0, 0.6, 1];
const CURVE_SLOW = 7; // how much the pen slows per radian of turning

// Nib tip in the cutout, as a fraction of its size (measured when keying)
const PEN = { w: 227, h: 420, tipX: 0.0187, tipY: 0.9989 };
const PEN_HEIGHT = 1.5; // × the signature's box height
const PEN_LEAD = 0.15; // pen fades in this long before the first stroke
const PEN_REST = 0.35; // pen rests on the last letter before lifting
const PEN_LIFT = 0.35; // lift-and-fade
const MAX_TILT = 10; // degrees either way from the photographed angle
const TILT_FOLLOW = 0.25; // share of the stroke's direction the pen follows
const TILT_SMOOTH_MS = 140; // time constant of the tilt's easing

const SAMPLE = 2; // canvas px per user unit when tracing the ink
const LUT = 400; // samples along the path for curvature pacing

/* Points of a left-to-right path that stays on the ink */
function traceInk(name, box) {
  const cw = Math.ceil(box.w * SAMPLE);
  const ch = Math.ceil(box.h * SAMPLE);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.setTransform(SAMPLE, 0, 0, SAMPLE, -box.x * SAMPLE, -box.y * SAMPLE);
  ctx.font = `${FONT_SIZE}px ${FONT_STACK}`;
  ctx.fillText(name, 0, 0);
  const { data } = ctx.getImageData(0, 0, cw, ch);

  const pts = [];
  let prevY = null;
  for (let u = 0; u < Math.floor(box.w); u++) {
    const cx = Math.min(cw - 1, Math.round((u + 0.5) * SAMPLE));
    // Vertical runs of ink in this column, as centre y in user units
    const runs = [];
    let start = -1;
    for (let cy = 0; cy <= ch; cy++) {
      const ink = cy < ch && data[(cy * cw + cx) * 4 + 3] > 96;
      if (ink && start < 0) start = cy;
      else if (!ink && start >= 0) {
        runs.push({ y: box.y + (start + cy - 1) / 2 / SAMPLE, len: cy - start });
        start = -1;
      }
    }
    if (!runs.length) continue;
    // Stay on the same stroke: nearest run to where the pen just was
    const pick =
      prevY === null
        ? runs.reduce((a, b) => (b.len > a.len ? b : a))
        : runs.reduce((a, b) => (Math.abs(b.y - prevY) < Math.abs(a.y - prevY) ? b : a));
    pts.push([box.x + u + 0.5, pick.y]);
    prevY = pick.y;
  }
  if (pts.length < 2) return null;

  // Light smoothing so jumps between strokes become short slants
  return pts.map(([x], i) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(pts.length - 1, i + 2); k++) {
      s += pts[k][1];
      n++;
    }
    return [x, s / n];
  });
}

const toPathData = (pts) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`;

/*
 * Map overall progress (0–1) to a length along the path, spending more time
 * where the path turns. Built once from LUT samples of getPointAtLength.
 */
function curvaturePacing(path) {
  const total = path.getTotalLength();
  const pts = [];
  for (let i = 0; i <= LUT; i++) pts.push(path.getPointAtLength((total * i) / LUT));
  const cost = new Float64Array(LUT + 1);
  let prevAngle = null;
  for (let i = 1; i <= LUT; i++) {
    const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    let turn = 0;
    if (prevAngle !== null) {
      turn = Math.abs(a - prevAngle);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
    }
    prevAngle = a;
    cost[i] = cost[i - 1] + 1 + CURVE_SLOW * turn;
  }
  return {
    total,
    lengthAt(v) {
      if (v <= 0) return 0;
      if (v >= 1) return total;
      const target = v * cost[LUT];
      let lo = 0;
      let hi = LUT;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cost[mid] < target) lo = mid;
        else hi = mid;
      }
      const f = (target - cost[lo]) / (cost[hi] - cost[lo] || 1);
      return (total * (lo + f)) / LUT;
    },
  };
}

export default function SignatureReveal({ name, duration = 4, delay = 0.35, onComplete, className = '' }) {
  const reduce = useReducedMotion();
  const id = useId().replace(/:/g, '');
  const measureRef = useRef(null);
  const [geo, setGeo] = useState(null);
  const doneRef = useRef(false);

  const trackRef = useRef(null);
  const outlineMaskRef = useRef(null);
  const fillMaskRef = useRef(null);
  const outlineRef = useRef(null);
  const penRef = useRef(null);

  const progress = useMotionValue(0);
  const settle = useMotionValue(0); // opens the masks fully once written
  const penOpacity = useMotionValue(0);
  const lift = useMotionValue(0);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete?.();
  };

  // Measure the text and trace its ink with the script font actually loaded
  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled || !measureRef.current) return;
      const b = measureRef.current.getBBox();
      const box = { x: b.x - PAD, y: b.y - PAD, w: b.width + PAD * 2, h: b.height + PAD * 2 };
      const pts = traceInk(name, box);
      setGeo({ box, d: pts ? toPathData(pts) : null });
    };
    const fonts = document.fonts;
    if (fonts?.load) fonts.load(`${FONT_SIZE}px "${FONT}"`, name).then(measure, measure);
    else measure();
    return () => {
      cancelled = true;
    };
  }, [name]);

  // Run the signing: one progress value drives masks, outline and pen
  useEffect(() => {
    if (!geo) return undefined;
    const track = trackRef.current;
    if (reduce || !track) {
      finish();
      return undefined;
    }

    const { box } = geo;
    const right = box.x + box.w;
    const penH = box.h * PEN_HEIGHT;
    const pace = curvaturePacing(track);
    let tilt = null;
    let lastT = 0;

    // A mask rect is white up to its edge, then fades to black over EDGE
    const placeEdge = (rect, edgeX) => rect?.setAttribute('x', edgeX - box.w);

    const apply = () => {
      const v = progress.get();
      const s = settle.get();
      const len = pace.lengthAt(v);
      const nib = track.getPointAtLength(len);

      // Ink up to the nib; the fill trails the outline, closing up at the end
      const lag = FILL_LAG * Math.min(1, (1 - v) * 6);
      placeEdge(outlineMaskRef.current, nib.x + (right - nib.x) * s);
      placeEdge(fillMaskRef.current, nib.x - lag + (right - nib.x + lag) * s);
      outlineRef.current?.setAttribute('stroke-dashoffset', DASH * (1 - v));

      // Tilt from the tangent (a point just ahead, or behind at the end),
      // eased over time so it never snaps
      const at = Math.max(0, Math.min(len, pace.total - 8));
      const from = track.getPointAtLength(at);
      const to = track.getPointAtLength(at + 8);
      const dir = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
      const target = Math.max(-MAX_TILT, Math.min(MAX_TILT, dir * TILT_FOLLOW));
      const now = performance.now();
      if (tilt === null) tilt = target;
      else tilt += (target - tilt) * (1 - Math.exp(-(now - lastT) / TILT_SMOOTH_MS));
      lastT = now;

      penRef.current?.setAttribute(
        'transform',
        `translate(${nib.x} ${nib.y + lift.get() * penH}) rotate(${tilt})`,
      );
    };
    const showPen = () => {
      if (penRef.current) penRef.current.style.opacity = penOpacity.get();
    };

    progress.set(0);
    settle.set(0);
    lift.set(0);
    penOpacity.set(0);
    apply();
    showPen();
    const unsubs = [
      progress.on('change', apply),
      settle.on('change', apply),
      lift.on('change', apply),
      penOpacity.on('change', showPen),
    ];

    const controls = [
      animate(penOpacity, 1, { duration: PEN_LEAD, delay: Math.max(0, delay - PEN_LEAD) }),
      animate(progress, 1, {
        duration,
        delay,
        ease: EASE_PACE,
        onComplete: () => {
          // Rest on the last letter (ink settles fully), then lift away
          controls.push(animate(settle, 1, { duration: PEN_REST, ease: 'easeOut' }));
          controls.push(
            animate(lift, -0.12, { duration: PEN_LIFT, delay: PEN_REST, ease: 'easeIn' }),
          );
          controls.push(
            animate(penOpacity, 0, {
              duration: PEN_LIFT,
              delay: PEN_REST,
              ease: 'easeIn',
              onComplete: finish,
            }),
          );
        },
      }),
    ];

    return () => {
      controls.forEach((c) => c.stop());
      unsubs.forEach((u) => u());
    };
  }, [geo, reduce]);

  const text = (props) => (
    <text x="0" y="0" fontFamily={FONT_STACK} fontSize={FONT_SIZE} {...props}>
      {name}
    </text>
  );

  if (!geo) {
    // Invisible measuring pass (keeps layout height roughly reserved)
    return (
      <svg className={`signature ${className}`} viewBox="0 -60 400 80" aria-hidden="true" focusable="false">
        {text({ ref: measureRef, fill: 'none' })}
      </svg>
    );
  }

  const { box } = geo;
  const penH = box.h * PEN_HEIGHT;
  const penW = (penH * PEN.w) / PEN.h;
  // No path (tracing failed) falls back to the finished signature
  const still = reduce || !geo.d;

  const sweepMask = (maskId, ref) => (
    <mask id={maskId} maskUnits="userSpaceOnUse" x={box.x} y={box.y} width={box.w} height={box.h}>
      {still ? (
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#fff" />
      ) : (
        <rect ref={ref} x={box.x - box.w} y={box.y} width={box.w + EDGE} height={box.h} fill={`url(#${id}-edge)`} />
      )}
    </mask>
  );

  return (
    <svg
      className={`signature ${className}`}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      style={{ aspectRatio: `${box.w} / ${box.h}` }}
      role="img"
      aria-label={`Signed: ${name}`}
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" />
          <stop offset={box.w / (box.w + EDGE)} stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        {sweepMask(`${id}-outline`, outlineMaskRef)}
        {sweepMask(`${id}-fill`, fillMaskRef)}
        <filter id={`${id}-ink`} x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" />
        </filter>
        <filter id={`${id}-pen-shadow`} x="-30%" y="-10%" width="160%" height="130%">
          <feDropShadow dx="3" dy="6" stdDeviation="4" floodColor="#020817" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* The writing path the nib follows (geometry only, never painted) */}
      {geo.d && <path ref={trackRef} className="signature__track" d={geo.d} />}

      <g filter={`url(#${id}-ink)`}>
        <g mask={`url(#${id}-fill)`}>{text({ className: 'signature__ink' })}</g>
        {!still && (
          <g mask={`url(#${id}-outline)`}>
            {text({ ref: outlineRef, className: 'signature__outline', strokeDasharray: DASH, strokeDashoffset: DASH })}
          </g>
        )}
      </g>

      {!still && (
        // Origin of this group is the nib tip; transform is set per frame
        <g ref={penRef} className="signature__pen" style={{ opacity: 0 }} aria-hidden="true">
          <image
            href={penSrc}
            x={-PEN.tipX * penW}
            y={-PEN.tipY * penH}
            width={penW}
            height={penH}
            filter={`url(#${id}-pen-shadow)`}
          />
        </g>
      )}
    </svg>
  );
}
