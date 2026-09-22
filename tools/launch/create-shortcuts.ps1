# Creates Desktop shortcuts for the MADART desktop apps (run: pnpm shortcuts).
#
# Windows .lnk objects created through WScript store the target in the ANSI
# code page, so a target inside this Georgian-named repo folder gets corrupted.
# Therefore the launcher stubs + icons are copied to an ASCII-only folder
# (%LOCALAPPDATA%\MADART\launch) and the shortcuts point there. The stubs call
# the real launcher inside the repo through its 8.3 short path.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$desktop = [Environment]::GetFolderPath('Desktop')
$fso = New-Object -ComObject Scripting.FileSystemObject
$rootShort = $fso.GetFolder($root).ShortPath
$stubDir = Join-Path $env:LOCALAPPDATA 'MADART\launch'
New-Item -ItemType Directory -Force -Path $stubDir | Out-Null
Write-Host "repo (short path): $rootShort"
Write-Host "stubs: $stubDir"

$items = @(
  @{ ascii = 'MADART Kiosk';   name = 'MADART კიოსკი';     app = 'kiosk';      icon = 'madart-kiosk.ico';      desc = 'MADART self-service kiosk' },
  @{ ascii = 'MADART POS';     name = 'MADART სალარო';     app = 'pos';        icon = 'madart-pos.ico';        desc = 'MADART cashier POS' },
  @{ ascii = 'MADART Kitchen'; name = 'MADART სამზარეულო'; app = 'production'; icon = 'madart-production.ico'; desc = 'MADART production screen (KDS)' },
  @{ ascii = 'MADART Admin';   name = 'MADART ადმინი';     app = 'admin';      icon = 'madart-admin.ico';      desc = 'MADART admin / backoffice' },
  @{ ascii = 'MADART Dispatcher'; name = 'MADART დისპეტჩერი'; app = 'dispatcher'; icon = 'madart-dispatcher.ico'; desc = 'MADART dispatcher / order assembly' },
  @{ ascii = 'MADART Display'; name = 'MADART მომხმარებლის ეკრანი'; app = 'display'; icon = 'madart-display.ico'; desc = 'MADART customer order display' },
  @{ ascii = 'MADART Mobile';  name = 'MADART მობილური';   app = 'mobile';     icon = 'madart-mobile.ico';     desc = 'MADART mobile pre-order (PWA)' }
)

$sh = New-Object -ComObject WScript.Shell
foreach ($i in $items) {
  # 1. ASCII-path stub (.cmd) that runs the repo launcher
  $stub = Join-Path $stubDir ($i.app + '.cmd')
  $lines = @(
    '@echo off',
    "title MADART $($i.app) launcher",
    "set ""REPO=$rootShort""",
    ('powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\tools\launch\launch.ps1" -App {0}' -f $i.app),
    'if errorlevel 1 pause'
  )
  [IO.File]::WriteAllLines($stub, $lines, [Text.Encoding]::ASCII)
  Copy-Item (Join-Path $PSScriptRoot $i.icon) (Join-Path $stubDir $i.icon) -Force

  # 2. shortcut – saved under an ASCII name, then renamed to the Georgian label
  $tmp = Join-Path $desktop ($i.ascii + '.lnk')
  $final = Join-Path $desktop ($i.name + '.lnk')
  foreach ($p in @($tmp, $final)) { if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force } }
  $lnk = $sh.CreateShortcut($tmp)
  $lnk.TargetPath = $stub
  $lnk.WorkingDirectory = $stubDir
  $lnk.IconLocation = (Join-Path $stubDir $i.icon) + ',0'
  $lnk.Description = $i.desc
  $lnk.WindowStyle = 1
  $lnk.Save()

  # 3. verify what was really stored before renaming
  $check = $sh.CreateShortcut($tmp)
  $ok = Test-Path -LiteralPath $check.TargetPath
  Write-Host ("[{0}] {1}  ->  {2}" -f ($(if ($ok) { 'OK' } else { 'BROKEN' }), $i.ascii, $check.TargetPath))
  if (-not $ok) { throw "shortcut target does not exist: $($check.TargetPath)" }
  Move-Item -LiteralPath $tmp -Destination $final -Force
}
Write-Host 'done'
