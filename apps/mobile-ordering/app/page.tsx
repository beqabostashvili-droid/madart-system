'use client';
import dynamic from 'next/dynamic';

const MobileApp = dynamic(() => import('./MobileApp').then((m) => m.MobileApp), { ssr: false });

export default function Page() {
  return <MobileApp />;
}
