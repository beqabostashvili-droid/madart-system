'use client';
import dynamic from 'next/dynamic';

const AdminApp = dynamic(() => import('./AdminApp').then((m) => m.AdminApp), { ssr: false });

export default function Page() {
  return <AdminApp />;
}
