'use client';
import type { AdminProductView, AdminPromotionView, CategoryView, ImportPreviewView, ProductionConfigInput } from '@madart/types';
import { Badge, Button, Field, formatGel, Input, Modal, PageTitle, Select, Spinner, Toggle, useResource, useSession } from '@madart/ui';
import { useEffect, useState } from 'react';
import { useAdmin } from '../AdminApp';
import { Table, useSubmit } from './shared';

// ───────────────────────────── products ──────────────────────────────────

export function ProductsPage({ go }: { go: (r: string) => void }) {
  const { api } = useSession();
  const { can } = useAdmin();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const categories = useResource(() => api.catalog.categories(), []);
  const products = useResource(() => api.catalog.products({ search: search || undefined, categoryId: categoryId || undefined, includeArchived }), [search, categoryId, includeArchived]);
  const [editing, setEditing] = useState<AdminProductView | 'new' | null>(null);
  const catName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? '';

  return (
    <>
      <PageTitle
        title="Products"
        subtitle={products.data ? `${products.data.length} პროდუქტი` : ''}
        actions={
          <>
            {can('catalog.import') && (
              <Button variant="outline" onClick={() => go('import')}>
                Import → Madart.ge
              </Button>
            )}
            {can('catalog.write') && <Button onClick={() => setEditing('new')}>+ CREATE PRODUCT</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input placeholder="ძებნა (SKU, სახელი)" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="max-w-xs">
          <option value="">ყველა კატეგორია</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Toggle checked={includeArchived} onChange={setIncludeArchived} label="არქივის ჩვენება" />
      </div>
      <Table<AdminProductView>
        rows={products.data ?? []}
        rowKey={(p) => p.id}
        onRow={(p) => setEditing(p)}
        columns={[
          { key: 'img', label: '', render: (p) => (p.imageUrl ? <img src={p.imageUrl} alt="" className="h-10 w-12 rounded object-cover" /> : <div className="h-10 w-12 rounded bg-canvas" />) },
          { key: 'name', label: 'დასახელება', render: (p) => <div><div className="font-semibold">{p.translations.find((t) => t.locale === 'ka')?.name}</div><div className="text-xs text-ink-muted">{p.sku}</div></div> },
          { key: 'cat', label: 'კატეგორია', render: (p) => catName(p.categoryId) },
          { key: 'price', label: 'ფასი', render: (p) => formatGel(p.basePrice), className: 'text-right tabular' },
          {
            key: 'prod',
            label: 'წარმოება',
            render: (p) =>
              p.productionConfig.productionRequired ? (
                <span className="text-sm">
                  {p.productionConfig.stationCode ?? <span className="text-danger">სტანცია არ არის!</span>} · {p.productionConfig.productionTimeMinutes} წთ
                </span>
              ) : (
                <span className="text-xs text-ink-muted">არ სჭირდება</span>
              ),
          },
          { key: 'ch', label: 'არხები', render: (p) => <span className="text-xs">{[p.availableKiosk && 'Kiosk', p.availablePos && 'POS', p.availableMobile && 'Mobile'].filter(Boolean).join(' · ')}</span> },
          { key: 'state', label: 'სტატუსი', render: (p) => (p.archivedAt ? <Badge className="bg-gray-100 text-gray-600">ARCHIVED</Badge> : p.active ? <Badge className="bg-green-100 text-green-800">ACTIVE</Badge> : <Badge className="bg-amber-100 text-amber-800">DISABLED</Badge>) },
          { key: 'src', label: 'წყარო', render: (p) => <span className="text-xs text-ink-muted">{p.externalSource ?? 'internal'}</span> },
        ]}
      />
      {editing && (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void products.refresh();
          }}
        />
      )}
    </>
  );
}

function ProductEditor({ product, categories, onClose, onSaved }: { product: AdminProductView | null; categories: CategoryView[]; onClose: () => void; onSaved: () => void }) {
  const { api } = useSession();
  const { can, branches } = useAdmin();
  const { submit, busy } = useSubmit();
  const stations = useResource(() => api.stations.list(), []);
  const tr = (l: 'ka' | 'en' | 'ru') => product?.translations.find((t) => t.locale === l);
  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    categoryId: product?.categoryId ?? categories[0]?.id ?? '',
    price: product ? String(product.basePrice / 100) : '',
    imageUrl: product?.imageUrl ?? '',
    active: product?.active ?? true,
    availableKiosk: product?.availableKiosk ?? true,
    availablePos: product?.availablePos ?? true,
    availableMobile: product?.availableMobile ?? true,
    nameKa: tr('ka')?.name ?? '',
    descKa: tr('ka')?.description ?? '',
    nameEn: tr('en')?.name ?? '',
    descEn: tr('en')?.description ?? '',
    nameRu: tr('ru')?.name ?? '',
    descRu: tr('ru')?.description ?? '',
  });
  const [cfg, setCfg] = useState<ProductionConfigInput>({
    productionRequired: product?.productionConfig.productionRequired ?? true,
    stationId: product?.productionConfig.stationId ?? null,
    productionTimeMinutes: product?.productionConfig.productionTimeMinutes ?? 10,
    preparationBufferMinutes: product?.productionConfig.preparationBufferMinutes ?? 0,
    capacityUnits: product?.productionConfig.capacityUnits ?? 1,
    priority: product?.productionConfig.priority ?? 0,
  });
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const translations = [
      { locale: 'ka' as const, name: form.nameKa, description: form.descKa || null },
      ...(form.nameEn ? [{ locale: 'en' as const, name: form.nameEn, description: form.descEn || null }] : []),
      ...(form.nameRu ? [{ locale: 'ru' as const, name: form.nameRu, description: form.descRu || null }] : []),
    ];
    const body = {
      sku: form.sku,
      categoryId: form.categoryId,
      basePrice: Math.round(Number(form.price) * 100),
      imageUrl: form.imageUrl || null,
      active: form.active,
      availableKiosk: form.availableKiosk,
      availablePos: form.availablePos,
      availableMobile: form.availableMobile,
      translations,
      ...(can('catalog.production_config_write') ? { productionConfig: cfg } : {}),
    };
    const r = await submit(() => (product ? api.catalog.updateProduct(product.id, body) : api.catalog.createProduct(body)), 'შენახულია');
    if (r) onSaved();
  };

  return (
    <Modal open onClose={onClose} title={product ? `პროდუქტი · ${product.sku}` : 'ახალი პროდუქტი'} size="xl"
      footer={
        <>
          {product && can('catalog.write') && (
            <div className="mr-auto flex gap-2">
              {product.active ? (
                <Button variant="outline" onClick={async () => (await submit(() => api.catalog.setProductState(product.id, 'disable'), 'გამორთულია')) && onSaved()}>DISABLE</Button>
              ) : (
                <Button variant="outline" onClick={async () => (await submit(() => api.catalog.setProductState(product.id, 'enable'), 'ჩართულია')) && onSaved()}>ENABLE</Button>
              )}
              {!product.archivedAt && (
                <Button variant="danger" onClick={async () => (await submit(() => api.catalog.setProductState(product.id, 'archive'), 'დაარქივდა')) && onSaved()}>ARCHIVE</Button>
              )}
            </div>
          )}
          <Button variant="outline" onClick={onClose}>გაუქმება</Button>
          {can('catalog.write') && <Button loading={busy} onClick={save}>შენახვა</Button>}
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">კატალოგი {product?.externalSource && <span className="ml-1 rounded bg-canvas px-1 normal-case">imported from {product.externalSource}</span>}</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU"><Input value={form.sku} onChange={(e) => set('sku', e.target.value)} disabled={!!product} /></Field>
            <Field label="ფასი (₾)"><Input value={form.price} onChange={(e) => set('price', e.target.value)} inputMode="decimal" /></Field>
          </div>
          <Field label="კატეგორია">
            <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="სურათი (URL)"><Input value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} /></Field>
          <Field label="დასახელება (KA)"><Input value={form.nameKa} onChange={(e) => set('nameKa', e.target.value)} /></Field>
          <Field label="აღწერა (KA)"><Input value={form.descKa} onChange={(e) => set('descKa', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name (EN)"><Input value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></Field>
            <Field label="Название (RU)"><Input value={form.nameRu} onChange={(e) => set('nameRu', e.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 pt-2">
            <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Active" />
            <Toggle checked={form.availableKiosk} onChange={(v) => set('availableKiosk', v)} label="Kiosk" />
            <Toggle checked={form.availablePos} onChange={(v) => set('availablePos', v)} label="POS" />
            <Toggle checked={form.availableMobile} onChange={(v) => set('availableMobile', v)} label="Mobile" />
          </div>
        </div>
        <div className="space-y-3 rounded-xl bg-canvas p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">წარმოების პარამეტრები (შიდა მონაცემები – იმპორტი არ ცვლის)</div>
          <Toggle checked={cfg.productionRequired} onChange={(v) => setCfg({ ...cfg, productionRequired: v })} label="Production required" />
          <Field label="Station" hint={cfg.productionRequired && !cfg.stationId ? 'აუცილებელია წარმოებისთვის' : undefined}>
            <Select value={cfg.stationId ?? ''} onChange={(e) => setCfg({ ...cfg, stationId: e.target.value || null })} disabled={!cfg.productionRequired}>
              <option value="">—</option>
              {stations.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {branches.find((b) => b.id === s.branchId)?.code} · {s.code}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (min)"><Input type="number" value={cfg.productionTimeMinutes} onChange={(e) => setCfg({ ...cfg, productionTimeMinutes: Number(e.target.value) })} /></Field>
            <Field label="Buffer (min)"><Input type="number" value={cfg.preparationBufferMinutes} onChange={(e) => setCfg({ ...cfg, preparationBufferMinutes: Number(e.target.value) })} /></Field>
            <Field label="Capacity cost"><Input type="number" value={cfg.capacityUnits} onChange={(e) => setCfg({ ...cfg, capacityUnits: Number(e.target.value) })} /></Field>
            <Field label="Priority"><Input type="number" value={cfg.priority} onChange={(e) => setCfg({ ...cfg, priority: Number(e.target.value) })} /></Field>
          </div>
          {product && product.branchOverrides.length > 0 && (
            <div className="text-xs text-ink-muted">Branch overrides: {product.branchOverrides.map((b) => `${branches.find((x) => x.id === b.branchId)?.code ?? b.branchId}${b.priceOverride !== null ? ` ${formatGel(b.priceOverride)}` : ''}${b.available ? '' : ' (off)'}`).join(', ')}</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── categories ────────────────────────────────

export function CategoriesPage() {
  const { api } = useSession();
  const { can } = useAdmin();
  const categories = useResource(() => api.catalog.categories(), []);
  const [editing, setEditing] = useState<CategoryView | 'new' | null>(null);
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState({ code: '', nameKa: '', nameEn: '', nameRu: '', sortOrder: '0', active: true });
  useEffect(() => {
    if (editing && editing !== 'new') setForm({ code: editing.code, nameKa: editing.nameKa, nameEn: editing.nameEn ?? '', nameRu: editing.nameRu ?? '', sortOrder: String(editing.sortOrder), active: editing.active });
    if (editing === 'new') setForm({ code: '', nameKa: '', nameEn: '', nameRu: '', sortOrder: '0', active: true });
  }, [editing]);

  return (
    <>
      <PageTitle title="Categories" actions={can('catalog.write') && <Button onClick={() => setEditing('new')}>+ კატეგორია</Button>} />
      <Table<CategoryView>
        rows={categories.data ?? []}
        rowKey={(c) => c.id}
        onRow={(c) => setEditing(c)}
        columns={[
          { key: 'order', label: '#', render: (c) => c.sortOrder },
          { key: 'code', label: 'Code', render: (c) => <span className="font-mono text-xs">{c.code}</span> },
          { key: 'ka', label: 'KA', render: (c) => c.nameKa },
          { key: 'en', label: 'EN', render: (c) => c.nameEn },
          { key: 'ru', label: 'RU', render: (c) => c.nameRu },
          { key: 'active', label: 'Active', render: (c) => (c.active ? '✓' : '—') },
        ]}
      />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'ახალი კატეგორია' : 'კატეგორია'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>გაუქმება</Button>
            <Button loading={busy} onClick={async () => {
              const body = { code: form.code, nameKa: form.nameKa, nameEn: form.nameEn || null, nameRu: form.nameRu || null, sortOrder: Number(form.sortOrder), active: form.active };
              const r = await submit(() => (editing === 'new' ? api.catalog.createCategory(body) : api.catalog.updateCategory((editing as CategoryView).id, body)), 'შენახულია');
              if (r) { setEditing(null); void categories.refresh(); }
            }}>შენახვა</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code (A-Z0-9_)"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} disabled={editing !== 'new'} /></Field>
          <Field label="Sort order"><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
          <Field label="KA"><Input value={form.nameKa} onChange={(e) => setForm({ ...form, nameKa: e.target.value })} /></Field>
          <Field label="EN"><Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
          <Field label="RU"><Input value={form.nameRu} onChange={(e) => setForm({ ...form, nameRu: e.target.value })} /></Field>
          <div className="pt-6"><Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" /></div>
        </div>
      </Modal>
    </>
  );
}

// ───────────────────────────── import (spec §21–23) ──────────────────────

export function ImportPage() {
  const { api } = useSession();
  const { submit, busy } = useSubmit();
  const history = useResource(() => api.imports.list(), []);
  const [source, setSource] = useState<'MADART_GE' | 'JSON_SNAPSHOT'>('MADART_GE');
  const [preview, setPreview] = useState<ImportPreviewView | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; unchanged: number; categoriesCreated: number } | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'NEW' | 'UPDATE' | 'UNCHANGED'>('ALL');

  return (
    <>
      <PageTitle title="Products → Import → Madart.ge" subtitle="madart.ge არ არის runtime dependency: მონაცემები ინახება საკუთარ ბაზაში, შემდეგ იმართება Admin-იდან" />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <Field label="წყარო">
          <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="MADART_GE">madart.ge (live, snapshot fallback)</option>
            <option value="JSON_SNAPSHOT">JSON snapshot (packages/database/seed)</option>
          </Select>
        </Field>
        <Button loading={busy} onClick={async () => { setResult(null); const p = await submit(() => api.imports.preview(source)); if (p) setPreview(p); }}>
          PREVIEW
        </Button>
        {preview && preview.status === 'PREVIEW' && (
          <Button variant="success" loading={busy} onClick={async () => {
            const r = await submit(() => api.imports.commit(preview.importId), 'იმპორტი დასრულდა');
            if (r) { setResult(r); setPreview({ ...preview, status: 'IMPORTED' }); void history.refresh(); }
          }}>
            IMPORT PRODUCTS
          </Button>
        )}
      </div>

      {result && (
        <div className="mb-4 rounded-xl bg-ok-soft p-4 text-ok">
          Imported: <b>{result.created}</b> new · <b>{result.updated}</b> updated · {result.unchanged} unchanged · {result.categoriesCreated} new categories
        </div>
      )}

      {preview && (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <SummaryTile label="Found" value={`${preview.summary.productsFound} Products · ${preview.summary.categoriesFound} Categories`} />
            <SummaryTile label="New" value={preview.summary.newProducts} tone="text-ok" />
            <SummaryTile label="Existing" value={preview.summary.existingProducts} />
            <SummaryTile label="Updated" value={preview.summary.updatedProducts} tone="text-warn" />
          </div>
          {preview.warnings.length > 0 && (
            <div className="mb-4 rounded-xl bg-warn-soft p-3 text-sm text-warn">
              {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
          <div className="mb-2 flex gap-2">
            {(['ALL', 'NEW', 'UPDATE', 'UNCHANGED'] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? 'secondary' : 'outline'} onClick={() => setFilter(f)}>{f}</Button>
            ))}
            <span className="ml-auto text-xs text-ink-muted">Categories: {preview.categories.map((c) => `${c.code}${c.isNew ? ' (new)' : ''}`).join(', ')}</span>
          </div>
          <Table
            rows={preview.items.filter((i) => filter === 'ALL' || i.action === filter)}
            rowKey={(i) => i.externalId}
            columns={[
              { key: 'img', label: '', render: (i) => (i.imageUrl ? <img src={i.imageUrl} alt="" className="h-10 w-12 rounded object-cover" /> : null) },
              { key: 'name', label: 'Name', render: (i) => i.name },
              { key: 'cat', label: 'Category', render: (i) => <span className="font-mono text-xs">{i.categoryCode}</span> },
              { key: 'price', label: 'Price', render: (i) => formatGel(i.price), className: 'text-right tabular' },
              { key: 'ext', label: 'External ID', render: (i) => <span className="font-mono text-xs">{i.externalId}</span> },
              { key: 'action', label: 'Action', render: (i) => <Badge className={i.action === 'NEW' ? 'bg-green-100 text-green-800' : i.action === 'UPDATE' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}>{i.action}{i.changedFields.length ? ` (${i.changedFields.join(', ')})` : ''}</Badge> },
            ]}
          />
        </>
      )}

      <h3 className="mb-2 mt-8 font-bold">Import history</h3>
      {!history.data ? <Spinner /> : (
        <Table
          rows={history.data}
          rowKey={(h) => h.id}
          columns={[
            { key: 'at', label: 'Created', render: (h) => new Date(h.createdAt).toLocaleString('ka-GE') },
            { key: 'src', label: 'Source', render: (h) => h.source },
            { key: 'status', label: 'Status', render: (h) => h.status },
            { key: 'sum', label: 'Summary', render: (h) => { const s = h.summary as { productsFound?: number; newProducts?: number; updatedProducts?: number }; return `${s.productsFound ?? 0} found · ${s.newProducts ?? 0} new · ${s.updatedProducts ?? 0} updated`; } },
          ]}
        />
      )}
    </>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${tone ?? ''}`}>{value}</div>
    </div>
  );
}

// ───────────────────────────── promotions (kiosk/mobile banner) ──────────

export function PromotionsPage() {
  const { api } = useSession();
  const { branches, can } = useAdmin();
  const promotions = useResource(() => api.promotions.list(), []);
  const products = useResource(() => api.catalog.products({ includeArchived: true }), []);
  const [editing, setEditing] = useState<AdminPromotionView | 'new' | null>(null);
  const branchName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.name : 'ყველა ფილიალი') ?? id;
  const productName = (id: string | null) => (id ? (products.data?.find((p) => p.id === id) ? adminProductName(products.data.find((p) => p.id === id)!) : '…') : null);

  const isLive = (p: AdminPromotionView) => {
    const now = Date.now();
    if (!p.active) return false;
    if (p.startsAt && new Date(p.startsAt).getTime() > now) return false;
    if (p.endsAt && new Date(p.endsAt).getTime() <= now) return false;
    return true;
  };

  return (
    <>
      <PageTitle
        title="Promotions"
        subtitle="კიოსკზე და მობილურში მოტივტივე სარეკლამო/საინფორმაციო ბანერი"
        actions={can('catalog.write') && <Button onClick={() => setEditing('new')}>+ CREATE PROMOTION</Button>}
      />
      <Table<AdminPromotionView>
        rows={promotions.data ?? []}
        rowKey={(p) => p.id}
        onRow={(p) => setEditing(p)}
        columns={[
          { key: 'img', label: '', render: (p) => <img src={p.imageUrl} alt="" className="h-10 w-16 rounded object-cover" /> },
          {
            key: 'title',
            label: 'სათაური',
            render: (p) => (
              <div>
                <div className="font-semibold">{p.titleKa}</div>
                {p.subtitleKa && <div className="text-xs text-ink-muted">{p.subtitleKa}</div>}
                {p.linkProductId && <div className="mt-0.5 text-xs text-info">→ {productName(p.linkProductId)}</div>}
              </div>
            ),
          },
          { key: 'branch', label: 'ფილიალი', render: (p) => <span className="text-xs">{branchName(p.branchId)}</span> },
          {
            key: 'kind',
            label: 'ადგილი',
            render: (p) =>
              p.kind === 'NEW_PRODUCT' ? (
                <Badge className="bg-emerald-100 text-emerald-800">ახალი პროდუქტი</Badge>
              ) : p.kind === 'DISCOUNT' ? (
                <Badge className="bg-rose-100 text-rose-800">ფასდაკლება</Badge>
              ) : (
                <Badge className="bg-gray-100 text-gray-600">ზოგადი</Badge>
              ),
          },
          { key: 'order', label: '#', render: (p) => p.sortOrder },
          {
            key: 'window',
            label: 'პერიოდი',
            render: (p) =>
              p.startsAt || p.endsAt ? (
                <span className="text-xs text-ink-muted">
                  {p.startsAt ? new Date(p.startsAt).toLocaleDateString('ka-GE') : '…'} – {p.endsAt ? new Date(p.endsAt).toLocaleDateString('ka-GE') : '…'}
                </span>
              ) : (
                <span className="text-xs text-ink-muted">უვადოდ</span>
              ),
          },
          {
            key: 'status',
            label: 'სტატუსი',
            render: (p) =>
              isLive(p) ? (
                <Badge className="bg-green-100 text-green-800">LIVE</Badge>
              ) : p.active ? (
                <Badge className="bg-amber-100 text-amber-800">SCHEDULED</Badge>
              ) : (
                <Badge className="bg-gray-100 text-gray-600">OFF</Badge>
              ),
          },
        ]}
        empty="სარეკლამო ბანერები ჯერ არ არის"
      />
      {editing && (
        <PromotionEditor
          promotion={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void promotions.refresh();
          }}
        />
      )}
    </>
  );
}

const adminProductName = (p: AdminProductView) => p.translations.find((t) => t.locale === 'ka')?.name ?? p.translations[0]?.name ?? p.sku;

function PromotionEditor({ promotion, onClose, onSaved }: { promotion: AdminPromotionView | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useSession();
  const { branches, can } = useAdmin();
  const { submit, busy } = useSubmit();
  const products = useResource(() => api.catalog.products({}), []);
  const categories = useResource(() => api.catalog.categories(), []);
  const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
  const [form, setForm] = useState({
    branchId: promotion?.branchId ?? '',
    linkProductId: promotion?.linkProductId ?? '',
    kind: promotion?.kind ?? 'GENERAL',
    badgeText: promotion?.badgeText ?? '',
    titleKa: promotion?.titleKa ?? '',
    titleEn: promotion?.titleEn ?? '',
    titleRu: promotion?.titleRu ?? '',
    subtitleKa: promotion?.subtitleKa ?? '',
    subtitleEn: promotion?.subtitleEn ?? '',
    subtitleRu: promotion?.subtitleRu ?? '',
    imageUrl: promotion?.imageUrl ?? '',
    active: promotion?.active ?? true,
    sortOrder: String(promotion?.sortOrder ?? 0),
    startsAt: toDateInput(promotion?.startsAt ?? null),
    endsAt: toDateInput(promotion?.endsAt ?? null),
  });

  const save = async () => {
    const body = {
      branchId: form.branchId || null,
      linkProductId: form.linkProductId || null,
      kind: form.kind,
      badgeText: form.badgeText || null,
      titleKa: form.titleKa,
      titleEn: form.titleEn || null,
      titleRu: form.titleRu || null,
      subtitleKa: form.subtitleKa || null,
      subtitleEn: form.subtitleEn || null,
      subtitleRu: form.subtitleRu || null,
      imageUrl: form.imageUrl,
      active: form.active,
      sortOrder: Number(form.sortOrder),
      startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00Z`).toISOString() : null,
      endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59Z`).toISOString() : null,
    };
    const r = await submit(() => (promotion ? api.promotions.update(promotion.id, body) : api.promotions.create(body)), 'შენახულია');
    if (r) onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={promotion ? 'ბანერის რედაქტირება' : 'ახალი ბანერი'}
      size="lg"
      footer={
        <>
          {promotion && can('catalog.write') && (
            <Button
              variant="danger"
              className="mr-auto"
              loading={busy}
              onClick={async () => {
                await submit(() => api.promotions.remove(promotion.id), 'წაშლილია');
                onSaved();
              }}
            >
              წაშლა
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            გაუქმება
          </Button>
          {can('catalog.write') && (
            <Button loading={busy} disabled={!form.titleKa || !form.imageUrl} onClick={save}>
              შენახვა
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="მიბმული პროდუქტი — კიოსკზე ბანერზე დაჭერით გაიხსნება">
          <Select
            value={form.linkProductId}
            onChange={(e) => {
              const product = products.data?.find((p) => p.id === e.target.value);
              // picking a product fills the still-empty fields so a "new product" banner is two clicks
              setForm({
                ...form,
                linkProductId: e.target.value,
                imageUrl: form.imageUrl || product?.imageUrl || '',
                titleKa: form.titleKa || (product ? adminProductName(product) : ''),
              });
            }}
          >
            <option value="">— არცერთი (მხოლოდ ინფორმაცია) —</option>
            {(categories.data ?? []).map((c) => {
              const inCategory = (products.data ?? []).filter((p) => p.categoryId === c.id && !p.archivedAt);
              if (inCategory.length === 0) return null;
              return (
                <optgroup key={c.id} label={c.nameKa}>
                  {inCategory.map((p) => (
                    <option key={p.id} value={p.id}>
                      {adminProductName(p)}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        </Field>
        <Field label="სურათის URL (თანაფარდობა ~16:9)">
          <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label="ფილიალი">
          <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
            <option value="">ყველა ფილიალი</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="სად გამოჩნდეს">
          <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}>
            <option value="GENERAL">ზოგადი (მხოლოდ მისალმების ეკრანზე)</option>
            <option value="NEW_PRODUCT">ახალი პროდუქტი (+ ცალკე ბლოკი კატალოგში)</option>
            <option value="DISCOUNT">ფასდაკლება (+ ცალკე ბლოკი კატალოგში)</option>
          </Select>
        </Field>
        <Field label="ბეიჯის ტექსტი (არასავალდებულო, მაგ. -15% ან ახალი)">
          <Input value={form.badgeText} onChange={(e) => setForm({ ...form, badgeText: e.target.value })} placeholder={form.kind === 'DISCOUNT' ? '-15%' : 'ახალი'} />
        </Field>
        {form.imageUrl && (
          <div className="md:col-span-2">
            <img src={form.imageUrl} alt="" className="h-32 w-full rounded-xl object-cover" />
          </div>
        )}
        <Field label="სათაური (KA)">
          <Input value={form.titleKa} onChange={(e) => setForm({ ...form, titleKa: e.target.value })} />
        </Field>
        <Field label="ქვესათაური (KA)">
          <Input value={form.subtitleKa} onChange={(e) => setForm({ ...form, subtitleKa: e.target.value })} />
        </Field>
        <Field label="Title (EN)">
          <Input value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
        </Field>
        <Field label="Subtitle (EN)">
          <Input value={form.subtitleEn} onChange={(e) => setForm({ ...form, subtitleEn: e.target.value })} />
        </Field>
        <Field label="Название (RU)">
          <Input value={form.titleRu} onChange={(e) => setForm({ ...form, titleRu: e.target.value })} />
        </Field>
        <Field label="Подзаголовок (RU)">
          <Input value={form.subtitleRu} onChange={(e) => setForm({ ...form, subtitleRu: e.target.value })} />
        </Field>
        <Field label="დაწყება (არასავალდებულო)">
          <Input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
        </Field>
        <Field label="დასრულება (არასავალდებულო)">
          <Input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        </Field>
        <Field label="თანმიმდევრობა">
          <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
        </Field>
        <div className="pt-6">
          <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="აქტიური" />
        </div>
      </div>
    </Modal>
  );
}
