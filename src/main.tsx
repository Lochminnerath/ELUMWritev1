import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { watchHostBadge } from './lib/hostBadge';
import { ServiceBanner } from './components/ServiceBanner';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/motion.css';

watchHostBadge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Notices, incidents and maintenance from the ELUM Console, outside the app so they show on every page.
const banner = document.createElement('div');
document.body.appendChild(banner);
createRoot(banner).render(<ServiceBanner service="write" />);
