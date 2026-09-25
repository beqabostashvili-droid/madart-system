'use client';
import type { BranchView, DeviceView, DeviceWithTokenView, PurgeOrdersResult, RoleView, StationView, UserView } from '@madart/types';
import { Badge, Button, Field, formatDateTime, Input, Modal, PageTitle, Select, Spinner, Toggle, useResource, useSession } from '@madart/ui';
import { useEffect, useState } from 'react';
import { useAdmin } from '../AdminApp';
import { APP_URLS, CopyButton, Table, useSubmit } from './shared';

// ───────────────────────────── branches ──────────────────────────────────

export function BranchesPage() {
  const { api } = useSession();
  const { branches, refreshBranches, can } = useAdmin();
  const [editing, setEditing] = useState<BranchView | 'new' | null>(null);
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState({ code: '', name: '', address: '', timeZone: 'Asia/Tbilisi', orderNumberPrefix: 'A', pickupMinLeadMinutes: '30', pickupSlotMinutes: '15', open: '09:00', close: '22:00', active: true });
  useEffect(() => {
    if (editing && editing !== 'new') {
      const day = editing.openingHours['1'] ?? { open: '09:00', close: '22:00' };
      setForm({ code: editing.code, name: editing.name, address: editing.address ?? '', timeZone: editing.timeZone, orderNumberPrefix: editing.orderNumberPrefix, pickupMinLeadMinutes: String(editing.pickupMinLeadMinutes), pickupSlotMinutes: String(editing.pickupSlotMinutes), open: day.open, close: day.close, active: editing.active });
    }
  }, [editing]);
  return (
    <>
      <PageTitle title="Branches" actions={can('branches.write') && <Button onClick={() => setEditing('new')}>+ ფილიალი</Button>} />
      <Table<BranchView>
        rows={branches}
        rowKey={(b) => b.id}
        onRow={(b) => setEditing(b)}
        columns={[
          { key: 'code', label: 'Code', render: (b) => <span className="font-mono text-xs">{b.code}</span> },
          { key: 'name', label: 'სახელი', render: (b) => <span className="font-semibold">{b.name}</span> },
          { key: 'addr', label: 'მისამართი', render: (b) => b.address },
          { key: 'tz', label: 'TZ', render: (b) => b.timeZone },
          { key: 'prefix', label: 'Order prefix', render: (b) => b.orderNumberPrefix },
          { key: 'pickup', label: 'Pickup', render: (b) => `lead ${b.pickupMinLeadMinutes}′ · slot ${b.pickupSlotMinutes}′` },
          { key: 'active', label: 'Active', render: (b) => (b.active ? '✓' : '—') },
        ]}
      />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'ახალი ფილიალი' : 'ფილიალი'}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>გაუქმება</Button><Button loading={busy} onClick={async () => {
          const openingHours = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, { open: form.open, close: form.close }]));
          const body = { code: form.code, name: form.name, address: form.address || null, timeZone: form.timeZone, orderNumberPrefix: form.orderNumberPrefix, pickupMinLeadMinutes: Number(form.pickupMinLeadMinutes), pickupSlotMinutes: Number(form.pickupSlotMinutes), openingHours, active: form.active };
          const r = await submit(() => (editing === 'new' ? api.branches.create(body) : api.branches.update((editing as BranchView).id, body)), 'შენახულია');
          if (r) { setEditing(null); void refreshBranches(); }
        }}>შენახვა</Button></>}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} disabled={editing !== 'new'} /></Field>
          <Field label="სახელი"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="მისამართი"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Time zone"><Input value={form.timeZone} onChange={(e) => setForm({ ...form, timeZone: e.target.value })} /></Field>
          <Field label="Order number prefix"><Input value={form.orderNumberPrefix} onChange={(e) => setForm({ ...form, orderNumberPrefix: e.target.value.toUpperCase() })} /></Field>
          <Field label="Pickup lead (min)"><Input type="number" value={form.pickupMinLeadMinutes} onChange={(e) => setForm({ ...form, pickupMinLeadMinutes: e.target.value })} /></Field>
          <Field label="Slot (min)"><Input type="number" value={form.pickupSlotMinutes} onChange={(e) => setForm({ ...form, pickupSlotMinutes: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Open"><Input value={form.open} onChange={(e) => setForm({ ...form, open: e.target.value })} /></Field>
            <Field label="Close"><Input value={form.close} onChange={(e) => setForm({ ...form, close: e.target.value })} /></Field>
          </div>
          <div className="pt-6"><Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" /></div>
        </div>
      </Modal>
    </>
  );
}

// ───────────────────────────── stations ──────────────────────────────────

export function StationsPage() {
  const { api } = useSession();
  const { branches, branchId, can } = useAdmin();
  const stations = useResource(() => api.stations.list(branchId ?? undefined), [branchId]);
  const [editing, setEditing] = useState<StationView | 'new' | null>(null);
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState({ branchId: branchId ?? branches[0]?.id ?? '', code: '', name: '', color: '#64748b', sortOrder: '0', active: true });
  useEffect(() => {
    if (editing && editing !== 'new') setForm({ branchId: editing.branchId, code: editing.code, name: editing.name, color: editing.color, sortOrder: String(editing.sortOrder), active: editing.active });
    if (editing === 'new') setForm({ branchId: branchId ?? branches[0]?.id ?? '', code: '', name: '', color: '#64748b', sortOrder: '0', active: true });
  }, [editing, branchId, branches]);
  return (
    <>
      <PageTitle title="Production Stations" subtitle="სტანციები დინამიურად იმართება – არაფერია hardcoded" actions={can('stations.write') && <Button onClick={() => setEditing('new')}>+ სტანცია</Button>} />
      <Table<StationView>
        rows={stations.data ?? []}
        rowKey={(s) => s.id}
        onRow={(s) => setEditing(s)}
        columns={[
          { key: 'branch', label: 'ფილიალი', render: (s) => branches.find((b) => b.id === s.branchId)?.code },
          { key: 'color', label: '', render: (s) => <span className="inline-block h-4 w-4 rounded-full" style={{ background: s.color }} /> },
          { key: 'code', label: 'Code', render: (s) => <span className="font-mono text-xs">{s.code}</span> },
          { key: 'name', label: 'სახელი', render: (s) => s.name },
          { key: 'order', label: '#', render: (s) => s.sortOrder },
          { key: 'active', label: 'Active', render: (s) => (s.active ? '✓' : '—') },
        ]}
      />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'ახალი სტანცია' : 'სტანცია'}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>გაუქმება</Button><Button loading={busy} onClick={async () => {
          const body = { code: form.code, name: form.name, color: form.color, sortOrder: Number(form.sortOrder), active: form.active };
          const r = await submit(() => (editing === 'new' ? api.stations.create({ ...body, branchId: form.branchId }) : api.stations.update((editing as StationView).id, body)), 'შენახულია');
          if (r) { setEditing(null); void stations.refresh(); }
        }}>შენახვა</Button></>}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="ფილიალი"><Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} disabled={editing !== 'new'}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <Field label="Code (მაგ. HOT_KITCHEN)"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} disabled={editing !== 'new'} /></Field>
          <Field label="სახელი"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="ფერი"><Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
          <Field label="Sort"><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
          <div className="pt-6"><Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" /></div>
        </div>
      </Modal>
    </>
  );
}

// ───────────────────────────── devices ───────────────────────────────────

const DEVICE_TYPES = ['KIOSK', 'POS', 'PRODUCTION', 'CUSTOMER_DISPLAY'] as const;
const deviceUrl = (d: DeviceView, token: string) => {
  const base = d.type === 'KIOSK' ? APP_URLS.kiosk : d.type === 'POS' ? APP_URLS.pos : d.type === 'PRODUCTION' ? APP_URLS.production : APP_URLS.display;
  return `${base}/?token=${token}`;
};

export function DevicesPage() {
  const { api } = useSession();
  const { branches, branchId, can } = useAdmin();
  const devices = useResource(() => api.devices.list(branchId ?? undefined), [branchId], { pollMs: 30_000 });
  const stations = useResource(() => api.stations.list(), []);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<DeviceWithTokenView | null>(null);
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState({ type: 'KIOSK' as (typeof DEVICE_TYPES)[number], name: '', branchId: branchId ?? branches[0]?.id ?? '', stationId: '' });

  return (
    <>
      <PageTitle title="Devices" subtitle="Kiosks · POS · Production screens · Customer displays" actions={can('devices.write') && <Button onClick={() => setCreating(true)}>+ REGISTER DEVICE</Button>} />
      <Table<DeviceView>
        rows={devices.data ?? []}
        rowKey={(d) => d.id}
        columns={[
          { key: 'type', label: 'Type', render: (d) => <Badge className="bg-canvas text-ink">{d.type}</Badge> },
          { key: 'name', label: 'სახელი', render: (d) => <span className="font-semibold">{d.name}</span> },
          { key: 'branch', label: 'ფილიალი', render: (d) => branches.find((b) => b.id === d.branchId)?.name },
          { key: 'station', label: 'Station', render: (d) => stations.data?.find((s) => s.id === d.stationId)?.code ?? '—' },
          { key: 'online', label: 'Status', render: (d) => (d.online ? <Badge className="bg-green-100 text-green-800">ONLINE</Badge> : <Badge className="bg-gray-100 text-gray-600">{d.lastSeenAt ? `seen ${formatDateTime(d.lastSeenAt)}` : 'never'}</Badge>) },
          { key: 'active', label: 'Active', render: (d) => (d.active ? '✓' : '—') },
          {
            key: 'actions',
            label: '',
            render: (d) =>
              can('devices.write') && (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={async () => { const r = await submit(() => api.devices.rotateToken(d.id), 'ტოკენი განახლდა'); if (r) setIssued(r); }}>Rotate token</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await submit(() => api.devices.update(d.id, { active: !d.active })); void devices.refresh(); }}>{d.active ? 'Disable' : 'Enable'}</Button>
                </div>
              ),
            className: 'text-right',
          },
        ]}
      />

      <Modal open={creating} onClose={() => setCreating(false)} title="მოწყობილობის რეგისტრაცია"
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>გაუქმება</Button><Button loading={busy} onClick={async () => {
          const r = await submit(() => api.devices.create({ type: form.type, name: form.name, branchId: form.branchId, stationId: form.type === 'PRODUCTION' && form.stationId ? form.stationId : null, settings: {} }), 'დარეგისტრირდა');
          if (r) { setCreating(false); setIssued(r); void devices.refresh(); }
        }}>რეგისტრაცია</Button></>}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}>{DEVICE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="სახელი (მაგ. Kitchen-Screen-01)"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="ფილიალი"><Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value, stationId: '' })}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          {form.type === 'PRODUCTION' && (
            <Field label="Station"><Select value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })}><option value="">—</option>{stations.data?.filter((s) => s.branchId === form.branchId).map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</Select></Field>
          )}
        </div>
      </Modal>

      <Modal open={!!issued} onClose={() => setIssued(null)} title={`${issued?.name} – device token`} size="lg">
        {issued && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">ტოკენი ჩანს მხოლოდ ერთხელ. გახსენით ეს ბმული მოწყობილობაზე – აპლიკაცია დაიმახსოვრებს.</p>
            <div className="break-all rounded-lg bg-canvas p-3 font-mono text-xs">{deviceUrl(issued, issued.token)}</div>
            <div className="flex gap-2">
              <CopyButton text={deviceUrl(issued, issued.token)} label="ბმულის კოპირება" />
              <CopyButton text={issued.token} label="მხოლოდ ტოკენი" />
              <a className="ml-auto" href={deviceUrl(issued, issued.token)} target="_blank" rel="noreferrer"><Button size="sm">გახსნა ↗</Button></a>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ───────────────────────────── users & roles ─────────────────────────────

const ROLE_CODES = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'PRODUCTION_EMPLOYEE', 'DISPATCHER'] as const;

export function UsersPage() {
  const { api } = useSession();
  const { branches, branchId, can } = useAdmin();
  const users = useResource(() => api.users.list(branchId ?? undefined), [branchId]);
  const [editing, setEditing] = useState<UserView | 'new' | null>(null);
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState({ email: '', displayName: '', password: '', pin: '', branchId: '', roles: ['CASHIER'] as string[], active: true });
  useEffect(() => {
    if (editing && editing !== 'new') setForm({ email: editing.email, displayName: editing.displayName, password: '', pin: '', branchId: editing.branchId ?? '', roles: editing.roles, active: editing.active });
    if (editing === 'new') setForm({ email: '', displayName: '', password: '', pin: '', branchId: branchId ?? '', roles: ['CASHIER'], active: true });
  }, [editing, branchId]);
  return (
    <>
      <PageTitle title="Employees" actions={can('users.write') && <Button onClick={() => setEditing('new')}>+ თანამშრომელი</Button>} />
      <Table<UserView>
        rows={users.data ?? []}
        rowKey={(u) => u.id}
        onRow={(u) => setEditing(u)}
        columns={[
          { key: 'name', label: 'სახელი', render: (u) => <span className="font-semibold">{u.displayName}</span> },
          { key: 'email', label: 'Email', render: (u) => u.email },
          { key: 'roles', label: 'Roles', render: (u) => u.roles.join(', ') },
          { key: 'branch', label: 'ფილიალი', render: (u) => (u.branchId ? branches.find((b) => b.id === u.branchId)?.code : 'ყველა') },
          { key: 'active', label: 'Active', render: (u) => (u.active ? '✓' : '—') },
        ]}
      />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'ახალი თანამშრომელი' : 'თანამშრომელი'}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>გაუქმება</Button><Button loading={busy} onClick={async () => {
          const base = { email: form.email, displayName: form.displayName, branchId: form.branchId || null, roles: form.roles as never, active: form.active, pin: form.pin || null };
          const r = await submit(() => (editing === 'new' ? api.users.create({ ...base, password: form.password }) : api.users.update((editing as UserView).id, { ...base, ...(form.password ? { password: form.password } : {}) })), 'შენახულია');
          if (r) { setEditing(null); void users.refresh(); }
        }}>შენახვა</Button></>}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="სახელი"><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
          <Field label={editing === 'new' ? 'პაროლი' : 'ახალი პაროლი (არასავალდებულო)'}><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="PIN (POS)"><Input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></Field>
          <Field label="ფილიალი"><Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}><option value="">ყველა (global)</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <div className="pt-6"><Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" /></div>
          <div className="col-span-2">
            <div className="mb-1 text-sm font-medium">Roles</div>
            <div className="flex flex-wrap gap-3">
              {ROLE_CODES.map((r) => (
                <label key={r} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={form.roles.includes(r)} onChange={(e) => setForm({ ...form, roles: e.target.checked ? [...form.roles, r] : form.roles.filter((x) => x !== r) })} />
                  {r}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function RolesPage() {
  const { api } = useSession();
  const { can } = useAdmin();
  const roles = useResource(() => api.users.roles(), []);
  const permissions = useResource(() => api.users.permissions(), []);
  const { submit, busy } = useSubmit();
  const [selected, setSelected] = useState<RoleView | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  useEffect(() => { if (selected) setPerms(selected.permissions); }, [selected]);
  const groups = [...new Set((permissions.data ?? []).map((p) => p.split('.')[0]!))];
  return (
    <>
      <PageTitle title="Roles & Permissions" subtitle="Permission-ები granular-ია; server-side შემოწმება ხდება ყველა მოთხოვნაზე" />
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="card p-2">
          {roles.data?.map((r) => (
            <button key={r.id} onClick={() => setSelected(r)} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${selected?.id === r.id ? 'bg-brand/20 font-semibold' : 'hover:bg-canvas'}`}>
              {r.name} <span className="block text-xs text-ink-muted">{r.code} · {r.permissions.length}</span>
            </button>
          ))}
        </div>
        <div className="card p-4">
          {!selected ? <div className="text-ink-muted">აირჩიეთ როლი</div> : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">{selected.name}</h3>
                {can('roles.write') && <Button loading={busy} onClick={async () => { const r = await submit(() => api.users.updateRole(selected.id, { permissions: perms }), 'შენახულია'); if (r) void roles.refresh(); }}>შენახვა</Button>}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {groups.map((g) => (
                  <div key={g}>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">{g}</div>
                    {(permissions.data ?? []).filter((p) => p.startsWith(`${g}.`)).map((p) => (
                      <label key={p} className="flex items-center gap-2 py-0.5 text-sm">
                        <input type="checkbox" disabled={!can('roles.write')} checked={perms.includes(p)} onChange={(e) => setPerms(e.target.checked ? [...perms, p] : perms.filter((x) => x !== p))} />
                        {p}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ───────────────────────────── settings & audit ──────────────────────────

export function SettingsPage() {
  const { api } = useSession();
  const { branchId } = useAdmin();
  const settings = useResource(() => api.settings.list(branchId ?? undefined), [branchId]);
  const { submit, busy } = useSubmit();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const KNOWN = ['production.startingSoonMinutes', 'production.lateGraceMinutes', 'production.boardHorizonMinutes', 'production.readyRetentionMinutes', 'payments.timeoutSeconds', 'payments.requirePaymentBeforeProduction', 'display.readyRetentionMinutes', 'orders.numberPadding'];
  const rows = KNOWN.map((key) => ({ key, row: settings.data?.find((s) => s.key === key && s.branchId === (branchId ?? null)) ?? settings.data?.find((s) => s.key === key) }));
  return (
    <>
      <PageTitle title="System Settings" subtitle={branchId ? 'ფილიალის override (ცარიელი = გლობალური)' : 'გლობალური პარამეტრები'} />
      <Table
        rows={rows}
        rowKey={(r) => r.key}
        columns={[
          { key: 'key', label: 'Key', render: (r) => <span className="font-mono text-xs">{r.key}</span> },
          { key: 'scope', label: 'Scope', render: (r) => (r.row ? (r.row.branchId ? 'branch' : 'global') : 'default') },
          { key: 'value', label: 'Value', render: (r) => <Input className="max-w-xs" value={draft[r.key] ?? JSON.stringify(r.row?.value ?? '')} onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })} /> },
          { key: 'save', label: '', render: (r) => <Button size="sm" loading={busy} disabled={draft[r.key] === undefined} onClick={async () => { let value: unknown = draft[r.key]; try { value = JSON.parse(draft[r.key]!); } catch { /* string */ } const ok = await submit(() => api.settings.upsert({ key: r.key, value, branchId: branchId ?? null }), 'შენახულია'); if (ok) { setDraft((d) => { const c = { ...d }; delete c[r.key]; return c; }); void settings.refresh(); } }}>შენახვა</Button>, className: 'text-right' },
        ]}
      />
      <PurgeOrdersCard />
    </>
  );
}

function PurgeOrdersCard() {
  const { api } = useSession();
  const { submit, busy } = useSubmit();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<PurgeOrdersResult | null>(null);
  return (
    <div className="card mt-8 border-danger/40 p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-danger">Danger zone</div>
      <div className="mt-1 text-lg font-bold">სატესტო შეკვეთების წაშლა</div>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        შლის ყველა შეკვეთას ყველა მოდულიდან — გადახდებით, წარმოების დავალებებით და ისტორიით — და ნომრებს თავიდან იწყებს (A001). კატალოგს, რეკლამებს, მოწყობილობებს და მომხმარებლებს არ ეხება. ქმედება შეუქცევადია.
      </p>
      {result && (
        <div className="mt-3 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
          წაიშალა: {result.orders} შეკვეთა, {result.payments} გადახდა, {result.productionTasks} წარმოების დავალება.
        </div>
      )}
      <Button variant="danger" className="mt-4" onClick={() => { setTyped(''); setOpen(true); }}>
        შეკვეთების წაშლა…
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="ნამდვილად წავშალო ყველა შეკვეთა?"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>გაუქმება</Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={typed !== 'DELETE'}
              onClick={async () => {
                const r = await submit(() => api.maintenance.purgeOrders(), 'შეკვეთები წაიშალა');
                if (r) { setResult(r); setOpen(false); }
              }}
            >
              წაშლა
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">დასადასტურებლად აკრიფე <span className="font-mono font-bold text-ink">DELETE</span>.</p>
        <Input className="mt-3" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoFocus />
      </Modal>
    </div>
  );
}

export function AuditPage() {
  const { api } = useSession();
  const { branchId } = useAdmin();
  const [action, setAction] = useState('');
  const logs = useResource(() => api.reports.audit({ branchId: branchId ?? undefined, action: action || undefined, limit: 100 }), [branchId, action]);
  return (
    <>
      <PageTitle title="Audit Logs" />
      <div className="mb-3"><Input placeholder="Action (მაგ. REFUND, CANCEL, PRODUCTION_START)" value={action} onChange={(e) => setAction(e.target.value.toUpperCase())} className="max-w-sm" /></div>
      {!logs.data ? <Spinner /> : (
        <Table
          rows={logs.data.items}
          rowKey={(l) => l.id}
          columns={[
            { key: 'at', label: 'დრო', render: (l) => <span className="tabular text-xs">{formatDateTime(l.at)}</span> },
            { key: 'actor', label: 'Actor', render: (l) => <span>{l.actorName ?? l.actorId ?? l.actorType} <span className="text-xs text-ink-muted">{l.actorType}</span></span> },
            { key: 'action', label: 'Action', render: (l) => <Badge className="bg-canvas text-ink">{l.action}</Badge> },
            { key: 'entity', label: 'Entity', render: (l) => <span className="text-xs">{l.entityType} {l.entityId?.slice(0, 8)}</span> },
            { key: 'meta', label: 'Metadata', render: (l) => <span className="font-mono text-xs text-ink-muted">{l.metadata ? JSON.stringify(l.metadata).slice(0, 120) : ''}</span> },
          ]}
        />
      )}
    </>
  );
}
