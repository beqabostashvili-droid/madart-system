# MADART desktop launcher (Windows).
#   launch.ps1 -App kiosk | pos | production
# Ensures the dev database, the API and the app's dev server are running
# (each in its own minimized window), then opens the Electron window.
param(
  [Parameter(Mandatory = $true)][ValidateSet('kiosk', 'pos', 'production', 'admin', 'dispatcher', 'display', 'mobile')][string]$App
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

$ports = @{ kiosk = 5173; pos = 5174; production = 5175; admin = 3001; dispatcher = 3002; display = 3003; mobile = 3004 }
$packages = @{ kiosk = 'kiosk'; pos = 'pos'; production = 'production'; admin = 'admin'; dispatcher = 'dispatcher'; display = 'customer-display'; mobile = 'mobile-ordering' }
$webApps = @('admin', 'dispatcher', 'display', 'mobile')
$names = @{ kiosk = 'MADART კიოსკი'; pos = 'MADART სალარო'; production = 'MADART წარმოება'; admin = 'MADART ადმინი'; dispatcher = 'MADART დისპეტჩერი'; display = 'MADART მომხმარებლის ეკრანი'; mobile = 'MADART მობილური' }
# Explorer-launched processes often miss the npm global dir on PATH -> add the
# usual Node/pnpm locations explicitly before resolving pnpm.
$extraPaths = @(
  (Join-Path $env:APPDATA 'npm'),
  (Join-Path $env:LOCALAPPDATA 'pnpm'),
  (Join-Path $env:ProgramFiles 'nodejs')
) | Where-Object { $_ -and (Test-Path $_) }
$env:Path = ($extraPaths + ($env:Path -split ';')) -join ';'
$pnpm = $null
foreach ($candidate in @('pnpm.cmd', 'pnpm')) {
  $found = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($found) { $pnpm = $found.Source; break }
}
if (-not $pnpm) {
  foreach ($p in @((Join-Path $env:APPDATA 'npm\pnpm.cmd'), (Join-Path $env:LOCALAPPDATA 'pnpm\pnpm.cmd'))) {
    if (Test-Path $p) { $pnpm = $p; break }
  }
}
if (-not $pnpm) { throw 'pnpm not found. Install it with: npm install -g pnpm' }
Write-Host "[launch] pnpm: $pnpm"

function Test-Port([int]$port) {
  # Vite binds "localhost", which is ::1 on Windows 11 -> probe IPv4 and IPv6 separately.
  foreach ($pair in @(@('127.0.0.1', 'InterNetwork'), @('::1', 'InterNetworkV6'))) {
    try {
      $c = New-Object System.Net.Sockets.TcpClient([System.Net.Sockets.AddressFamily]::($pair[1]))
      $ok = $c.ConnectAsync($pair[0], $port).Wait(500) -and $c.Connected
      $c.Dispose()
      if ($ok) { return $true }
    } catch { }
  }
  return $false
}

function Start-Service-Window([string]$title, [string]$arguments) {
  Write-Host "[launch] starting $title ..."
  Start-Process -FilePath 'cmd.exe' -ArgumentList "/c title $title && `"$pnpm`" $arguments" -WorkingDirectory $Root -WindowStyle Minimized
}

function Wait-Port([int]$port, [string]$what, [int]$timeoutSec = 180) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while (-not (Test-Port $port)) {
    if ($sw.Elapsed.TotalSeconds -gt $timeoutSec) { throw "$what did not start on port $port within $timeoutSec s" }
    Start-Sleep -Milliseconds 700
  }
}

Write-Host "[launch] $($names[$App])"

# 1. database (embedded PostgreSQL, port 5433) – skipped when a Docker/other Postgres already listens
if (-not (Test-Port 5433)) { Start-Service-Window 'MADART DB' 'db:local' }
Wait-Port 5433 'PostgreSQL'

# 2. API
if (-not (Test-Port 4000)) { Start-Service-Window 'MADART API' 'dev:api' }
Wait-Port 4000 'API'
# wait until /health answers (Nest compiles first)
$sw = [Diagnostics.Stopwatch]::StartNew()
do {
  try { $h = Invoke-RestMethod -Uri 'http://localhost:4000/health' -TimeoutSec 3; $ready = $h.status -eq 'ok' } catch { $ready = $false }
  if (-not $ready) { Start-Sleep -Milliseconds 800 }
} while (-not $ready -and $sw.Elapsed.TotalSeconds -lt 180)

# 3. app dev server
$port = $ports[$App]
if (-not (Test-Port $port)) { Start-Service-Window "MADART $App dev server" "--filter $($packages[$App]) dev" }
Wait-Port $port "$App dev server"
Start-Sleep -Seconds 2

# 4. device token for device apps (kiosk / production) from the seed output
$env:DEVICE_TOKEN = ''
$seedOut = Join-Path $Root '.local\seed-output.json'
if (($App -ne 'pos') -and (Test-Path $seedOut)) {
  $seed = Get-Content $seedOut -Raw | ConvertFrom-Json
  if ($App -eq 'kiosk') { $env:DEVICE_TOKEN = $seed.deviceTokens.'Kiosk-01' }
  if ($App -eq 'production') { $env:DEVICE_TOKEN = $seed.deviceTokens.'Kitchen-All-01' }
  if ($App -eq 'display') { $env:DEVICE_TOKEN = $seed.deviceTokens.'Display-01' }
}

# Web apps open in the browser (customer display in full-screen kiosk mode when Edge is available).
if ($webApps -contains $App) {
  # wait until Next.js answers the first request (it compiles on demand)
  $url = "http://localhost:$port/"
  $sw2 = [Diagnostics.Stopwatch]::StartNew()
  do {
    try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 | Out-Null; $up = $true } catch { $up = $false; Start-Sleep -Seconds 1 }
  } while (-not $up -and $sw2.Elapsed.TotalSeconds -lt 180)
  if ($App -eq 'display' -and $env:DEVICE_TOKEN) { $url = "$url?token=$($env:DEVICE_TOKEN)" }
  $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  Write-Host "[launch] opening $($names[$App]) -> $url"
  if ($App -eq 'display' -and $edge) {
    Start-Process -FilePath $edge -ArgumentList "--kiosk `"$url`" --edge-kiosk-type=fullscreen --no-first-run"
  } elseif ($edge) {
    Start-Process -FilePath $edge -ArgumentList "--app=`"$url`" --no-first-run"
  } else {
    Start-Process $url
  }
  exit 0
}

# 5. Electron window
$env:VITE_DEV_SERVER_URL = "http://localhost:$port"
$env:KIOSK_MODE = if ($App -eq 'kiosk') { 'true' } else { 'false' }
$electron = Join-Path $Root "apps\$App\node_modules\electron\dist\electron.exe"
$main = Join-Path $Root "apps\$App\electron\main.cjs"
if (-not (Test-Path $electron)) { throw "Electron is not installed for $App – run pnpm install" }
Write-Host "[launch] opening $($names[$App]) window"
Start-Process -FilePath $electron -ArgumentList "`"$main`"" -WorkingDirectory (Join-Path $Root "apps\$App")
