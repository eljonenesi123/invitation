import Envelope from './components/Envelope.jsx';
import InvitationCard from './components/InvitationCard.jsx';
import CardBack from './components/CardBack.jsx';

const guestName = 'Guest Name';

export default function App() {
  return (
    <Envelope
      front={<InvitationCard guestName={guestName} />}
      back={<CardBack guestName={guestName} />}
    />
  );
}
