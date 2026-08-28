import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import Landing from './routes/Landing.jsx';
import Scoring from './routes/Scoring.jsx';
import Admin from './routes/Admin.jsx';

function ScoreRoute() {
  const [params] = useSearchParams();
  return <Scoring tv={params.get('tv') === '1'} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/score" element={<ScoreRoute />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
