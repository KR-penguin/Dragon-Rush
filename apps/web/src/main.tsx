import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (unicode-range slices, so only the glyphs in use are fetched).
import '@fontsource/hahmlet/500.css';
import '@fontsource/hahmlet/700.css';
import '@fontsource/hahmlet/900.css';
import '@fontsource/black-han-sans/400.css';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/700.css';
import '@fontsource/gowun-batang/400.css';
import '@fontsource/gowun-batang/700.css';
import { App } from './App';
import './styles/base.css';
import './styles/layout.css';
import './styles/board.css';
import './styles/hud.css';
import './styles/dialogs.css';
import './styles/setup.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
