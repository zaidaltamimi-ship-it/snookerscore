import { Link } from 'react-router-dom';

const FEATURES = [
  ['Live match scoring', 'Every pot, foul, safety and break, tracked as it happens.'],
  ['Tablet at every table', 'Enrol a tablet once; it knows which table it belongs to.'],
  ['TV scoreboard', 'A full-screen board for the club screen or a stream.'],
  ['Player statistics', 'Win rates, highest breaks, centuries and frame records.'],
  ['Club management', 'One club, one join code, all your players in one place.'],
  ['Tournaments', 'Knockout, or group stages feeding a knockout bracket.']
];

export default function Landing() {
  return (
    <div className="wrap">
      <div className="panel">
        <div className="eyebrow">Snooker Score</div>
        <h1 className="title">Score it properly.</h1>
        <p className="sub">
          A scoreboard for clubs and players. Works offline, on the table where
          you need it.
        </p>
        <div style={{ display: 'grid', gap: 10, margin: '18px 0' }}>
          {FEATURES.map(([title, body]) => (
            <div key={title} className="rcard">
              <div className="k" style={{ letterSpacing: '.14em' }}>{title}</div>
              <div className="sub" style={{ margin: '4px 0 0' }}>{body}</div>
            </div>
          ))}
        </div>
        <Link to="/score" className="cta" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Start scoring
        </Link>
        <div className="minirow" style={{ marginTop: 12 }}>
          <Link className="link" to="/admin">Club administration</Link>
        </div>
      </div>
    </div>
  );
}
