import './CardBack.css';

/* Back face: "Card back — details & RSVP" mockup. Copy is from the mockup. */
export default function CardBack({
  guestName = 'Guest Name',
  email = 'info@complyonai.com',
}) {
  return (
    <article className="back" aria-label="Event details and RSVP">
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
          You are cordially invited to an exclusive gathering bringing together
          representatives from institutions, businesses, and the innovation and
          entrepreneurship ecosystem.
        </p>
        <p>
          Discover ComplyOn AI’s vision and platform for building a more trustworthy and
          responsible AI ecosystem across the Western Balkans.
        </p>
      </div>

      <p className="back__details">
        <time dateTime="2026-11-09T17:30">
          <span className="back__date">Monday, 9 November 2026</span>
          <span className="back__time">17:30</span>
        </time>
        <span className="back__venue">Mak Albania Hotel</span>
        <span className="back__city">Tirana, Albania</span>
      </p>

      <div className="back__rsvp">
        <p className="back__rsvp-label">RSVP</p>
        <p className="back__rsvp-text">Kindly confirm your attendance by email at:</p>
        <a className="back__email" href={`mailto:${email}`}>
          {email}
        </a>
      </div>

      <p className="back__closing">We look forward to welcoming you.</p>

      <footer className="back__footer">
        <span className="back__brand">ComplyOn AI</span>
        <span className="back__tagline">AI Governance &amp; Compliance</span>
      </footer>
    </article>
  );
}
