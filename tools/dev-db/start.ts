/**
 * Starts an embedded PostgreSQL 17 for local development (ASSUMPTION A-08).
 *
 * Why not the `embedded-postgres` wrapper? The PostgreSQL Windows binaries
 * cannot run from a path containing non-ASCII characters (this repo lives in a
 * Georgian-named folder), so on Windows the binaries and the data directory
 * are placed under %LOCALAPPDATA%\madart-dev-db. Elsewhere <repo>/.local is used.
 *
 *   pnpm db:local
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const isWin = process.platform === 'win32';
const port = Number(process.env.DEV_DB_PORT ?? 5433);
const user = 'madart';
const password = 'madart';
const database = 'madart';
const ext = isWin ? '.exe' : '';
let serverProcess: ReturnType<typeof spawn> | undefined;

function platformPackage(): string {
  const key = `${process.platform}-${process.arch}`;
  const map: Record<string, string> = {
    'win32-x64': '@embedded-postgres/windows-x64',
    'linux-x64': '@embedded-postgres/linux-x64',
    'linux-arm64': '@embedded-postgres/linux-arm64',
    'darwin-arm64': '@embedded-postgres/darwin-arm64',
    'darwin-x64': '@embedded-postgres/darwin-x64',
  };
  const pkg = map[key];
  if (!pkg) throw new Error(`No embedded PostgreSQL binaries for ${key}`);
  return pkg;
}

function resolveBinaries(): { binDir: string; home: string } {
  const pkg = platformPackage();
  // The binary packages only export ./dist/index.js, so resolve that and walk up.
  const pkgDir = path.resolve(path.dirname(require.resolve(pkg)), '..');
  const version = (JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as { version: string }).version;
  const nativeDir = path.join(pkgDir, 'native');

  const home = isWin
    ? path.join(process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? root, 'AppData', 'Local'), 'madart-dev-db')
    : path.join(root, '.local', 'dev-db');
  mkdirSync(home, { recursive: true });

  // eslint-disable-next-line no-control-regex
  const nonAscii = /[^\x00-\x7F]/.test(nativeDir);
  if (isWin || nonAscii) {
    const copyDir = path.join(home, `pg-${version}`);
    if (!existsSync(path.join(copyDir, 'bin', `postgres${ext}`))) {
      console.log(`[dev-db] copying PostgreSQL binaries to ${copyDir} (one-time, ~100 MB)`);
      cpSync(nativeDir, copyDir, { recursive: true });
    }
    return { binDir: path.join(copyDir, 'bin'), home };
  }
  return { binDir: path.join(nativeDir, 'bin'), home };
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const res = spawnSync(cmd, args, { stdio: 'pipe', env: { ...process.env, ...env } });
  if (res.status !== 0) {
    throw new Error(`${path.basename(cmd)} failed (${res.status ?? res.error?.message}):\n${res.stderr?.toString() ?? ''}${res.stdout?.toString() ?? ''}`);
  }
  return res.stdout?.toString() ?? '';
}

async function main() {
  const { binDir, home } = resolveBinaries();
  const dataDir = path.join(home, 'data');
  const bin = (name: string) => path.join(binDir, `${name}${ext}`);
  const fresh = !existsSync(path.join(dataDir, 'PG_VERSION'));

  if (fresh) {
    console.log(`[dev-db] initialising cluster in ${dataDir}`);
    rmSync(dataDir, { recursive: true, force: true });
    const pwfile = path.join(tmpdir(), `madart-pg-pw-${process.pid}`);
    writeFileSync(pwfile, `${password}\n`);
    try {
      run(bin('initdb'), [
        `--pgdata=${dataDir}`,
        '--auth=password',
        `--username=${user}`,
        `--pwfile=${pwfile}`,
        '--encoding=UTF8',
        '--locale=C',
        '--lc-messages=C',
      ]);
    } finally {
      rmSync(pwfile, { force: true });
    }
  }

  // stale postmaster.pid after a crash prevents startup
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (existsSync(pidFile)) rmSync(pidFile, { force: true });

  console.log(`[dev-db] starting PostgreSQL on port ${port}`);
  const server = spawn(bin('postgres'), ['-D', dataDir, '-p', String(port), '-c', 'listen_addresses=localhost'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LC_MESSAGES: 'C' },
  });
  serverProcess = server;

  await new Promise<void>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      process.stderr.write(text.split('\n').filter(Boolean).map((l) => `[pg] ${l}\n`).join(''));
      if (text.includes('database system is ready to accept connections')) resolve();
    };
    server.stderr.on('data', onData);
    server.stdout.on('data', onData);
    server.on('exit', (code) => reject(new Error(`postgres exited early with code ${code}`)));
  });

  if (fresh) {
    console.log(`[dev-db] creating database "${database}"`);
    // The embedded bundle ships no createdb/psql – use the pg driver instead.
    const client = new Client({ host: '127.0.0.1', port, user, password, database: 'postgres' });
    await client.connect();
    try {
      await client.query(`CREATE DATABASE "${database}" ENCODING 'UTF8' TEMPLATE template0`);
    } finally {
      await client.end();
    }
  }

  console.log(`[dev-db] PostgreSQL ready: postgresql://${user}:${password}@localhost:${port}/${database}`);
  console.log('[dev-db] press Ctrl+C to stop');

  const stop = () => {
    console.log('\n[dev-db] stopping…');
    spawnSync(bin('pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast'], { stdio: 'inherit' });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.on('exit', (code) => {
    console.log(`[dev-db] postgres exited (${code})`);
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[dev-db] failed:', err instanceof Error ? err.message : err);
  serverProcess?.kill();
  process.exit(1);
});
