'use client';
import dynamic from 'next/dynamic';

// Session lives in localStorage → render on the client only (no hydration mismatch).
const DispatcherApp = dynamic(() => import('./DispatcherApp').then((m) => m.DispatcherApp), { ssr: false });

export default function Page() {
  return <DispatcherApp />;
}
