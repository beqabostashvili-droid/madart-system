import { type ApiError } from '@madart/api-client';
import { deriveProductionDisplayStatus, type ProductionDisplayStatus } from '@madart/domain';
import type { DeviceProfile, ProductionBoardView, ProductionTaskView } from '@madart/types';
import {
  Button,
  Card,
  ConnectionBadge,
  cx,
  formatCountdown,
  formatTime,
  Input,
  OfflineBanner,
  productionStatusStyles,
  Spinner,
  useConnectionState,
  useNow,
  useRealtimeEvents,
  useResource,
  useSession,
  useToast,
} from '@madart/ui';
import { useCallback, useMemo, useState } from 'react';

const BOARD_EVENTS = ['PRODUCTION_TASK_CREATED', 'PRODUCTION_STARTED', 'PRODUCTION_ITEM_READY', 'PRODUCTION_TASK_CANCELLED', 'PRODUCTION_STARTING_SOON', 'ORDER_CANCELLED'] as const;

export function App() {
  const { api, rt, token, setToken } = useSession();
  const toast = useToast();
  const connection = useConnectionState(rt);
  const now = useNow(1000, rt);
  const [showUpcoming, setShowUpcoming] = useState(false);

  const device = useResource<DeviceProfile>(() => api.auth.device(), [token], { enabled: !!token });
  const board = useResource<ProductionBoardView>(() => api.production.board({ branchId: device.data!.branchId, stationId: device.data!.stationId ?? undefined }), [device.data?.id], {
    enabled: !!device.data,
    pollMs: 15_000, // safety net behind realtime
  });

  // realtime: any task event for this station → refetch the snapshot
  useRealtimeEvents(rt, () => void board.refresh(), [...BOARD_EVENTS]);

  const act = useCallback(
    async (task: ProductionTaskView, action: 'start' | 'ready') => {
      try {
        const updated = action === 'start' ? await api.production.start(task.id) : await api.production.ready(task.id);
        board.setData((prev) => (prev ? { ...prev, tasks: prev.tasks.map((t) => (t.id === updated.id ? updated : t)) } : prev));
        if (action === 'ready') toast.success(`${task.publicNumber} · ${task.productName}`, 'მზადაა');
      } catch (e) {
        const err = e as ApiError;
        if (err.isConflict) toast.warning('უკვე შესრულებულია', 'სხვა თანამშრომელმა უკვე დააჭირა');
        else toast.error('შეცდომა', err.message);
      } finally {
        void board.refresh();
      }
    },
    [api, board, toast],
  );

  if (!token) return <Pairing onToken={setToken} />;
  if (device.error?.isUnauthorized) return <Pairing onToken={setToken} error={device.error.message} />;
  if (!device.data || !board.data) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="h-12 w-12 text-brand-dark" />
      </div>
    );
  }

  const thresholds = board.data.thresholds;
  const derive = (t: ProductionTaskView): ProductionDisplayStatus => deriveProductionDisplayStatus(t, now, thresholds);
  const tasks = board.data.tasks;
  const counts = tasks.reduce<Record<string, number>>((acc, t) => {
    const s = derive(t);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex h-dvh flex-col bg-ink text-white">
      <OfflineBanner state={connection} />
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-4">
          <span className="rounded-lg bg-brand px-3 py-1 text-lg font-extrabold text-brand-ink">MADART</span>
          <div>
            <div className="text-xl font-bold">{device.data.stationCode ?? 'ყველა სტანცია'}</div>
            <div className="text-xs text-white/60">
              {device.data.branchName} · {device.data.name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Counter label="დაგვიანება" n={counts.LATE ?? 0} className="bg-status-late" />
          <Counter label="ახლავე" n={counts.START_NOW ?? 0} className="bg-status-start-now" />
          <Counter label="მზადდება" n={counts.IN_PRODUCTION ?? 0} className="bg-status-in-production" />
          <Button variant={showUpcoming ? 'primary' : 'outline'} size="sm" onClick={() => setShowUpcoming(!showUpcoming)} className={!showUpcoming ? 'border-white/30 bg-transparent text-white' : ''}>
            მომავალი ({board.data.upcoming.length})
          </Button>
          <div className="tabular text-3xl font-bold">{formatTime(now)}</div>
          <ConnectionBadge state={connection} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {showUpcoming ? (
          <TaskGrid tasks={board.data.upcoming} now={now} derive={derive} onAct={act} empty="მომავალი შეკვეთები არ არის" />
        ) : (
          <TaskGrid tasks={tasks} now={now} derive={derive} onAct={act} empty="ამ სტანციაზე ამჟამად სამუშაო არ არის" />
        )}
      </main>

      {board.data.readyRecent.length > 0 && (
        <footer className="flex items-center gap-2 overflow-x-auto border-t border-white/10 px-4 py-2 scrollbar-none">
          <span className="shrink-0 text-xs uppercase tracking-wider text-white/50">მზადაა</span>
          {board.data.readyRecent.map((t) => (
            <span key={t.id} className="shrink-0 rounded-full bg-status-ready/20 px-3 py-1 text-sm font-semibold text-green-300">
              {t.publicNumber} · {t.productName} ×{t.quantity}
            </span>
          ))}
        </footer>
      )}
    </div>
  );
}

function Counter({ label, n, className }: { label: string; n: number; className: string }) {
  return (
    <div className={cx('flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold', n ? className : 'bg-white/10 text-white/50')}>
      <span className="tabular text-lg">{n}</span>
      {label}
    </div>
  );
}

function TaskGrid({
  tasks,
  now,
  derive,
  onAct,
  empty,
}: {
  tasks: ProductionTaskView[];
  now: Date;
  derive: (t: ProductionTaskView) => ProductionDisplayStatus;
  onAct: (t: ProductionTaskView, a: 'start' | 'ready') => void;
  empty: string;
}) {
  const sorted = useMemo(() => tasks, [tasks]);
  if (sorted.length === 0) return <div className="flex h-full items-center justify-center text-2xl text-white/40">{empty}</div>;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-4">
      {sorted.map((t) => (
        <TaskCard key={t.id} task={t} status={derive(t)} now={now} onAct={onAct} />
      ))}
    </div>
  );
}

function TaskCard({ task, status, now, onAct }: { task: ProductionTaskView; status: ProductionDisplayStatus; now: Date; onAct: (t: ProductionTaskView, a: 'start' | 'ready') => void }) {
  const style = productionStatusStyles[status];
  const startIn = new Date(task.plannedStartAt).getTime() - now.getTime();
  const readyIn = new Date(task.plannedReadyAt).getTime() - now.getTime();
  const inProduction = task.status === 'IN_PRODUCTION';
  const [busy, setBusy] = useState(false);

  return (
    <Card className={cx('flex flex-col gap-3 border-0 p-0 text-ink', status === 'LATE' && 'animate-late')}>
      <div className={cx('flex items-center justify-between rounded-t-card px-4 py-2 text-white', style.bar)}>
        <span className="text-3xl font-extrabold tracking-wider">{task.publicNumber}</span>
        <span className="flex items-center gap-2 text-sm font-semibold uppercase">
          <span className="rounded bg-black/20 px-1.5 py-0.5 text-[11px] tracking-wider">{task.stationCode}</span>
          {style.labelKa}
        </span>
      </div>
      <div className="px-4">
        <div className="text-2xl font-bold leading-tight">
          <span className="mr-2 inline-block rounded-lg bg-canvas px-2 text-ink">×{task.quantity}</span>
          {task.productName}
        </div>
        {task.note && <div className="mt-1 rounded-lg bg-warn-soft px-2 py-1 text-sm text-warn">📝 {task.note}</div>}
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-ink-muted">
          <div>
            <div className="text-xs uppercase">დაწყება</div>
            <div className="tabular text-lg font-semibold text-ink">{formatTime(task.plannedStartAt)}</div>
          </div>
          <div>
            <div className="text-xs uppercase">მზად უნდა იყოს</div>
            <div className="tabular text-lg font-semibold text-ink">{formatTime(task.plannedReadyAt)}</div>
          </div>
        </div>
        <div className={cx('mt-2 tabular text-xl font-bold', status === 'LATE' ? 'text-danger' : 'text-ink-muted')}>
          {inProduction ? (readyIn >= 0 ? `დარჩა ${formatCountdown(readyIn)}` : `გადაცილება ${formatCountdown(-readyIn)}`) : startIn >= 0 ? `იწყება ${formatCountdown(startIn)}-ში` : `უნდა დაწყებულიყო ${formatCountdown(-startIn)} წინ`}
        </div>
      </div>
      <div className="p-3 pt-0">
        {task.status === 'SCHEDULED' && (
          <Button
            size="xl"
            block
            variant={status === 'SCHEDULED' ? 'outline' : 'secondary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onAct(task, 'start');
              setBusy(false);
            }}
          >
            ▶ START
          </Button>
        )}
        {inProduction && (
          <Button
            size="xl"
            block
            variant="success"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onAct(task, 'ready');
              setBusy(false);
            }}
          >
            ✓ READY
          </Button>
        )}
      </div>
    </Card>
  );
}

function Pairing({ onToken, error }: { onToken: (t: string) => void; error?: string }) {
  const [v, setV] = useState('');
  return (
    <div className="flex h-dvh items-center justify-center bg-ink p-8">
      <Card className="w-full max-w-lg space-y-4 p-8">
        <div className="text-2xl font-bold">Production ეკრანი არ არის დარეგისტრირებული</div>
        <p className="text-ink-muted">ჩასვით მოწყობილობის ტოკენი Admin → Production Devices-იდან.</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="device token" />
        <Button block size="lg" disabled={!v.trim()} onClick={() => onToken(v.trim())}>
          დაკავშირება
        </Button>
      </Card>
    </div>
  );
}
