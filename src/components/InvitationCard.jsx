import ShieldMark from './ShieldMark.jsx';
import './InvitationCard.css';

// "Guest Name" → staggered script lines, as in the print mockup.
function splitName(name) {
  const i = name.indexOf(' ');
  return i === -1 ? [name] : [name.slice(0, i), name.slice(i + 1)];
}

export default function InvitationCard({
  guestName = 'Guest Name',
  venue = 'Mak Albania Hotel',
  date = '09.11.2026',
  time = '17:30',
}) {
  const lines = splitName(guestName);

  return (
    <article className="invite" aria-label={`Invitation for ${guestName}`}>
      <div className="invite__body">
        <p className="invite__kicker">
          ComplyOn AI
          <br />
          invites you
        </p>
        <h1 className={`invite__name${lines.length > 1 ? ' invite__name--split' : ''}`}>
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h1>
        <p className="invite__venue">{venue}</p>
        <p className="invite__when">
          <time dateTime="2026-11-09">{date}</time>
          <time dateTime="17:30">{time}</time>
        </p>
      </div>

      <footer className="invite__brand">
        <ShieldMark className="invite__mark" strokeWidth={1.4} />
        <span className="invite__brand-name">ComplyOn AI</span>
      </footer>
    </article>
  );
}
