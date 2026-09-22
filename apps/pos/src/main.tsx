import '@madart/ui/styles.css';
import { ReceiptProvider, SessionProvider, ToastProvider } from '@madart/ui';
import { printer } from './receipt';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// A POS device token may arrive once via ?token= (from Admin) – remember it for device identity.
try {
  const q = new URLSearchParams(window.location.search).get('token');
  if (q) {
    window.localStorage.setItem('madart.pos.deviceToken', q);
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.toString());
  }
} catch {
  /* ignore */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider config={{ apiUrl, storageKey: 'madart.pos.cashierToken' }}>
      <ToastProvider>
        <ReceiptProvider hardware={printer} title="ჩეკი">
          <App />
        </ReceiptProvider>
      </ToastProvider>
    </SessionProvider>
  </StrictMode>,
);
