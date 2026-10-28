import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Auto-fade scrollbar during active scrolling
let scrollFadeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener(
  'scroll',
  () => {
    document.documentElement.classList.add('is-scrolling');
    if (scrollFadeTimer) clearTimeout(scrollFadeTimer);
    scrollFadeTimer = setTimeout(() => {
      document.documentElement.classList.remove('is-scrolling');
    }, 800);
  },
  { passive: true, capture: true }
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
