'use client';
import type { ApiError } from '@madart/api-client';
import type { BranchView, UserProfile } from '@madart/types';
import { Button, Card, ConnectionBadge, cx, Input, SessionProvider, Spinner, ToastProvider, useConnectionState, useResource, useSession } from '@madart/ui';
import { createContext, useContext, useEffect, useState } from 'react';
import { CategoriesPage, ImportPage, ProductsPage } from './pages/catalog';
import { DashboardPage, OrdersPage } from './pages/orders';
import { AuditPage, BranchesPage, DevicesPage, RolesPage, SettingsPage, StationsPage, UsersPage } from './pages/organisation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function AdminApp() {
  return (
    <SessionProvider config={{ apiUrl: API_URL, storageKey: 'madart.admin.token' }}>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </SessionProvider>
  );
}

// ───────────────────────────── admin context ──────────────────────────────

export interface AdminCtx {
  user: UserProfile;
  branches: BranchView[];
  branchId: string | null; // selected branch filter (null = all)
  setBranchId: (b: string | null) => void;
  refreshBranches: () => Promise<void>;
  can: (perm: string) => boolean;
}
const Ctx = createContext<AdminCtx | null>(null);
export const useAdmin = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('admin ctx');
  return c;
};

// ───────────────────────────── navigation (hash router) ──────────────────

const NAV: { key: string; label: string; perm?: string; group: string }[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'ოპერაციები', perm: 'reports.read' },
  { key: 'orders', label: 'Orders', group: 'ოპერაციები', perm: 'orders.read' },
  { key: 'products', label: 'Products', group: 'კატალოგი', perm: 'catalog.read' },
  { key: 'categories', label: 'Categories', group: 'კატალოგი', perm: 'catalog.read' },
  { key: 'import', label: 'Import (madart.ge)', group: 'კატალოგი', perm: 'catalog.import' },
  { key: 'branches', label: 'Branches', group: 'ორგანიზაცია', perm: 'branches.read' },
  { key: 'stations', label: 'Production Stations', group: 'ორგანიზაცია', perm: 'catalog.read' },
  { key: 'devices', label: 'Devices', group: 'ორგანიზაცია', perm: 'devices.read' },
  { key: 'users', label: 'Employees', group: 'ორგანიზაცია', perm: 'users.read' },
  { key: 'roles', label: 'Roles & Permissions', group: 'ორგანიზაცია', perm: 'users.read' },
  { key: 'settings', label: 'System Settings', group: 'სისტემა', perm: 'settings.write' },
  { key: 'audit', label: 'Audit Logs', group: 'სისტემა', perm: 'audit.read' },
];

function useHashRoute(): [string, (r: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, '') || 'dashboard');
  useEffect(() => {
    const on = () => setRoute(window.location.hash.replace(/^#\/?/, '') || 'dashboard');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (r) => (window.location.hash = `/${r}`)];
}

function Shell() {
  const { api, rt, token, setToken } = useSession();
  const connection = useConnectionState(rt);
  const me = useResource(() => api.auth.me(), [token], { enabled: !!token });
  const branches = useResource(() => api.branches.adminList(), [token], { enabled: !!token && !!me.data });
  const [branchId, setBranchId] = useState<string | null>(null);
  const [route, go] = useHashRoute();

  if (!token) return <Login />;
  if (me.error?.isUnauthorized) return <Login error="სესია ვადაგასულია" onReset={() => setToken(null)} />;
  if (!me.data || me.data.kind !== 'user' || !branches.data) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="h-10 w-10" />
      </div>
    );
  }
  const user = me.data.user;
  const can = (p: string) => user.permissions.includes(p as never);
  const ctx: AdminCtx = { user, branches: branches.data, branchId: user.branchId ?? branchId, setBranchId, refreshBranches: branches.refresh, can };
  const [section] = route.split('/');
  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <Ctx.Provider value={ctx}>
      <div className="flex min-h-dvh bg-canvas">
        <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
          <div className="flex items-center gap-2 px-4 py-4">
            <span className="rounded-lg bg-brand px-2 py-0.5 font-extrabold text-brand-ink">MADART</span>
            <span className="text-sm font-semibold text-ink-muted">Admin</span>
          </div>
          <nav className="flex-1 overflow-y-auto px-2">
            {groups.map((g) => (
              <div key={g} className="mb-3">
                <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{g}</div>
                {NAV.filter((n) => n.group === g && (!n.perm || can(n.perm))).map((n) => (
                  <a key={n.key} href={`#/${n.key}`} className={cx('block rounded-lg px-3 py-2 text-sm font-medium', section === n.key ? 'bg-brand/20 text-ink' : 'text-ink-muted hover:bg-canvas')}>
                    {n.label}
                  </a>
                ))}
              </div>
            ))}
          </nav>
          <div className="border-t border-line p-3 text-xs text-ink-muted">
            <div className="font-semibold text-ink">{user.displayName}</div>
            <div className="truncate">{user.roles.join(', ')}</div>
            <div className="mt-2 flex items-center justify-between">
              <ConnectionBadge state={connection} compact />
              <Button variant="ghost" size="sm" onClick={() => setToken(null)}>
                გასვლა
              </Button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-end gap-3 border-b border-line bg-surface px-6 py-2">
            <span className="text-xs text-ink-muted">ფილიალი</span>
            <select
              className="rounded-lg border border-line px-2 py-1 text-sm"
              value={ctx.branchId ?? ''}
              disabled={!!user.branchId}
              onChange={(e) => setBranchId(e.target.value || null)}
            >
              <option value="">ყველა</option>
              {branches.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </header>
          <main className="p-6">
            {section === 'dashboard' && <DashboardPage />}
            {section === 'orders' && <OrdersPage go={go} route={route} />}
            {section === 'products' && <ProductsPage go={go} />}
            {section === 'categories' && <CategoriesPage />}
            {section === 'import' && <ImportPage />}
            {section === 'branches' && <BranchesPage />}
            {section === 'stations' && <StationsPage />}
            {section === 'devices' && <DevicesPage />}
            {section === 'users' && <UsersPage />}
            {section === 'roles' && <RolesPage />}
            {section === 'settings' && <SettingsPage />}
            {section === 'audit' && <AuditPage />}
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

function Login({ error, onReset }: { error?: string; onReset?: () => void }) {
  const { api, setToken } = useSession();
  const [email, setEmail] = useState('admin@madart.local');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(error ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas p-6">
      <Card className="w-full max-w-sm space-y-4 p-8">
        <div className="text-2xl font-extrabold">
          <span className="rounded bg-brand px-2 text-brand-ink">MADART</span> Admin
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr('');
            try {
              onReset?.();
              const res = await api.auth.login(email, password);
              setToken(res.accessToken);
            } catch (er) {
              setErr((er as ApiError).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" autoComplete="username" />
          <Input value={password} type="password" onChange={(e) => setPassword(e.target.value)} placeholder="პაროლი" autoComplete="current-password" />
          <Button block size="lg" loading={busy} type="submit">
            შესვლა
          </Button>
        </form>
      </Card>
    </div>
  );
}
