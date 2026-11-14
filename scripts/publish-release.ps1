# Publishes a SLAG release: bumps the version, builds, signs the artifacts and uploads them to the
# public release repo the app checks. Run from the repo root:
#   powershell -File scripts/publish-release.ps1 -Version 0.2.0 -Notes "what changed" -ApkPath path/to.apk
#
# The private key never enters the repo: it lives in ~/.tauri/slag-updater.key and the public half
# is committed as src-tauri/updater.pubkey.
#
# NOTE: this file is UTF-8 **with BOM** on purpose. Windows PowerShell 5.1 reads a BOM-less file as
# ANSI and the non-ASCII text below breaks the parser.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = '',
  [string]$Repo = 'wssdozh/slag-releases',
  [string]$ApkPath = '',
  [string]$KeyPath = "$env:USERPROFILE\.tauri\slag-updater.key",
  [switch]$SkipBuild,
  [switch]$SkipAndroid
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$semver = '^\d+\.\d+\.\d+$'
if ($Version -notmatch $semver) { throw "version must be x.y.z, got '$Version'" }
if (-not (Test-Path $KeyPath)) { throw "no signing key: $KeyPath (npx tauri signer generate -w '$KeyPath' --ci)" }

function Write-Step([string]$text) { Write-Host "== $text" -ForegroundColor Cyan }
function Get-Sha256([string]$path) { (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Set-Utf8([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
}
# Native tools write progress to stderr; with ErrorActionPreference=Stop that would be a terminating
# error, so every call funnels it through the host stream and keeps only the exit code.
function Invoke-Native([string]$label, [scriptblock]$action) {
  # stderr from a native tool becomes an ErrorRecord; under 'Stop' that terminator kills the run
  # before the exit code is even read, so relax it for the duration of the call.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $action 2>&1 | Out-Host
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($code -ne 0) { throw "$label failed (exit $code)" }
}

# ---- 1. version bump -------------------------------------------------------------------------
Write-Step "version -> $Version"
$conf = 'src-tauri/tauri.conf.json'
$confText = [System.IO.File]::ReadAllText($conf)
$confText = [regex]::Replace($confText, '("version"\s*:\s*")[^"]+(")', "`${1}$Version`${2}", 1)
Set-Utf8 $conf $confText

$cargo = 'src-tauri/Cargo.toml'
$cargoText = [System.IO.File]::ReadAllText($cargo)
$cargoText = [regex]::Replace($cargoText, '(?m)^version = "[^"]+"', "version = `"$Version`"", 1)
Set-Utf8 $cargo $cargoText

$pkg = 'package.json'
$pkgText = [System.IO.File]::ReadAllText($pkg)
$pkgText = [regex]::Replace($pkgText, '("version"\s*:\s*")[^"]+(")', "`${1}$Version`${2}", 1)
Set-Utf8 $pkg $pkgText

# ---- 2. build --------------------------------------------------------------------------------
if (-not $SkipBuild) {
  Write-Step 'check'
  Invoke-Native 'npm run check' { npm run check }

  Write-Step 'build'
  Invoke-Native 'npm run build' { npm run build }

  Write-Step 'desktop bundle (exe + nsis)'
  Invoke-Native 'npm run build:desktop' { npm run build:desktop }
}

$staging = Join-Path $root ".tmp/release/$Version"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$portable = 'src-tauri/target/release/slag-v2.exe'
if (-not (Test-Path $portable)) { throw "no $portable - build the desktop app first" }
Copy-Item $portable (Join-Path $staging 'slag-v2.exe') -Force

$setupFilter = "*$Version*setup.exe"
$setup = Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter $setupFilter -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw "no nsis installer matching $setupFilter - build the desktop app first" }
Copy-Item $setup.FullName (Join-Path $staging $setup.Name) -Force

$apkName = "SLAG-$Version-universal.apk"
if ($ApkPath) {
  if (-not (Test-Path $ApkPath)) { throw "no apk: $ApkPath" }
  Copy-Item $ApkPath (Join-Path $staging $apkName) -Force
} elseif (-not $SkipAndroid) {
  throw "build the release apk (docs/RELEASING.md) and pass -ApkPath, or run with -SkipAndroid"
}

# ---- 3. sign + hash -------------------------------------------------------------------------
$assets = @()
foreach ($file in Get-ChildItem $staging -File) {
  Write-Step "sign $($file.Name)"
  Invoke-Native "sign $($file.Name)" { npx tauri signer sign -f $KeyPath $file.FullName }
  $sigPath = "$($file.FullName).sig"
  if (-not (Test-Path $sigPath)) { throw "no .sig next to $($file.Name)" }
  $assets += [pscustomobject]@{
    Path      = $file.FullName
    Name      = $file.Name
    Size      = $file.Length
    Sha256    = Get-Sha256 $file.FullName
    Signature = ([System.IO.File]::ReadAllText($sigPath)).Trim()
  }
}

function New-Asset([string]$name) {
  $asset = $assets | Where-Object { $_.Name -eq $name } | Select-Object -First 1
  if (-not $asset) { return $null }
  [ordered]@{
    url       = "https://github.com/$Repo/releases/download/v$Version/$($asset.Name)"
    size      = $asset.Size
    sha256    = $asset.Sha256
    signature = $asset.Signature
  }
}

# ---- 4. manifest ----------------------------------------------------------------------------
$platforms = [ordered]@{}
$windows = [ordered]@{}
$portableAsset = New-Asset 'slag-v2.exe'
if ($portableAsset) { $windows['portable'] = $portableAsset }
$installerAsset = New-Asset $setup.Name
if ($installerAsset) { $windows['installer'] = $installerAsset }
if ($windows.Count -gt 0) { $platforms['windows-x86_64'] = $windows }

$apkAsset = New-Asset $apkName
if ($apkAsset) { $platforms['android-aarch64'] = [ordered]@{ apk = $apkAsset } }

if ($platforms.Count -eq 0) { throw 'nothing to publish: no artifacts' }

$manifest = [ordered]@{
  version   = $Version
  pub_date  = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
  notes     = $Notes
  platforms = $platforms
}
$manifestPath = Join-Path $staging 'latest.json'
Set-Utf8 $manifestPath ($manifest | ConvertTo-Json -Depth 8)

Write-Step 'manifest'
Get-Content $manifestPath

# ---- 5. upload ------------------------------------------------------------------------------
$notesFile = Join-Path $staging 'notes.md'
Set-Utf8 $notesFile $Notes

Write-Step "gh release v$Version -> $Repo"
$uploads = @(Get-ChildItem $staging -File | ForEach-Object { $_.FullName })
$existing = $null
try { $existing = gh release view "v$Version" --repo $Repo 2>$null } catch { $existing = $null }
if ($existing) {
  Write-Host '  release exists - uploading assets over it'
  Invoke-Native 'gh release upload' { gh release upload "v$Version" --repo $Repo --clobber @uploads }
  Invoke-Native 'gh release edit' { gh release edit "v$Version" --repo $Repo --notes-file $notesFile }
} else {
  Invoke-Native 'gh release create' { gh release create "v$Version" --repo $Repo --title "SLAG $Version" --notes-file $notesFile @uploads }
}

# ---- 6. verify ------------------------------------------------------------------------------
Write-Step 'verify published latest.json'
Start-Sleep -Seconds 2
$latestUrl = "https://github.com/$Repo/releases/latest/download/latest.json"
$fetch = Invoke-WebRequest -Uri $latestUrl -UseBasicParsing -TimeoutSec 30
# PowerShell 5.1 hands binary bodies back as byte[]: decode explicitly instead of parsing bytes.
$json = if ($fetch.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($fetch.Content) } else { $fetch.Content }
$published = $json | ConvertFrom-Json
if ($published.version -ne $Version) { throw "latest.json serves $($published.version), not $Version (github caches - retry in a minute)" }

Write-Host "done: https://github.com/$Repo/releases/tag/v$Version" -ForegroundColor Green
