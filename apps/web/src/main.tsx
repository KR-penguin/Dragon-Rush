import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
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
