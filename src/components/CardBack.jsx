import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import SignatureConfirmation from './SignatureConfirmation.jsx';
import { DURATION, EASE, REDUCED_MAX } from '../motion.js';
import './CardBack.css';

const EVENT = {
  title:
    'ComplyOn AI Launch Event — Building the AI Trust Infrastructure for the Western Balkans',
  // 17:30–19:30 Europe/Tirane. Tirana is on CET (UTC+1) by 9 November, so the
  // .ics carries plain UTC times and needs no VTIMEZONE block.
  startUtc: '20261109T163000Z',
  endUtc: '20261109T183000Z',
  // Local calendar day of the event, for the countdown
  day: new Date(2026, 10, 9),
  location: 'Mak Albania Hotel, Tirana, Albania',
  description:
    'ComplyOn AI invites you to an exclusive evening dedicated to innovation, responsible AI, ' +
    'and regional opportunities — bringing together institutions, businesses, and the innovation ' +
    'ecosystem to discover our vision for a more trustworthy AI ecosystem across the Western Balkans.',
};

const MAPS_URL = `https://maps.google.com/?q=${encodeURIComponent(EVENT.location)}`;

const REPLIES = {
  // Accept stays in-app (signature page); only Decline opens an email
  accept: {
    thanks: 'Thank you — see you on November 9th',
  },
  decline: {
    subject: 'RSVP: Unable to Attend — ComplyOn AI Launch Event',
    thanks: 'Thank you for letting us know',
  },
};

/* ---- .ics -------------------------------------------------------------- */

// RFC 5545 text escaping
const icsText = (s) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// Fold content lines at 75 octets (UTF-8), continuation lines start with a space.
function foldLine(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // leading space on continuations
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function buildIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ComplyOn AI//Invitation//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:complyon-launch-20261109@complyonai.com',
      `DTSTAMP:${stamp}`,
      `DTSTART:${EVENT.startUtc}`,
      `DTEND:${EVENT.endUtc}`,
      `SUMMARY:${icsText(EVENT.title)}`,
      `LOCATION:${icsText(EVENT.location)}`,
      `DESCRIPTION:${icsText(EVENT.description)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:ComplyOn AI Launch Event',
      'TRIGGER:-PT2H',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(foldLine)
      .join('\r\n') + '\r\n'
  );
}

function downloadIcs() {
  const blob = new Blob([buildIcs()], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'complyon-ai-launch-event.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---- Countdown --------------------------------------------------------- */

function countdownLabel(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((EVENT.day - today) / 86_400_000);
  if (days > 1) return `${days} days until the event`;
  if (days === 1) return 'Tomorrow evening';
  if (days === 0) return 'Tonight';
  return null;
}

/* ---- Icons ------------------------------------------------------------- */

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

const CalendarIcon = () => (
  <svg {...iconProps} className="back__icon">
    <rect x="3.5" y="5" width="17" height="15" rx="1.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);

const PinIcon = () => (
  <svg {...iconProps} className="back__icon">
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);

const CheckIcon = () => (
  <svg {...iconProps} className="back__icon back__icon--check" strokeWidth={2}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/* Back face: "Card back — details & RSVP" mockup. Copy is from the mockup. */
export default function CardBack({
  guestName = 'Guest Name',
  email = 'info@complyonai.com',
}) {
  const [reply, setReply] = useState(null);
  // 'details' | 'signed' — Accept turns to the signature page of the card
  const [page, setPage] = useState('details');
  // Hold the face at its current height across the page swap, so the card
  // doesn't resize or move while one page fades out and the other in.
  const [lockH, setLockH] = useState(null);
  const articleRef = useRef(null);
  const reduce = useReducedMotion();
  const countdown = countdownLabel();

  const respond = (kind) => {
    setReply(kind);
    if (kind === 'accept') {
      setLockH(articleRef.current?.offsetHeight ?? null);
      setPage('signed');
      return;
    }
    // Same-page mailto: hands off to the mail client without navigating away.
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(REPLIES[kind].subject)}`;
  };

  // Reduced motion: opacity only, near-instant
  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: REDUCED_MAX } };

  // Inline reply swap — a small acknowledgement: short tier
  const swap = reduce
    ? fade
    : {
        initial: { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0, transition: { duration: DURATION.short, ease: EASE.enter } },
        exit: { opacity: 0, y: -4, transition: { duration: DURATION.short, ease: EASE.exit } },
      };

  const backToDetails = () => {
    setPage('details');
    // Focus left with the Done button; return it to the card back
    articleRef.current?.focus({ preventScroll: true });
  };

  // Page turn: the old page leaves (short, exit), the new one settles in
  // (medium, enter) — together a long-tier change, like the flip
  const turn = reduce
    ? fade
    : {
        initial: { opacity: 0, scale: 0.96 },
        animate: { opacity: 1, scale: 1, transition: { duration: DURATION.medium, ease: EASE.enter } },
        exit: { opacity: 0, scale: 0.96, transition: { duration: DURATION.short, ease: EASE.exit } },
      };

  return (
    <article
      ref={articleRef}
      className="back"
      aria-label="Event details and RSVP"
      tabIndex={-1}
      style={lockH ? { minHeight: lockH } : undefined}
    >
      <AnimatePresence mode="wait" initial={false}>
        {page === 'signed' ? (
          <motion.div key="signed" className="back__page" {...turn}>
            <SignatureConfirmation guestName={guestName} onDone={backToDetails} />
          </motion.div>
        ) : (
          <motion.div
            key="details"
            className="back__page"
            {...turn}
            // Release the height lock once the details page is back in
            // (this also fires after its exit, which targets opacity 0)
            onAnimationComplete={(def) => def.opacity === 1 && setLockH(null)}
          >
            <p className="back__dear">Dear {guestName},</p>
            <p className="back__eyebrow">ComplyOn AI invites you</p>

            <h2 className="back__headline">
              Building the AI trust infrastructure for the Western Balkans
            </h2>
            <p className="back__subhead">
              An evening dedicated to innovation, responsible AI, and regional opportunities
            </p>

            <span className="back__divider" aria-hidden="true">
              <span className="back__diamond" />
            </span>

            <div className="back__text">
              <p>
                An exclusive gathering of institutions, businesses, and the innovation ecosystem.
                Discover ComplyOn AI’s vision for a more trustworthy and responsible AI ecosystem
                across the Western Balkans.
              </p>
            </div>

            <div className="back__details">
              <time dateTime="2026-11-09T17:30">
                <span className="back__date">Monday, 9 November 2026</span>
                <span className="back__sep" aria-hidden="true">·</span>
                <span className="back__time">17:30</span>
              </time>
              <a
                className="back__venue-link"
                href={MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="Directions in Google Maps"
              >
                <span className="back__venue">Mak Albania Hotel</span>
                <span className="back__venue-comma">,&nbsp;</span>
                <span className="back__city">Tirana, Albania</span>
                <PinIcon />
                <span className="sr-only"> — directions in Google Maps (opens in a new tab)</span>
              </a>
            </div>

            <div className="back__rsvp">
              <p className="back__rsvp-label">RSVP</p>
              <p className="back__rsvp-text">Kindly confirm your attendance by email at:</p>
              <a className="back__email" href={`mailto:${email}`}>
                {email}
              </a>

              <div className="back__reply">
                <AnimatePresence mode="wait" initial={false}>
                  {reply ? (
                    <motion.p key="thanks" className="back__thanks" role="status" {...swap}>
                      <CheckIcon />
                      {REPLIES[reply].thanks}
                    </motion.p>
                  ) : (
                    <motion.div key="buttons" className="back__buttons" {...swap}>
                      <button
                        type="button"
                        className="back__btn back__btn--accept"
                        onClick={() => respond('accept')}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="back__btn back__btn--decline"
                        onClick={() => respond('decline')}
                      >
                        Decline
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <p className="back__closing">We look forward to welcoming you.</p>

            <footer className="back__footer">
              <div className="back__occasion">
                {countdown && <p className="back__countdown">{countdown}</p>}
                <button type="button" className="back__calendar" onClick={downloadIcs}>
                  <CalendarIcon />
                  Add to Calendar
                </button>
              </div>
              <p className="back__brandline">
                <span className="back__brand">ComplyOn AI</span>
                <span className="back__brandline-sep" aria-hidden="true">·</span>
                <span className="back__tagline">AI Governance &amp; Compliance</span>
              </p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
