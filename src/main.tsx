/* CRYORADAR — Entry Point
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS) */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
