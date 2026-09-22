import '@madart/ui/styles.css';
import { SessionProvider, ToastProvider } from '@madart/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider config={{ apiUrl, storageKey: 'madart.kiosk.token', tokenFromQuery: true }}>
      <ToastProvider position="bottom-center">
        <App />
      </ToastProvider>
    </SessionProvider>
  </StrictMode>,
);
