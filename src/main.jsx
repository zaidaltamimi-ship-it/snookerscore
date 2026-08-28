import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './style.css';
import App from './App.jsx';
import { initNative } from './native.js';

// HashRouter, not BrowserRouter: the Android WebView loads from file://,
// where path-based routing has no server to fall back on.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);

initNative();
