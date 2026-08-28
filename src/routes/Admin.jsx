import { Link } from 'react-router-dom';
import { isConfigured } from '../lib/supabase.js';

export default function Admin() {
  return (
    <div className="wrap">
      <div className="panel">
        <div className="eyebrow">Club administration</div>
        <h1 className="title" style={{ fontSize: 'clamp(28px,7vw,44px)' }}>Admin</h1>
        <p className="sub">
          Players, tournaments and club settings live here. Sign-in comes next —
          the database and its security rules are already in place.
        </p>
        <p className="sub">
          Backend: {isConfigured ? 'connected' : 'not configured yet (set VITE_SUPABASE_URL)'}
        </p>
        <div className="minirow">
          <Link className="link" to="/">Back</Link>
        </div>
      </div>
    </div>
  );
}
