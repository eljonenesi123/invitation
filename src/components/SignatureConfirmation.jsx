import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import SignatureReveal from './SignatureReveal.jsx';
import ShieldMark from './ShieldMark.jsx';
import './SignatureConfirmation.css';

/*
 * "RSVP confirmed" page of the card back, shown after Accept: the guest's
 * name signs itself, then the closing line and a small wax-seal mark appear.
 */
export default function SignatureConfirmation({ guestName, onDone }) {
  const reduce = useReducedMotion();
  const [signed, setSigned] = useState(false);
  const rootRef = useRef(null);

  // The Accept button that had focus is gone — move focus to the new page
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const after = (delay = 0) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 6 },
    animate: signed ? { opacity: 1, y: 0 } : undefined,
    transition: { duration: reduce ? 0.15 : 0.6, delay: reduce ? 0 : delay, ease: [0.33, 0, 0.15, 1] },
  });

  return (
    <section ref={rootRef} className="sig" tabIndex={-1} aria-labelledby="sig-title">
      <p id="sig-title" className="sig__eyebrow">
        RSVP Confirmed
      </p>
      <p className="sig__lead">Thank you for accepting our invitation.</p>

      <div className="sig__signing">
        <SignatureReveal name={guestName} className="sig__name" onComplete={() => setSigned(true)} />
        <span className="sig__line" aria-hidden="true" />
      </div>

      <motion.div className="sig__closing" {...after(0.1)}>
        <span className="sig__seal" aria-hidden="true">
          <ShieldMark size={22} strokeWidth={1.5} />
        </span>
        <p className="sig__welcome">We look forward to welcoming you on November 9th.</p>
      </motion.div>

      <motion.button
        type="button"
        className="sig__done"
        onClick={onDone}
        disabled={!signed}
        {...after(0.5)}
      >
        Done
      </motion.button>

      <p className="sr-only" role="status">
        {signed ? 'RSVP confirmed. We look forward to welcoming you on November 9th.' : ''}
      </p>
    </section>
  );
}
