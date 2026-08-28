import { useEffect, useRef } from 'react';
import '../scoring/engine.js';

// The scoring engine is deliberately framework-agnostic: it is the part that
// has been tested at a real table, so React hosts it rather than rewrites it.
export default function Scoring({ tv = false }) {
  const host = useRef(null);

  useEffect(() => {
    const api = window.__snooker;
    if (api && host.current) api.mount(host.current, { tv });
    return () => api?.unmount?.();
  }, [tv]);

  return (
    <>
      <div className="wrap" ref={host} />
      <button className="tvexit" onClick={() => window.exitTV?.()}>Exit TV</button>
    </>
  );
}
