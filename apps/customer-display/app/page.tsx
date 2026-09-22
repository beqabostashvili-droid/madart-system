'use client';
import dynamic from 'next/dynamic';

const DisplayApp = dynamic(() => import('./DisplayApp').then((m) => m.DisplayApp), { ssr: false });

export default function Page() {
  return <DisplayApp />;
}
