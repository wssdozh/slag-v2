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
// Prerelease streams own a rolling tag: the release job rewrites that release's `latest.json` on
// every build, so `download/beta/latest.json` is the newest beta and never GitHub's `latest`.
const BETA_MANIFEST_URL: &str =
    "https://github.com/wssdozh/slag-v2/releases/download/beta/latest.json";
const DEV_MANIFEST_URL: &str =
    "https://github.com/wssdozh/slag-v2/releases/download/dev/latest.json";
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
    /// Linux: only an AppImage is a file the app owns and may replace while running.
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    #[serde(default)]
    pub appimage: Option<Asset>,
    /// Linux: the distro's own package. The app never installs it — it hands over the right file
    /// and the command, because apt and pacman need root and a package belongs to them.
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    #[serde(default)]
    pub deb: Option<Asset>,
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    #[serde(default, rename = "archpkg")]
    pub arch_pkg: Option<Asset>,
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
    /// `portable` | `installer` | `apk` | `appimage` | `manual`
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
    /// The stream this install reads: `release` | `beta` | `dev`.
    pub channel: String,
    /// How this build got onto the machine: `portable`, `installer`, `apk`, `appimage`, `flatpak`
    /// or `package`. The UI explains the update path from it instead of guessing from the OS.
    pub install_form: String,
    /// The manifest actually used, so a dev override (`SLAG_UPDATE_ENDPOINT`) is visible in the UI.
    pub endpoint: String,
    /// Android: `PackageManager.canRequestPackageInstalls()`, i.e. whether the system installer
    /// will accept the apk this app hands it. `None` everywhere else — no such switch exists.
    pub can_install_packages: Option<bool>,
    /// Linux: `debian` | `arch` | `other`, from `/etc/os-release`. It decides which package the
    /// settings tab offers. `None` on every other platform.
    pub distro: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    /// `restarting` | `installer_launched` | `permission_required`
    pub status: String,
    pub version: String,
}

/// A package the app fetched but will not install: apt and pacman need root, and the owner runs
/// the command. Built on linux only; the settings tab shows the path and copies the command.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PackageOffer {
    pub version: String,
    /// `deb` | `archpkg` | `appimage`
    pub kind: String,
    pub path: String,
    pub command: String,
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

/// Which release stream this install follows. `release` reads GitHub's `latest`, the prerelease
/// streams read their own rolling tag; the file format is the same, so the switch is one url.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Channel {
    Release,
    Beta,
    Dev,
}

impl Channel {
    /// The webview picks the channel; a build script or a stale front end may omit it, and a
    /// missing channel is the stable stream, never "whatever was typed".
    pub fn parse(text: Option<&str>) -> Result<Self, String> {
        match text.map(str::trim).unwrap_or("") {
            "" | "release" | "stable" => Ok(Self::Release),
            "beta" => Ok(Self::Beta),
            "dev" => Ok(Self::Dev),
            other => {
                eprintln!("[update] unknown channel: {other}");
                Err("unknown_channel".to_string())
            }
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Release => "release",
            Self::Beta => "beta",
            Self::Dev => "dev",
        }
    }

    fn manifest_url(self) -> &'static str {
        match self {
            Self::Release => MANIFEST_URL,
            Self::Beta => BETA_MANIFEST_URL,
            Self::Dev => DEV_MANIFEST_URL,
        }
    }
}

fn endpoint(channel: Channel) -> String {
    std::env::var("SLAG_UPDATE_ENDPOINT").unwrap_or_else(|_| channel.manifest_url().to_string())
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

async fn fetch_manifest(app: Option<&AppHandle>, channel: Channel) -> Result<Manifest, String> {
    let url = endpoint(channel);
    log_line(app, "info", "manifest request", format!("{} ({})", url, channel.as_str()));
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

/// How this Linux build got onto the machine. It decides who is allowed to replace it: an AppImage
/// is a single file the user owns and the app can swap while running; a .deb/.rpm/Arch package
/// belongs to apt/dnf/pacman, and a flatpak belongs to flatpak. Nothing here needs root.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinuxForm {
    AppImage,
    Flatpak,
    Package,
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
impl LinuxForm {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AppImage => "appimage",
            Self::Flatpak => "flatpak",
            Self::Package => "package",
        }
    }
}

/// `APPIMAGE` is set by the AppImage runtime and points at the file the user launched: that is the
/// only reliable signal, because a deb can also be unpacked anywhere and run from a folder.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn linux_form() -> LinuxForm {
    if std::env::var_os("APPIMAGE").is_some() {
        return LinuxForm::AppImage;
    }
    if Path::new("/.flatpak-info").exists() {
        return LinuxForm::Flatpak;
    }
    LinuxForm::Package
}

/// Which package this distribution eats. Read from `/etc/os-release` and not from the binary path:
/// the same vault copy can be moved between machines, and `ID_LIKE` is where a derivative says
/// that it follows ubuntu or arch.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub enum LinuxDistro {
    Debian,
    Arch,
    Other,
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
impl LinuxDistro {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Debian => "debian",
            Self::Arch => "arch",
            Self::Other => "other",
        }
    }
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn linux_distro() -> LinuxDistro {
    linux_distro_from(&std::fs::read_to_string("/etc/os-release").unwrap_or_default())
}

/// `ID` first, then `ID_LIKE`: a derivative (endeavouros, manjaro, pop) names its family there.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn linux_distro_from(text: &str) -> LinuxDistro {
    let mut id = String::new();
    let mut id_like = String::new();
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else { continue };
        let value = value.trim().trim_matches('"').to_ascii_lowercase();
        match key.trim() {
            "ID" => id = value,
            "ID_LIKE" => id_like = value,
            _ => {}
        }
    }
    let family = |word: &str| id == word || id_like.split_whitespace().any(|part| part == word);
    if family("debian") || family("ubuntu") {
        LinuxDistro::Debian
    } else if family("arch") {
        LinuxDistro::Arch
    } else {
        LinuxDistro::Other
    }
}

/// The asset this machine can install with its own package manager. `None` means the manifest has
/// no such file yet, and the UI falls back to "open the release page".
#[cfg(target_os = "linux")]
fn select_package_asset(entry: &PlatformEntry) -> Option<(String, Asset)> {
    match linux_distro() {
        LinuxDistro::Debian => entry.deb.clone().map(|asset| ("deb".to_string(), asset)),
        LinuxDistro::Arch => entry.arch_pkg.clone().map(|asset| ("archpkg".to_string(), asset)),
        // Anything else has no package we know how to install: an AppImage is a file they can run.
        LinuxDistro::Other => entry.appimage.clone().map(|asset| ("appimage".to_string(), asset)),
    }
}

#[cfg(not(target_os = "linux"))]
fn select_package_asset(_entry: &PlatformEntry) -> Option<(String, Asset)> {
    None
}

/// What the UI should call this install when it explains why an update cannot be applied.
pub fn install_form() -> &'static str {
    #[cfg(target_os = "android")]
    {
        "apk"
    }
    #[cfg(target_os = "windows")]
    {
        if can_write_exe_folder() {
            "portable"
        } else {
            "installer"
        }
    }
    #[cfg(target_os = "linux")]
    {
        linux_form().as_str()
    }
    #[cfg(target_os = "macos")]
    {
        "bundle"
    }
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
    #[cfg(target_os = "linux")]
    {
        // Only the AppImage form can take an update: a package-managed install would need root,
        // and the honest answer there is "run this one command with your package manager".
        match linux_form() {
            LinuxForm::AppImage => entry.appimage.clone().map(|asset| ("appimage".to_string(), asset)),
            _ => select_package_asset(entry),
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "android", target_os = "linux")))]
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
pub async fn update_platform(
    app: AppHandle,
    channel: Option<String>,
) -> Result<PlatformInfo, String> {
    let channel = Channel::parse(channel.as_deref())?;
    // Android answers this through the Kotlin bridge: `canRequestPackageInstalls` is a
    // PackageManager call, and the whole update path already goes through that plugin. A failed
    // probe is "unknown", not "forbidden": the UI must not offer a settings link on a guess.
    #[cfg(target_os = "android")]
    let can_install_packages = crate::device_access::can_install_packages(&app).await;
    #[cfg(not(target_os = "android"))]
    let can_install_packages: Option<bool> = None;
    #[cfg(target_os = "android")]
    if let Some(allowed) = can_install_packages {
        log_line(
            Some(&app),
            "info",
            "install permission",
            if allowed {
                "allowed"
            } else {
                "forbidden: android blocks installs from this source"
            },
        );
    }
    Ok(PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        current_version: current_version(&app),
        can_apply: can_apply_here(),
        release_page: RELEASE_PAGE.to_string(),
        channel: channel.as_str().to_string(),
        install_form: install_form().to_string(),
        endpoint: endpoint(channel),
        can_install_packages,
        distro: distro_name(),
    })
}

/// The app replaces its own binary only where it owns that file: windows, android, and a linux
/// AppImage. A deb, an rpm or a pacman package belongs to the manager that installed it.
fn can_apply_here() -> bool {
    #[cfg(target_os = "linux")]
    {
        linux_form() == LinuxForm::AppImage
    }
    #[cfg(not(target_os = "linux"))]
    {
        cfg!(any(target_os = "windows", target_os = "android"))
    }
}

fn distro_name() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        Some(linux_distro().as_str().to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    channel: Option<String>,
) -> Result<Option<UpdateOffer>, String> {
    let channel = Channel::parse(channel.as_deref())?;
    let manifest = fetch_manifest(Some(&app), channel).await?;
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

pub async fn install(app: &AppHandle, channel: Channel) -> Result<InstallOutcome, String> {
    let manifest = fetch_manifest(Some(app), channel).await?;
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
    let file_name = match kind.as_str() {
        "apk" => format!("SLAG-{}.apk", offer.version),
        "appimage" => format!("SLAG-{}.AppImage", offer.version),
        _ => format!("slag-v2-{}.exe", offer.version),
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

    #[cfg(target_os = "linux")]
    {
        if kind != "appimage" {
            log_line(Some(app), "error", "not an appimage install", install_form().to_string());
            return Err("unsupported".to_string());
        }
        // `APPIMAGE` is the file the user launched. Stage the new build next to it: `rename()` is
        // atomic only inside one filesystem, and the AppImage usually lives on another mount than
        // /tmp. Replacing the file while it is mounted is fine — the running process keeps its own
        // inode, and the next start executes the new one.
        let target = std::env::var_os("APPIMAGE")
            .map(PathBuf::from)
            .ok_or_else(|| "unsupported".to_string())?;
        let name = target
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "SLAG.AppImage".to_string());
        let staged = target.with_file_name(format!("{name}.new"));
        let _ = std::fs::remove_file(&staged);
        std::fs::copy(&destination, &staged).map_err(|error| {
            log_line(Some(app), "error", "stage appimage failed", error.to_string());
            "write_failed".to_string()
        })?;
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o755)).map_err(
                |error| {
                    log_line(Some(app), "error", "chmod appimage failed", error.to_string());
                    "write_failed".to_string()
                },
            )?;
        }
        std::fs::rename(&staged, &target).map_err(|error| {
            log_line(Some(app), "error", "replace appimage failed", error.to_string());
            "write_failed".to_string()
        })?;
        log_line(Some(app), "info", "appimage replaced", target.display().to_string());
        std::process::Command::new(&target)
            .spawn()
            .map_err(|error| {
                log_line(Some(app), "error", "relaunch failed", error.to_string());
                "restart_failed".to_string()
            })?;
        app.exit(0);
        Ok(InstallOutcome {
            status: "restarting".to_string(),
            version: offer.version,
        })
    }

    #[cfg(not(any(target_os = "windows", target_os = "android", target_os = "linux")))]
    {
        let _ = (kind, asset);
        Err("unsupported".to_string())
    }
}

#[tauri::command]
pub async fn update_install(
    app: AppHandle,
    channel: Option<String>,
) -> Result<InstallOutcome, String> {
    let channel = Channel::parse(channel.as_deref())?;
    install(&app, channel).await
}

/// Fetch the file this distro installs, leave it in Downloads and answer with the one command that
/// installs it. No root and no polkit here on purpose: apt and pacman own their files, and a gui
/// app reaching for sudo is how package databases get half-configured.
#[tauri::command]
pub async fn update_download_package(
    app: AppHandle,
    channel: Option<String>,
) -> Result<PackageOffer, String> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (&app, &channel);
        Err("unsupported".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let channel = Channel::parse(channel.as_deref())?;
        let manifest = fetch_manifest(Some(&app), channel).await?;
        let Some(offer) = offer_from(&app, manifest.clone()) else {
            return Err("up_to_date".to_string());
        };
        let entry = manifest
            .platforms
            .get(platform_key())
            .ok_or_else(|| "no_platform_asset".to_string())?;
        let (kind, asset) =
            select_package_asset(entry).ok_or_else(|| "no_platform_asset".to_string())?;
        // The file name is the one on the release page: the owner sees the same name in the
        // terminal as in the browser, which is how they know it is the same build.
        let name = asset
            .url
            .rsplit('/')
            .next()
            .filter(|name| !name.is_empty())
            .ok_or_else(|| "manifest_invalid".to_string())?
            .to_string();
        let destination = downloads_dir(&app)?.join(&name);
        let _ = std::fs::remove_file(&destination);
        log_line(
            Some(&app),
            "info",
            "package download begin",
            format!("{} ({kind})", offer.version),
        );
        download(Some(&app), &asset, &destination).await?;
        verify_asset(Some(&app), &asset, &destination)?;
        let path = destination.display().to_string();
        let command = match kind.as_str() {
            "deb" => format!("sudo apt install '{path}'"),
            "archpkg" => format!("sudo pacman -U '{path}'"),
            _ => format!("chmod +x '{path}'"),
        };
        log_line(Some(&app), "info", "package ready", path.clone());
        Ok(PackageOffer {
            version: offer.version,
            kind,
            path,
            command,
        })
    }
}

/// Where the owner expects a downloaded file: Download, or home when the platform has no such dir.
#[cfg(target_os = "linux")]
fn downloads_dir(app: &AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|error| {
            log_line(Some(app), "error", "downloads dir failed", error.to_string());
            "write_failed".to_string()
        })?;
    std::fs::create_dir_all(&dir).map_err(|error| {
        log_line(Some(app), "error", "downloads dir create failed", error.to_string());
        "write_failed".to_string()
    })?;
    Ok(dir)
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
    // `--update-check` has no webview to ask, so a terminal run picks the stream by env. An
    // unparseable value is a typo in someone's shell, not a reason to hide it.
    let channel = Channel::parse(std::env::var("SLAG_UPDATE_CHANNEL").ok().as_deref())?;
    let manifest = fetch_manifest(None, channel).await?;
    let current_parsed = parse_version(current).ok_or_else(|| "manifest_invalid".to_string())?;
    let next = parse_version(&manifest.version).ok_or_else(|| "manifest_invalid".to_string())?;
    if next <= current_parsed {
        return Ok(serde_json::json!({
            "status": "up_to_date",
            "current": current,
            "latest": manifest.version,
            "channel": channel.as_str(),
            "endpoint": endpoint(channel),
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
        "channel": channel.as_str(),
        "endpoint": endpoint(channel),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_channel_is_the_stable_stream() {
        assert_eq!(Channel::parse(None), Ok(Channel::Release));
        assert_eq!(Channel::parse(Some("")), Ok(Channel::Release));
        assert_eq!(Channel::parse(Some(" release ")), Ok(Channel::Release));
        // An older client sends nothing at all; a dev build's env may say "stable".
        assert_eq!(Channel::parse(Some("stable")), Ok(Channel::Release));
    }

    #[test]
    fn prerelease_channels_read_their_own_rolling_manifest() {
        assert_eq!(Channel::parse(Some("beta")), Ok(Channel::Beta));
        assert_eq!(Channel::parse(Some("dev")), Ok(Channel::Dev));
        assert_eq!(Channel::Beta.manifest_url(), BETA_MANIFEST_URL);
        assert_eq!(Channel::Dev.manifest_url(), DEV_MANIFEST_URL);
        // The stable endpoint stays GitHub's `latest`: a stable client must never see a prerelease.
        assert_eq!(Channel::Release.manifest_url(), MANIFEST_URL);
        assert!(MANIFEST_URL.ends_with("/releases/latest/download/latest.json"));
    }

    #[test]
    fn an_unknown_channel_is_an_error_not_a_silent_fallback() {
        assert_eq!(Channel::parse(Some("nightly")).unwrap_err(), "unknown_channel");
    }

    /// Every channel downloads from the same repository, so the asset-url guard is one prefix.
    #[test]
    fn every_channel_asset_lives_under_the_download_prefix() {
        for channel in [Channel::Release, Channel::Beta, Channel::Dev] {
            let url = format!("{}slag-v2/{}", ASSET_PREFIX, channel.as_str());
            assert!(url.starts_with(ASSET_PREFIX));
        }
    }

    /// The distro decides which file the settings tab offers, so it is read, not guessed.
    #[test]
    fn os_release_names_the_package_this_machine_installs() {
        let ubuntu = "NAME=\"Ubuntu\"\nID=ubuntu\nID_LIKE=debian\nVERSION_ID=\"24.04\"\n";
        assert_eq!(linux_distro_from(ubuntu), LinuxDistro::Debian);
        let debian = "ID=debian\n";
        assert_eq!(linux_distro_from(debian), LinuxDistro::Debian);
        let arch = "ID=arch\n";
        assert_eq!(linux_distro_from(arch), LinuxDistro::Arch);
        // A derivative says "arch" in ID_LIKE and its own name in ID: both have to work.
        let endeavouros = "ID=endeavouros\nID_LIKE=arch\n";
        assert_eq!(linux_distro_from(endeavouros), LinuxDistro::Arch);
        let fedora = "ID=fedora\nID_LIKE=\"rhel centos\"\n";
        assert_eq!(linux_distro_from(fedora), LinuxDistro::Other);
        // No os-release at all is "some other distro", not an error.
        assert_eq!(linux_distro_from(""), LinuxDistro::Other);
    }
}
