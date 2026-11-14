// Self-update from inside the app: check a public release manifest, verify sha256 + minisign,
// then hand the swap to a short helper run of the same binary (there is no installer and no
// tauri updater plugin here: the Windows build is a portable exe, the Android build is an apk).
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

// The app is open source, so releases ride on the code repository itself: same tags, same
// release page, no separate artifacts repo to keep in sync.
const REPO: &str = "https://github.com/wssdozh/slag-v2";
const MANIFEST_URL: &str = "https://github.com/wssdozh/slag-v2/releases/latest/download/latest.json";
const ASSET_PREFIX: &str = "https://github.com/wssdozh/slag-v2/releases/download/";
const PUBKEY: &str = include_str!("../updater.pubkey");
const PROGRESS_EVENT: &str = "slag://update-progress";
const LOG_EVENT: &str = "slag://update-log";
const APPLY_FLAG: &str = "--apply-update";
const RELEASE_PAGE: &str = "https://github.com/wssdozh/slag-v2/releases";

#[derive(Deserialize, Clone)]
pub struct Asset {
    pub url: String,
    pub sha256: String,
    pub signature: String,
    #[serde(default)]
    pub size: Option<u64>,
}

#[derive(Deserialize, Clone, Default)]
pub struct PlatformEntry {
    #[serde(default)]
    pub portable: Option<Asset>,
    #[serde(default)]
    pub installer: Option<Asset>,
    #[cfg_attr(not(target_os = "android"), allow(dead_code))]
    #[serde(default)]
    pub apk: Option<Asset>,
}

#[derive(Deserialize, Clone)]
pub struct Manifest {
    pub version: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub pub_date: Option<String>,
    #[serde(default)]
    pub platforms: HashMap<String, PlatformEntry>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOffer {
    pub version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    pub current_version: String,
    /// `portable` | `installer` | `apk` | `manual`
    pub kind: String,
    pub size: Option<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub current_version: String,
    /// false where the app cannot replace itself (linux: the package manager owns the binary).
    pub can_apply: bool,
    pub release_page: String,
    /// The manifest actually used, so a dev override (`SLAG_UPDATE_ENDPOINT`) is visible in the UI.
    pub endpoint: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    /// `restarting` | `installer_launched` | `permission_required`
    pub status: String,
    pub version: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateLogLine {
    level: String,
    message: String,
    data: String,
}

/// Every pipeline step lands in stderr/logcat *and* in the app log (`Логи & Диагностика`,
/// scope UPDATE): on a phone the terminal is not next to you, and a failed update must leave
/// a readable trace.
fn log_line(app: Option<&AppHandle>, level: &str, message: &str, data: impl Into<String>) {
    let data = data.into();
    if data.is_empty() {
        eprintln!("[update] {level} {message}");
    } else {
        eprintln!("[update] {level} {message} {data}");
    }
    if let Some(app) = app {
        let _ = app.emit(
            LOG_EVENT,
            UpdateLogLine {
                level: level.to_string(),
                message: message.to_string(),
                data,
            },
        );
    }
}

fn endpoint() -> String {
    std::env::var("SLAG_UPDATE_ENDPOINT").unwrap_or_else(|_| MANIFEST_URL.to_string())
}

fn is_local_endpoint() -> bool {
    std::env::var_os("SLAG_UPDATE_ENDPOINT").is_some()
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(8))
        .user_agent(concat!("SLAG/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| {
            eprintln!("[update] http client: {error}");
            "network_client".to_string()
        })
}

async fn fetch_manifest(app: Option<&AppHandle>) -> Result<Manifest, String> {
    let url = endpoint();
    log_line(app, "info", "manifest request", url.clone());
    let response = client()?
        .get(&url)
        .send()
        .await
        .map_err(|error| {
            log_line(app, "error", "manifest request failed", error.to_string());
            "network".to_string()
        })?;
    if !response.status().is_success() {
        log_line(app, "error", "manifest status", response.status().to_string());
        return Err(format!("http_{}", response.status().as_u16()));
    }
    let manifest = response.json::<Manifest>().await.map_err(|error| {
        log_line(app, "error", "manifest parse failed", error.to_string());
        "manifest_invalid".to_string()
    })?;
    log_line(app, "info", "manifest ok", format!("v{} ({} платформ)", manifest.version, manifest.platforms.len()));
    Ok(manifest)
}

/// GitHub serves the asset through a redirect to its CDN, so only the URL written in the manifest
/// is checked: a tampered manifest cannot point the download at an attacker's host.
fn is_allowed_asset_url(url: &str) -> bool {
    if is_local_endpoint() {
        return url.starts_with("http://") || url.starts_with("https://");
    }
    url.starts_with(ASSET_PREFIX)
}

fn platform_key() -> &'static str {
    #[cfg(target_os = "android")]
    {
        "android-aarch64"
    }
    #[cfg(target_os = "windows")]
    {
        "windows-x86_64"
    }
    #[cfg(target_os = "linux")]
    {
        "linux-x86_64"
    }
    #[cfg(target_os = "macos")]
    {
        "darwin-x86_64"
    }
}

#[cfg(target_os = "windows")]
pub fn can_write_exe_folder() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let Some(folder) = exe.parent() else {
        return false;
    };
    let probe = folder.join(".slag-write-test");
    match std::fs::write(&probe, b"probe") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[cfg(not(target_os = "windows"))]
pub fn can_write_exe_folder() -> bool {
    false
}

fn parse_version(text: &str) -> Option<semver::Version> {
    semver::Version::parse(text.trim().trim_start_matches('v')).ok()
}

fn current_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

/// The asset the UI would offer on this platform, or `None` when this build cannot apply it.
fn select_asset(entry: &PlatformEntry) -> Option<(String, Asset)> {
    #[cfg(target_os = "windows")]
    {
        // A per-machine install under Program Files is not writable by the app itself; only the
        // nsis installer can update it, so it is preferred exactly then.
        if !can_write_exe_folder() {
            if let Some(asset) = entry.installer.clone() {
                return Some(("installer".to_string(), asset));
            }
        }
        if let Some(asset) = entry.portable.clone() {
            return Some(("portable".to_string(), asset));
        }
        return entry
            .installer
            .clone()
            .map(|asset| ("installer".to_string(), asset));
    }
    #[cfg(target_os = "android")]
    {
        entry.apk.clone().map(|asset| ("apk".to_string(), asset))
    }
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    {
        let _ = entry;
        None
    }
}

fn offer_from(app: &AppHandle, manifest: Manifest) -> Option<UpdateOffer> {
    let current = current_version(app);
    let current_parsed = parse_version(&current)?;
    let next = parse_version(&manifest.version)?;
    if next <= current_parsed {
        log_line(Some(app), "info", "up to date", format!("{current} (манифест {})", manifest.version));
        return None;
    }
    let selected = manifest.platforms.get(platform_key()).and_then(select_asset);
    let (kind, size) = match selected {
        Some((kind, asset)) => (kind, asset.size),
        // A newer version exists but there is nothing to install here (linux: package manager).
        None => ("manual".to_string(), None),
    };
    log_line(
        Some(app),
        "info",
        "update available",
        format!("{current} → {} ({kind})", manifest.version),
    );
    Some(UpdateOffer {
        version: manifest.version,
        notes: manifest.notes,
        pub_date: manifest.pub_date,
        current_version: current,
        kind,
        size,
    })
}

#[tauri::command]
pub fn update_platform(app: AppHandle) -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        current_version: current_version(&app),
        can_apply: cfg!(any(target_os = "windows", target_os = "android")),
        release_page: RELEASE_PAGE.to_string(),
        endpoint: endpoint(),
    }
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<UpdateOffer>, String> {
    let manifest = fetch_manifest(Some(&app)).await?;
    Ok(offer_from(&app, manifest))
}

fn download_dir(version: &str) -> PathBuf {
    std::env::temp_dir().join("slag-update").join(version)
}

async fn download(app: Option<&AppHandle>, asset: &Asset, dest: &Path) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    log_line(app, "info", "download start", format!("{} ({})", asset.url, asset.size.map(|size| format!("{size} B")).unwrap_or_else(|| "size?".to_string())));
    if !is_allowed_asset_url(&asset.url) {
        log_line(app, "error", "asset url not allowed", asset.url.clone());
        return Err("asset_url_not_allowed".to_string());
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            log_line(app, "error", "create update dir failed", error.to_string());
            "write_failed".to_string()
        })?;
    }

    let response = client()?
        .get(&asset.url)
        .send()
        .await
        .map_err(|error| {
            log_line(app, "error", "asset request failed", error.to_string());
            "network".to_string()
        })?;
    if !response.status().is_success() {
        log_line(app, "error", "asset status", response.status().to_string());
        return Err(format!("http_{}", response.status().as_u16()));
    }

    let total = response.content_length().or(asset.size);
    let mut file = tokio::fs::File::create(dest).await.map_err(|error| {
        log_line(app, "error", "create asset file failed", error.to_string());
        "write_failed".to_string()
    })?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| {
            log_line(app, "error", "asset stream failed", error.to_string());
            "network".to_string()
        })?;
        file.write_all(&chunk).await.map_err(|error| {
            log_line(app, "error", "asset write failed", error.to_string());
            "write_failed".to_string()
        })?;
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(150) {
            if let Some(app) = app {
                let _ = app.emit(PROGRESS_EVENT, Progress { downloaded, total });
            }
            last_emit = Instant::now();
        }
    }
    file.flush().await.map_err(|error| {
        log_line(app, "error", "asset flush failed", error.to_string());
        "write_failed".to_string()
    })?;
    if let Some(app) = app {
        let _ = app.emit(PROGRESS_EVENT, Progress { downloaded, total });
    }
    log_line(app, "info", "download done", format!("{downloaded} B"));

    if let Some(expected) = asset.size {
        if expected != downloaded {
            let _ = std::fs::remove_file(dest);
            log_line(app, "error", "size mismatch", format!("{downloaded} != {expected}"));
            return Err("size_mismatch".to_string());
        }
    }
    Ok(())
}

fn verify_sha256(path: &Path, expected: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let bytes = std::fs::read(path).map_err(|error| {
        eprintln!("[update] read asset for hash: {error}");
        "read_failed".to_string()
    })?;
    let digest = Sha256::digest(&bytes);
    let actual = format!("{digest:x}");
    if !actual.eq_ignore_ascii_case(expected.trim()) {
        eprintln!("[update] sha256 mismatch: {actual} != {expected}");
        return Err("verify_failed".to_string());
    }
    Ok(())
}

fn verify_signature(path: &Path, signature: &str) -> Result<(), String> {
    use base64::Engine;
    let bytes = std::fs::read(path).map_err(|error| {
        eprintln!("[update] read asset for signature: {error}");
        "read_failed".to_string()
    })?;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(PUBKEY.trim())
        .map_err(|error| {
            eprintln!("[update] public key decode: {error}");
            "pubkey_invalid".to_string()
        })?;
    let public_key_text = String::from_utf8(decoded).map_err(|error| {
        eprintln!("[update] public key utf8: {error}");
        "pubkey_invalid".to_string()
    })?;
    let public_key = minisign_verify::PublicKey::decode(&public_key_text).map_err(|error| {
        eprintln!("[update] public key parse: {error}");
        "pubkey_invalid".to_string()
    })?;
    let parsed = minisign_verify::Signature::decode(&decode_signature(signature)?).map_err(
        |error| {
            eprintln!("[update] signature parse: {error}");
            "signature_invalid".to_string()
        },
    )?;
    public_key.verify(&bytes, &parsed, true).map_err(|error| {
        eprintln!("[update] signature mismatch: {error}");
        "verify_failed".to_string()
    })
}

/// `tauri signer sign` writes the armored minisign signature base64-wrapped, the same way it wraps
/// the public key; a bare armored block is accepted too, so a hand-written fixture still works.
fn decode_signature(signature: &str) -> Result<String, String> {
    use base64::Engine;
    let trimmed = signature.trim();
    match base64::engine::general_purpose::STANDARD.decode(trimmed) {
        Ok(decoded) => String::from_utf8(decoded).map_err(|error| {
            eprintln!("[update] signature utf8: {error}");
            "signature_invalid".to_string()
        }),
        Err(_) if trimmed.starts_with("untrusted comment:") => Ok(trimmed.to_string()),
        Err(error) => {
            eprintln!("[update] signature decode: {error}");
            Err("signature_invalid".to_string())
        }
    }
}

fn verify_asset(app: Option<&AppHandle>, asset: &Asset, path: &Path) -> Result<(), String> {
    let result =
        verify_sha256(path, &asset.sha256).and_then(|()| verify_signature(path, &asset.signature));
    match &result {
        Ok(()) => log_line(app, "info", "verified", "sha256 + подпись"),
        Err(code) => log_line(app, "error", "verify failed", code.clone()),
    }
    if result.is_err() {
        let _ = std::fs::remove_file(path);
    }
    result
}

/// The helper pass: the freshly downloaded exe starts with `--apply-update <target> <pid>`, swaps
/// the file and relaunches. It never builds a Tauri app, so no window flashes.
pub fn is_apply_update_args(args: &[String]) -> Option<(PathBuf, u32)> {
    let index = args.iter().position(|arg| arg == APPLY_FLAG)?;
    let target = args.get(index + 1).map(PathBuf::from)?;
    let pid = args.get(index + 2)?.parse::<u32>().ok()?;
    Some((target, pid))
}

#[cfg(target_os = "windows")]
pub fn run_apply_update(target: PathBuf, _pid: u32) -> bool {
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x0000_0008;

    let Some(folder) = target.parent().map(Path::to_path_buf) else {
        return false;
    };
    let staged = folder.join("slag-v2.exe.new");
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    let aside = folder.join(format!("slag-v2.exe.old-{stamp}"));

    let Ok(current) = std::env::current_exe() else {
        return false;
    };
    if std::fs::copy(&current, &staged).is_err() {
        report_failure("copy staged");
        return false;
    }
    if std::fs::rename(&target, &aside).is_err() {
        let _ = std::fs::remove_file(&staged);
        report_failure("rename target");
        return false;
    }
    if std::fs::rename(&staged, &target).is_err() {
        // put the old file back so the app is not left without a binary
        let _ = std::fs::rename(&aside, &target);
        report_failure("rename staged");
        return false;
    }

    // The parent still runs from `aside`, so it disappears only after the old process exits.
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if std::fs::remove_file(&aside).is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    let _ = std::process::Command::new(&target)
        .creation_flags(DETACHED_PROCESS)
        .spawn();
    true
}

#[cfg(target_os = "windows")]
fn report_failure(step: &str) {
    let path = std::env::temp_dir().join("slag-update-error.log");
    let _ = std::fs::write(
        path,
        format!(
            "step={step}\ntime={:?}\nexe={:?}\n",
            std::time::SystemTime::now(),
            std::env::current_exe()
        ),
    );
}

/// `--apply-update` on a platform without the helper must not silently start the UI.
#[cfg(not(target_os = "windows"))]
pub fn run_apply_update(_target: PathBuf, _pid: u32) -> bool {
    false
}

#[cfg(target_os = "android")]
async fn android_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let value = android::call(app, "cacheDir", serde_json::json!({})).await?;
    let path = value
        .get("path")
        .and_then(|path| path.as_str())
        .ok_or_else(|| "android_cache_dir".to_string())?;
    Ok(PathBuf::from(path))
}

pub async fn install(app: &AppHandle) -> Result<InstallOutcome, String> {
    let manifest = fetch_manifest(Some(app)).await?;
    let Some(offer) = offer_from(app, manifest.clone()) else {
        return Err("up_to_date".to_string());
    };
    let entry = manifest
        .platforms
        .get(platform_key())
        .ok_or_else(|| {
            log_line(Some(app), "error", "no asset for platform", platform_key().to_string());
            "no_platform_asset".to_string()
        })?;
    let (kind, asset) = select_asset(entry).ok_or_else(|| {
        log_line(Some(app), "error", "nothing to apply for platform", platform_key().to_string());
        "no_platform_asset".to_string()
    })?;

    let directory = {
        #[cfg(target_os = "android")]
        {
            android_cache_dir(app).await?
        }
        #[cfg(not(target_os = "android"))]
        {
            download_dir(&offer.version)
        }
    };
    let file_name = if kind == "apk" {
        format!("SLAG-{}.apk", offer.version)
    } else {
        format!("slag-v2-{}.exe", offer.version)
    };
    let destination = directory.join(file_name);
    let _ = std::fs::remove_file(&destination);

    log_line(Some(app), "info", "install begin", format!("{} ({kind})", offer.version));
    download(Some(app), &asset, &destination).await?;
    verify_asset(Some(app), &asset, &destination)?;

    #[cfg(target_os = "windows")]
    {
        if kind == "installer" {
            std::process::Command::new(&destination)
                .spawn()
                .map_err(|error| {
                    log_line(Some(app), "error", "spawn installer failed", error.to_string());
                    "installer_failed".to_string()
                })?;
            log_line(Some(app), "info", "installer launched", destination.display().to_string());
            app.exit(0);
            Ok(InstallOutcome {
                status: "installer_launched".to_string(),
                version: offer.version,
            })
        } else {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;

            let target = std::env::current_exe().map_err(|error| {
                log_line(Some(app), "error", "current exe failed", error.to_string());
                "unsupported".to_string()
            })?;
            std::process::Command::new(&destination)
                .arg(APPLY_FLAG)
                .arg(&target)
                .arg(std::process::id().to_string())
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|error| {
                    log_line(Some(app), "error", "spawn helper failed", error.to_string());
                    "restart_failed".to_string()
                })?;
            log_line(Some(app), "info", "helper launched", target.display().to_string());
            app.exit(0);
            Ok(InstallOutcome {
                status: "restarting".to_string(),
                version: offer.version,
            })
        }
    }

    #[cfg(target_os = "android")]
    {
        match android::install_apk(app, &destination).await {
            Ok(()) => {
                log_line(Some(app), "info", "system installer opened", destination.display().to_string());
                Ok(InstallOutcome {
                    status: "installer_launched".to_string(),
                    version: offer.version,
                })
            }
            Err(code) if code == "permission_required" => {
                log_line(Some(app), "warn", "install permission required", "android");
                Ok(InstallOutcome {
                    status: "permission_required".to_string(),
                    version: offer.version,
                })
            }
            Err(code) => {
                log_line(Some(app), "error", "apk install failed", code.clone());
                Err(code)
            }
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    {
        let _ = (kind, asset);
        Err("unsupported".to_string())
    }
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<InstallOutcome, String> {
    install(&app).await
}

/// `--update-check`: run the whole pipeline except the swap and print the verdict as JSON. It is
/// how a release candidate is verified from a terminal before anyone clicks "install".
pub fn diagnose() -> String {
    let report = tauri::async_runtime::block_on(diagnose_async());
    match report {
        Ok(value) => serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".to_string()),
        Err(code) => format!("{{\"status\": \"error\", \"code\": \"{code}\"}}"),
    }
}

async fn diagnose_async() -> Result<serde_json::Value, String> {
    let current = env!("CARGO_PKG_VERSION");
    let manifest = fetch_manifest(None).await?;
    let current_parsed = parse_version(current).ok_or_else(|| "manifest_invalid".to_string())?;
    let next = parse_version(&manifest.version).ok_or_else(|| "manifest_invalid".to_string())?;
    if next <= current_parsed {
        return Ok(serde_json::json!({
            "status": "up_to_date",
            "current": current,
            "latest": manifest.version,
            "endpoint": endpoint(),
        }));
    }
    let entry = manifest
        .platforms
        .get(platform_key())
        .ok_or_else(|| "no_platform_asset".to_string())?;
    let (kind, asset) = select_asset(entry).ok_or_else(|| "no_platform_asset".to_string())?;
    let destination = download_dir(&manifest.version).join("slag-check-download");
    let _ = std::fs::remove_file(&destination);
    download(None, &asset, &destination).await?;
    let verify = verify_asset(None, &asset, &destination);
    let _ = std::fs::remove_file(&destination);
    Ok(serde_json::json!({
        "status": if verify.is_ok() { "ready" } else { "verify_failed" },
        "current": current,
        "latest": manifest.version,
        "kind": kind,
        "size": asset.size,
        "verified": verify.is_ok(),
        "error": verify.err(),
        "endpoint": endpoint(),
    }))
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn update_open_install_settings(app: AppHandle) -> Result<(), String> {
    android::open_install_settings(&app).await
}

#[cfg(target_os = "android")]
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    android::init()
}

/// Leftover `.old-*` copies and half-downloaded assets from an interrupted update.
pub fn cleanup_leftovers() {    if let Ok(exe) = std::env::current_exe() {
        if let Some(folder) = exe.parent() {
            if let Ok(entries) = std::fs::read_dir(folder) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.contains(".exe.old-") || name.ends_with(".exe.new") {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
    let staging = std::env::temp_dir().join("slag-update");
    if staging.is_dir() {
        let _ = std::fs::remove_dir_all(&staging);
    }
}

#[cfg(target_os = "android")]
mod android {
    use serde_json::{json, Value};
    use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
    use tauri::{AppHandle, Manager};

    pub struct ApkBridge(pub PluginHandle<tauri::Wry>);

    /// App-local plugin: the Kotlin side (`ApkInstallerPlugin.kt`) owns the FileProvider intent.
    /// Routing through app commands keeps the webview away from an ACL that an app-local plugin
    /// cannot declare itself.
    pub fn init() -> TauriPlugin<tauri::Wry> {
        Builder::new("slag-updater")
            .setup(|app, api| {
                let handle = api.register_android_plugin("com.slag.notes", "ApkInstallerPlugin")?;
                app.manage(ApkBridge(handle));
                Ok(())
            })
            .build()
    }

    pub async fn call(app: &AppHandle, command: &str, payload: Value) -> Result<Value, String> {
        let bridge = app.state::<ApkBridge>();
        bridge
            .0
            .run_mobile_plugin_async::<Value>(command, payload)
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn install_apk(app: &AppHandle, path: &std::path::Path) -> Result<(), String> {
        call(app, "install", json!({ "path": path.to_string_lossy() }))
            .await
            .map(|_| ())
    }

    pub async fn open_install_settings(app: &AppHandle) -> Result<(), String> {
        call(app, "openSettings", json!({})).await.map(|_| ())
    }
}
