import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import envelopeSrc from '../assets/envelope.jpg';
// irislogo.png trimmed to its artwork (the original is 501×501, mostly empty)
import logoSrc from '../assets/irislogo-trimmed.png';
import { SHIELD_PATH, CHECK_PATH } from './ShieldMark.jsx';
import './Envelope.css';

/*
 * Animation state machine — strictly sequential:
 *   closed → cracking → sealOpening → flapOpening → cardRising → cardForward → open
 * Each phase starts only when the previous phase's animation reports
 * completion (onAnimationComplete). The envelope body never moves; only the
 * seal, then the flap, then the card.
 *
 * After `open`, clicking the card turns it over (rotateY) to the details/RSVP
 * face — one card with two faces, not a content swap.
 *
 * Envelope geometry is in percent of the full 736×920 photo, so every
 * clip-path and transform scales with the rendered size. Each photo layer is
 * a full-size copy of the image (uniform scale only); clip-paths pick out
 * the piece it shows.
 */
const PHASES = ['closed', 'cracking', 'sealOpening', 'flapOpening', 'cardRising', 'cardForward', 'open'];
const atLeast = (phase, target) => PHASES.indexOf(phase) >= PHASES.indexOf(target);

const IMG_W = 736;
const IMG_H = 920;

const TIMING = {
  crack: 0.25,
  seal: 0.4,
  flap: 0.7,
  // Card pull-out: ~720ms (≈780ms with frame overhead), split at the moment it clears the pocket.
  cardRise: 0.33,
  cardForward: 0.39,
  flip: 0.8,
};

// Landing reveal: logo leads, then the envelope, the invitation line, the button
const ENTRANCE = { duration: 0.6, lead: 0.12, stagger: 0.15 };
// Idle "breathing" on the seal while closed — barely perceptible
const SEAL_BREATH = { scale: [1, 1.015, 1], duration: 3 };

const EASE = [0.4, 0, 0.2, 1];
const EASE_OUT = [0.33, 0, 0.15, 1];
const EASE_FLAP = [0.55, 0, 0.3, 1];
const EASE_CARD_RISE = [0.4, 0, 0.6, 1];
const EASE_CARD_FORWARD = [0.2, 0.7, 0.25, 1];

// Envelope body inside the photo: inset(26.8% 10.7% 28% 10.7%)
const CLIP_WHOLE = 'inset(26.8% 10.7% 28% 10.7%)';

/*
 * Flap and pocket, traced from the photo (px → %):
 *   flap tip (366,520) → 49.73% 56.52%
 *   left diagonal  (85,262) → (280,456) → (345,514)
 *   right diagonal (651,262) → (440,468) → (388,514)
 * The pocket is the envelope minus the flap, sharing its edges exactly.
 */
const CLIP_FLAP =
  'polygon(10.7% 26.8%, 89.3% 26.8%, 88.45% 28.48%, 59.78% 50.87%, 52.72% 55.87%, ' +
  '49.73% 56.52%, 46.88% 55.87%, 38.04% 49.57%, 11.55% 28.48%)';
const CLIP_POCKET =
  'polygon(10.7% 26.8%, 11.55% 28.48%, 38.04% 49.57%, 46.88% 55.87%, 49.73% 56.52%, ' +
  '52.72% 55.87%, 59.78% 50.87%, 88.45% 28.48%, 89.3% 26.8%, 89.3% 72%, 10.7% 72%)';
// Same flap outline in image px, for the flap's inside face
const FLAP_POINTS = '79,247 657,247 651,262 440,468 388,514 366,520 345,514 280,456 85,262';
// Hinge: the envelope's top edge, where the flap folds back
const FLAP_HINGE = '50% 26.8%';

// Seal: centre (367,489) → 49.9% 53.2%; radius 66px. circle() percentages
// resolve against √(w²+h²)/√2 = 833.1px for this image → 66 / 833.1 = 7.92%.
const SEAL_CENTER = { x: 367, y: 489 };
const SEAL_ORIGIN = '49.9% 53.2%';
const CLIP_SEAL = `circle(7.92% at ${SEAL_ORIGIN})`;

// Stamped field inside the seal's raised ring (measured: ring at r≈41–45,
// flat field r≈40, centre ≈ (367, 488.5)). The photo's monogram lives
// entirely inside r≈36, so a wax disc of r=41 covers it and keeps the ring.
const FIELD = { x: 367, y: 488.5, r: 41 };
const MARK_SIZE = 50;

// Thin jagged cracks radiating from just off-centre of the seal (image px).
const CRACKS = [
  'M366 486 L358 470 L364 455 L355 440 L361 429',
  'M369 489 L384 497 L397 488 L412 502 L425 499',
  'M367 492 L360 508 L370 524 L362 539 L367 551',
  'M364 489 L349 494 L338 485 L322 493 L309 488',
];

/*
 * Card choreography, as fractions of the envelope height (envH):
 *   tucked:  card top 8% below the envelope's top edge, scaled to ~envH tall
 *            (it's portrait, so the overflow below the envelope is clipped)
 *   rise:    card bottom up to 30% of envH — clear of the pocket's top edges
 *            at the card's corners — still behind the pocket
 *   forward: in front of everything, full size, centred in the viewport
 */
const TUCK_TOP = 0.08;
const TUCK_HEIGHT = 1.0;
const TUCK_MAX_WIDTH = 0.8;
const RISE_BOTTOM = 0.3;
const RISE_TILT = -3;
const HINT_SPACE = 64; // room under the settled card for the "turn over" button
const PAGE_MARGIN = 16; // min gap above a face taller than the viewport

function measureCard(scene, envelope, card) {
  const stage = envelope.parentElement;
  const envW = envelope.offsetWidth;
  const envH = envelope.offsetHeight;
  const cardW = card.offsetWidth;
  const cardH = card.offsetHeight;
  if (!envH || !cardH) return null;

  // Layout positions only (offsetTop ignores transforms), in page coordinates
  // so a resize while the page is scrolled doesn't shift the targets.
  const envTop = scene.offsetTop + stage.offsetTop;
  const envCenter = envTop + envH / 2;

  const scale = Math.min((TUCK_HEIGHT * envH) / cardH, (TUCK_MAX_WIDTH * envW) / cardW);
  const half = (scale * cardH) / 2;

  // y offsets of the card's centre relative to the envelope's centre
  return {
    scale,
    tuckY: envTop + TUCK_TOP * envH + half - envCenter,
    riseY: envTop + RISE_BOTTOM * envH - half - envCenter,
    finalY: (window.innerHeight - HINT_SPACE) / 2 - envCenter,
    // Settled centre in page px — used to push a tall back face down so its
    // top stays on-screen and the page (not the card) scrolls for the rest.
    centerY: (window.innerHeight - HINT_SPACE) / 2,
    cardH,
  };
}

const Photo = () => (
  <img className="env-layer__img" src={envelopeSrc} alt="" draggable="false" />
);

/*
 * The photo has no paper under the seal, so once the seal fades this patch
 * stands in for it: body colour, the flap tip and its edge shadow, feathered
 * into the surrounding paper. Colours are sampled from the photo (see CSS).
 */
function SealPatch({ visible, duration }) {
  const id = useId().replace(/:/g, '');
  const { x, y } = SEAL_CENTER;
  const tip = 'M255 433.5 L345 514.5 Q366 527 388 514.2 L478 434.2';

  return (
    <motion.svg
      className="env-layer__overlay"
      viewBox={`0 0 ${IMG_W} ${IMG_H}`}
      aria-hidden="true"
      focusable="false"
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration, ease: EASE }}
    >
      <defs>
        <radialGradient id={`${id}-fade`} cx={x} cy={y} r="100" gradientUnits="userSpaceOnUse">
          <stop offset="84%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id={`${id}-mask`}>
          <circle cx={x} cy={y} r="100" fill={`url(#${id}-fade)`} />
        </mask>
        <filter id={`${id}-blur`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <g mask={`url(#${id}-mask)`}>
        <circle cx={x} cy={y} r="100" style={{ fill: 'var(--patch-body)' }} />
        <path d={`${tip} L478 380 L255 380 Z`} style={{ fill: 'var(--patch-flap)' }} />
        <path
          d={tip}
          transform="translate(0 1.5)"
          fill="none"
          strokeWidth="3"
          strokeOpacity="0.75"
          filter={`url(#${id}-blur)`}
          style={{ stroke: 'var(--patch-shadow)' }}
        />
      </g>
    </motion.svg>
  );
}

/*
 * Replaces the photo's stamped monogram: a fresh wax field (lit from the
 * top-left like the rest of the seal, with a faint wax grain), then the
 * ComplyOn mark pressed into it — a dark lower-right shadow line under a
 * cream highlight reads as a debossed stamp.
 */
function SealStamp() {
  const id = useId().replace(/:/g, '');
  const { x, y, r } = FIELD;
  const m = MARK_SIZE;
  const mark = (stroke, dx, dy, opacity) => (
    <svg
      x={x - m / 2 + dx}
      y={y - m / 2 + dy}
      width={m}
      height={m}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.3"
      style={{ stroke: `var(${stroke})` }}
      opacity={opacity}
      overflow="visible"
    >
      <path d={SHIELD_PATH} />
      <path d={CHECK_PATH} />
    </svg>
  );

  return (
    <svg
      className="env-layer__overlay"
      viewBox={`0 0 ${IMG_W} ${IMG_H}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-field`} x1="0.15" y1="0.1" x2="0.85" y2="0.9">
          <stop offset="0%" style={{ stopColor: 'var(--seal-field-light)' }} />
          <stop offset="50%" style={{ stopColor: 'var(--seal-field)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--seal-field-dark)' }} />
        </linearGradient>
        {/* Recessed edge: shadow falls on the upper-left inner wall */}
        <radialGradient id={`${id}-wall`} cx="0.56" cy="0.58" r="0.56">
          <stop offset="86%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#3b2808" stopOpacity="0.45" />
        </radialGradient>
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0 0.05  0 0 0 0.09 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <circle cx={x} cy={y} r={r} fill={`url(#${id}-field)`} />
      <circle cx={x} cy={y} r={r} fill="#000" filter={`url(#${id}-grain)`} />
      <circle cx={x} cy={y} r={r} fill={`url(#${id}-wall)`} />
      {mark('--seal-gold-deep', 0.8, 1, 0.85)}
      {mark('--seal-cream', 0, 0, 0.95)}
    </svg>
  );
}

/*
 * "ComplyOn AI" in soft-gold script on the flap, set along a gentle concave
 * arc that echoes the flap's V and dips toward the seal. Lives on the flap
 * (image px coordinates), so it scales with the envelope and folds away with
 * the flap on open.
 *   Baseline: (204,344) → sag to ≈363 at centre → (532,344); the flap is
 *   ~360px wide at that height and the seal's top is at y≈424, leaving
 *   ~45px clear below the descenders.
 */
function FlapInscription() {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className="env-layer__overlay"
      viewBox={`0 0 ${IMG_W} ${IMG_H}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path id={`${id}-arc`} d="M204 344 Q368 382 532 344" />
        <filter id={`${id}-lift`} x="-10%" y="-30%" width="120%" height="160%">
          <feDropShadow dx="0" dy="0.8" stdDeviation="0.7" floodColor="#020817" floodOpacity="0.55" />
        </filter>
      </defs>
      <text className="flap-ink" fontSize="50" textAnchor="middle" filter={`url(#${id}-lift)`}>
        <textPath href={`#${id}-arc`} startOffset="50%">
          ComplyOn AI
        </textPath>
      </text>
    </svg>
  );
}

/* Inside face of the flap, seen once it has folded back over the top edge. */
function FlapLining() {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className="flap__face flap__face--back"
      viewBox={`0 0 ${IMG_W} ${IMG_H}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-lining`} x1="0" y1="247" x2="0" y2="520" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--flap-lining-hinge)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--flap-lining-tip)' }} />
        </linearGradient>
      </defs>
      <polygon points={FLAP_POINTS} fill={`url(#${id}-lining)`} />
    </svg>
  );
}

export default function Envelope({ front, back, onOpened, onFlip }) {
  const [phase, setPhase] = useState('closed');
  const [flipped, setFlipped] = useState(false);
  const [flips, setFlips] = useState(0); // restarts the shadow's flip dip
  const [geo, setGeo] = useState(null);
  // Natural height of the back face: it grows to fit its content rather
  // than being locked to the front's print ratio.
  const [backH, setBackH] = useState(0);
  const reduce = useReducedMotion();
  const dur = (d) => (reduce ? Math.min(d, 0.2) : d);

  const sceneRef = useRef(null);
  const envelopeRef = useRef(null);
  const cardRef = useRef(null);
  const backRef = useRef(null);

  const cracked = atLeast(phase, 'cracking');
  const sealGone = atLeast(phase, 'sealOpening');
  const flapOpen = atLeast(phase, 'flapOpening');
  const flapDone = atLeast(phase, 'cardRising');
  const cardInFront = atLeast(phase, 'cardForward');
  const isOpen = phase === 'open';

  // Card targets depend on rendered sizes — measure on mount and on resize.
  const measure = useCallback(() => {
    const g = measureCard(sceneRef.current, envelopeRef.current, cardRef.current);
    if (g) setGeo(g);
  }, []);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // offsetHeight is layout size, unaffected by the card's scale transforms
  useLayoutEffect(() => {
    const el = backRef.current;
    if (!el) return undefined;
    const update = () => setBackH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Page length added below the scene while a tall back face shows. Turning
  // back to the front scrolls up first and drops the extra length only once
  // the flip has finished, so the page never jumps.
  const [extend, setExtend] = useState(0);
  const backExtend =
    isOpen && geo ? Math.max(0, PAGE_MARGIN + Math.max(backH, geo.cardH) + HINT_SPACE - window.innerHeight) : 0;
  useEffect(() => {
    if (flipped) {
      setExtend(backExtend);
      return undefined;
    }
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    const t = setTimeout(() => setExtend(0), dur(TIMING.flip) * 1000);
    return () => clearTimeout(t);
  }, [flipped, backExtend, reduce]);

  const start = () => {
    if (phase === 'closed') setPhase('cracking');
  };

  const advance = (from, to) => () => {
    setPhase((p) => (p === from ? to : p));
  };

  const flip = () => {
    if (!isOpen) return;
    setFlips((n) => n + 1);
    setFlipped((f) => {
      onFlip?.(!f);
      return !f;
    });
  };

  const onCardClick = (e) => {
    // Let links and buttons on the card (RSVP, calendar, directions) work
    // without turning it over.
    if (e.target.closest('a, button')) return;
    flip();
  };

  let cardTarget = { y: 0, scale: 1, rotate: 0 };
  let cardTransition = { duration: 0 };
  if (geo) {
    if (!flapDone) {
      cardTarget = { y: geo.tuckY, scale: geo.scale, rotate: 0 };
    } else if (!cardInFront) {
      cardTarget = { y: geo.riseY, scale: geo.scale * 1.03, rotate: RISE_TILT };
      cardTransition = { duration: dur(TIMING.cardRise), ease: EASE_CARD_RISE };
    } else {
      cardTarget = { y: geo.finalY, scale: 1, rotate: 0 };
      cardTransition = { duration: dur(TIMING.cardForward), ease: EASE_CARD_FORWARD };
    }
    if (isOpen) {
      // A back face taller than the viewport starts PAGE_MARGIN from the top
      const faceH = flipped ? Math.max(backH, geo.cardH) : geo.cardH;
      cardTarget.y += Math.max(0, PAGE_MARGIN + faceH / 2 - geo.centerY);
      cardTransition = { duration: dur(TIMING.flip), ease: EASE };
    }
  }
  const faceH = flipped && geo ? Math.max(backH, geo.cardH) : geo?.cardH;

  // Ambient shadow under the card: none while tucked in the envelope, a
  // little as it leaves the pocket, fullest once it has come forward.
  const shadowTarget = !flapDone
    ? { opacity: 0, y: 0, scale: 0.9 }
    : !cardInFront
      ? { opacity: 0.35, y: 4, scale: 0.94 }
      : { opacity: 1, y: 14, scale: 1.02 };

  return (
    <main
      ref={sceneRef}
      className="scene"
      data-phase={phase}
      style={extend ? { '--extend': `${extend}px` } : undefined}
    >
      {/* Letterhead: brand mark above the envelope, landing screen only */}
      <motion.img
        className="brand-logo"
        src={logoSrc}
        alt="ComplyOn AI — AI Risk & Governance"
        width="314"
        height="151"
        draggable="false"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === 'closed' ? 1 : 0 }}
        transition={{ duration: phase === 'closed' ? ENTRANCE.duration : 0.4, ease: EASE_OUT }}
      />

      <motion.div
        className="stage"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: ENTRANCE.duration, ease: EASE_OUT, delay: ENTRANCE.lead }}
      >
        {/* Soft spotlight centred directly behind the envelope */}
        <div className="stage__glow" aria-hidden="true" />

        <div
          ref={envelopeRef}
          className={`envelope${phase === 'closed' ? ' envelope--closed' : ''}`}
          onClick={start}
        >
          <motion.div
            className="envelope__shadow"
            aria-hidden="true"
            initial={false}
            animate={{ opacity: cardInFront ? 0.4 : 1 }}
            transition={{ duration: dur(TIMING.cardForward), ease: EASE }}
          />

          {/* Envelope interior, seen through the opening once the flap lifts */}
          <div className="envelope__inside" aria-hidden="true" />

          {/* Top flap — static photo until it folds back over its hinge */}
          {flapOpen && (
            <motion.div
              className="env-layer env-layer--flap"
              aria-hidden="true"
              style={{ transformOrigin: FLAP_HINGE, zIndex: flapDone ? 1 : 4 }}
              initial={{ rotateX: 0 }}
              animate={{ rotateX: -180 }}
              transition={{ duration: dur(TIMING.flap), ease: EASE_FLAP }}
              onAnimationComplete={advance('flapOpening', 'cardRising')}
            >
              <div className="flap__face flap__face--front" style={{ clipPath: CLIP_FLAP }}>
                <Photo />
                <SealPatch visible duration={0} />
                <FlapInscription />
              </div>
              <FlapLining />
            </motion.div>
          )}

          {/* Card slot: behind the pocket and clipped at the envelope's bottom
              edge while tucked; lifted in front once it has cleared the pocket. */}
          <div className={`card-slot${cardInFront ? ' card-slot--front' : ''}`}>
            <motion.div
              ref={cardRef}
              className={`card${isOpen ? ' card--interactive' : ''}`}
              style={{
                visibility: geo ? 'visible' : 'hidden',
                // Height of the visible face, for the "turn over" button
                '--face-h': faceH ? `${faceH}px` : '100%',
              }}
              initial={false}
              animate={cardTarget}
              transition={cardTransition}
              onAnimationComplete={() => {
                if (phase === 'cardRising') {
                  setPhase('cardForward');
                } else if (phase === 'cardForward') {
                  setPhase('open');
                  onOpened?.();
                }
              }}
            >
              {/* Doesn't rotate with the faces, so the card stays grounded
                  through the flip; it narrows a touch at the edge-on moment */}
              <motion.div
                className="card__shadow"
                aria-hidden="true"
                initial={false}
                animate={shadowTarget}
                transition={cardTransition}
              >
                <motion.div
                  key={flips}
                  className="card__shadow-caster"
                  initial={{ scaleX: 1 }}
                  animate={flips > 0 && !reduce ? { scaleX: [1, 0.84, 1] } : { scaleX: 1 }}
                  transition={{ duration: dur(TIMING.flip), ease: EASE }}
                />
              </motion.div>

              <div className="card__hover" onClick={onCardClick}>
                <motion.div
                  className="card__flipper"
                  initial={false}
                  animate={{ rotateY: flipped ? 180 : 0 }}
                  transition={{ duration: dur(TIMING.flip), ease: EASE }}
                >
                  <div
                    className="card__face card__face--front"
                    aria-hidden={!isOpen || flipped}
                    inert={!isOpen || flipped}
                  >
                    {front}
                  </div>
                  <div
                    ref={backRef}
                    className="card__face card__face--back"
                    aria-hidden={!isOpen || !flipped}
                    inert={!isOpen || !flipped}
                  >
                    {back}
                  </div>
                </motion.div>
              </div>

              <motion.button
                type="button"
                className="card__turn"
                onClick={flip}
                disabled={!isOpen}
                aria-pressed={flipped}
                initial={false}
                animate={{ opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.4, delay: isOpen ? 0.2 : 0 }}
              >
                {flipped ? 'Back to invitation' : 'View details & RSVP'}
              </motion.button>
            </motion.div>
          </div>

          {/* Pocket — the envelope body; static once the flap is a separate layer */}
          {flapOpen ? (
            <div
              className="env-layer env-layer--pocket"
              aria-hidden="true"
              style={{ clipPath: CLIP_POCKET }}
            >
              <Photo />
              <SealPatch visible duration={0} />
            </div>
          ) : (
            /* Whole envelope — resting state, so no clip-path seams show */
            <div
              className="env-layer env-layer--whole"
              aria-hidden="true"
              style={{ clipPath: CLIP_WHOLE }}
            >
              <Photo />
              <SealPatch visible={sealGone} duration={dur(TIMING.seal)} />
              <FlapInscription />
            </div>
          )}

          {/* Seal — circular cut of the photo, new stamp, crack overlay */}
          <motion.div
            className="env-layer env-layer--seal"
            aria-hidden="true"
            style={{ clipPath: CLIP_SEAL, transformOrigin: SEAL_ORIGIN }}
            // Not `initial={false}`: that would skip the mount animation and the
            // idle breathing loop would never start.
            initial={{ scale: 1, opacity: 1 }}
            animate={
              sealGone
                ? { scale: 0.86, opacity: 0 }
                : phase === 'closed' && !reduce
                  ? { scale: SEAL_BREATH.scale, opacity: 1 }
                  : { scale: 1, opacity: 1 }
            }
            transition={
              phase === 'closed' && !reduce
                ? { duration: SEAL_BREATH.duration, ease: 'easeInOut', repeat: Infinity }
                : { duration: dur(TIMING.seal), ease: EASE }
            }
            onAnimationComplete={advance('sealOpening', 'flapOpening')}
          >
            <Photo />
            <SealStamp />
            <motion.svg
              className="env-layer__overlay seal__cracks"
              viewBox={`0 0 ${IMG_W} ${IMG_H}`}
              aria-hidden="true"
              focusable="false"
              initial={false}
              animate={{ opacity: cracked ? 1 : 0 }}
              transition={{ duration: dur(TIMING.crack), ease: EASE }}
              onAnimationComplete={advance('cracking', 'sealOpening')}
            >
              {CRACKS.map((d) => (
                <g key={d}>
                  <path d={d} className="seal__crack-light" transform="translate(0.8 0.8)" />
                  <path d={d} className="seal__crack" />
                </g>
              ))}
            </motion.svg>
          </motion.div>
        </div>
      </motion.div>

      <div className="cta">
        <motion.p
          className="cta__line"
          initial={{ opacity: 0, y: 6 }}
          animate={phase === 'closed' ? { opacity: 1, y: 0 } : { opacity: 0, y: 0 }}
          transition={
            phase === 'closed'
              ? { duration: ENTRANCE.duration, ease: EASE_OUT, delay: ENTRANCE.lead + ENTRANCE.stagger }
              : { duration: 0.4 }
          }
        >
          You’re cordially invited
        </motion.p>
        <motion.button
          type="button"
          className="open-btn"
          onClick={start}
          disabled={phase !== 'closed'}
          initial={{ opacity: 0, y: 6 }}
          animate={phase === 'closed' ? { opacity: 1, y: 0 } : { opacity: 0, y: 0 }}
          transition={
            phase === 'closed'
              ? { duration: ENTRANCE.duration, ease: EASE_OUT, delay: ENTRANCE.lead + ENTRANCE.stagger * 2 }
              : { duration: 0.4 }
          }
        >
          Open Invitation
        </motion.button>
      </div>

      <p className="sr-only" aria-live="polite">
        {isOpen ? (flipped ? 'Showing event details and RSVP.' : 'Invitation opened.') : ''}
      </p>
    </main>
  );
}
