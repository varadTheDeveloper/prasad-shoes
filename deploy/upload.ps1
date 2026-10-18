<#
  Prasad Shoes – send the app from your Windows PC to the AWS server.

  First time (sets up Node.js, PostgreSQL, Nginx, HTTPS, backups on the server):
    .\deploy\upload.ps1 -Server ubuntu@13.233.10.20 -Setup
    .\deploy\upload.ps1 -Server ubuntu@13.233.10.20 -Setup -Domain prasadshoes.in   # if you bought a domain

  Every update after that (builds the website, uploads API + website, restarts):
    .\deploy\upload.ps1 -Server ubuntu@13.233.10.20

  Uses the ssh / scp / tar that come with Windows 10 and 11.
#>
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$Key = "$HOME\.ssh\prasad-lightsail.pem",
  [switch]$Setup,
  [string]$Domain = "",
  [string]$Email = "",
  [switch]$SkipWeb
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path $Key)) { throw "SSH key not found: $Key  (download it from Lightsail > Account > SSH keys)" }
$ssh = @('-i', $Key, '-o', 'StrictHostKeyChecking=accept-new')

function Run($exe, [string[]]$argv) {
  & $exe @argv
  if ($LASTEXITCODE -ne 0) { throw "$exe failed (exit $LASTEXITCODE)" }
}

$stage = Join-Path $env:TEMP 'ps-release'
$tgz = Join-Path $env:TEMP 'ps-release.tgz'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $stage | Out-Null

if ($Setup) {
  Write-Host '==> Uploading setup scripts' -ForegroundColor Cyan
  Copy-Item -Recurse "$root\deploy" "$stage\deploy"
  Run 'tar' @('-czf', $tgz, '-C', $stage, '.')
  Run 'scp' ($ssh + @($tgz, "${Server}:/tmp/ps-setup.tgz"))
  $cmd = "rm -rf /tmp/ps-setup && mkdir -p /tmp/ps-setup && tar -xzf /tmp/ps-setup.tgz -C /tmp/ps-setup && sed -i 's/\r$//' /tmp/ps-setup/deploy/*.sh /tmp/ps-setup/deploy/nginx.conf && bash /tmp/ps-setup/deploy/setup-server.sh '$Domain' '$Email'"
  Run 'ssh' ($ssh + @('-t', $Server, $cmd))
  exit 0
}

if (-not $SkipWeb) {
  Write-Host '==> Building the website (app\dist)' -ForegroundColor Cyan
  Push-Location "$root\app"
  try {
    if (-not (Test-Path 'node_modules')) { Run 'npm.cmd' @('install') }
    Run 'npx.cmd' @('expo', 'export', '--platform', 'web')
  } finally { Pop-Location }
}

Write-Host '==> Packing server + website' -ForegroundColor Cyan
robocopy "$root\server" "$stage\server" /E /XD node_modules dist /XF .env /NFL /NDL /NJH /NJS | Out-Null
robocopy "$root\shared" "$stage\shared" /E /XD __tests__ /NFL /NDL /NJH /NJS | Out-Null
robocopy "$root\deploy" "$stage\deploy" /E /NFL /NDL /NJH /NJS | Out-Null
if (-not $SkipWeb) { robocopy "$root\app\dist" "$stage\web" /E /NFL /NDL /NJH /NJS | Out-Null }
$global:LASTEXITCODE = 0   # robocopy uses 1-7 for success
Run 'tar' @('-czf', $tgz, '-C', $stage, '.')

Write-Host "==> Uploading to $Server" -ForegroundColor Cyan
Run 'scp' ($ssh + @($tgz, "${Server}:/tmp/ps-release.tgz"))
$cmd = "rm -rf /tmp/ps-release && mkdir -p /tmp/ps-release && tar -xzf /tmp/ps-release.tgz -C /tmp/ps-release && rm /tmp/ps-release.tgz && sed -i 's/\r$//' /tmp/ps-release/deploy/*.sh && bash /tmp/ps-release/deploy/release.sh /tmp/ps-release"
Run 'ssh' ($ssh + @('-t', $Server, $cmd))
Remove-Item -Recurse -Force $stage, $tgz -ErrorAction SilentlyContinue
Write-Host '==> All done.' -ForegroundColor Green
