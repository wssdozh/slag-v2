//! Crash-safe vault I/O. The commit marker is written only after both copies of its generation.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::Manager;

static SERIAL: Mutex<()> = Mutex::new(());
static TEMP: AtomicU64 = AtomicU64::new(0);

fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, "invalid vault path")
}
fn damaged() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        "vault generation is not recoverable",
    )
}

fn segment(value: &str) -> bool {
    let stem = value
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end()
        .to_ascii_uppercase();
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value.ends_with([' ', '.'])
        && !value
            .chars()
            .any(|c| c.is_control() || "\\:<>\"|?*".contains(c))
        && !matches!(
            stem.as_str(),
            "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
        )
        && !["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|n| {
                n.len() == 1 && n.as_bytes()[0].is_ascii_digit() || matches!(n, "¹" | "²" | "³")
            })
        })
}

fn checked_metadata(path: &Path) -> io::Result<Option<fs::Metadata>> {
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if meta.file_type().is_symlink() {
        return Err(invalid());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(invalid());
        }
    }
    Ok(Some(meta))
}

fn logical(root: &Path, relative: &str, generation: bool) -> io::Result<PathBuf> {
    let parts: Vec<_> = relative.split('/').collect();
    if parts.len() < 3
        || parts[0] != "vaults"
        || parts[1].starts_with('.')
        || !parts.iter().all(|s| segment(s))
    {
        return Err(invalid());
    }
    let allowed = match &parts[2..] {
        [file] if generation => matches!(
            *file,
            "sync-config.json" | "sync-ledger.json" | "note-registry.json" | "state.json"
        ),
        [file] => {
            matches!(
                *file,
                "state.json" | "recovery-local-only.json" | "recovery-note-op.json"
            ) || file.starts_with("state.json.broken.")
        }
        [kind, rest @ ..] if !generation && !rest.is_empty() => match *kind {
            "notes" | ".trash" => {
                rest.last().is_some_and(|file| file.ends_with(".md"))
                    && rest.iter().all(|part| !part.starts_with('.'))
            }
            ".attachments" => rest.iter().all(|part| !part.starts_with('.')),
            _ => false,
        },
        _ => false,
    };
    if !allowed {
        return Err(invalid());
    }
    let mut result = root.to_path_buf();
    for (i, part) in parts.iter().enumerate() {
        result.push(part);
        if let Some(meta) = checked_metadata(&result)? {
            if (i + 1 == parts.len() && !meta.is_file()) || (i + 1 < parts.len() && !meta.is_dir())
            {
                return Err(invalid());
            }
        }
    }
    Ok(result)
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().expect("validated file path").to_owned();
    name.push(suffix);
    path.with_file_name(name)
}

#[cfg(unix)]
fn sync_dir(path: &Path) -> io::Result<()> {
    fs::File::open(path)?.sync_all()
}
#[cfg(not(unix))]
fn sync_dir(_: &Path) -> io::Result<()> {
    Ok(())
}

fn ensure_parent(path: &Path) -> io::Result<&Path> {
    let parent = path.parent().ok_or_else(invalid)?;
    if !parent.is_dir() {
        let prior = ensure_parent(parent)?;
        match fs::create_dir(parent) {
            Ok(()) => sync_dir(prior)?,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
    }
    Ok(parent)
}

#[cfg(windows)]
fn change_name(from: &Path, to: &Path, replace: bool) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(from: *const u16, to: *const u16, flags: u32) -> i32;
    }
    let src: Vec<_> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let dst: Vec<_> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    const REPLACE_EXISTING: u32 = 1;
    const WRITE_THROUGH: u32 = 8;
    if unsafe {
        MoveFileExW(
            src.as_ptr(),
            dst.as_ptr(),
            WRITE_THROUGH | if replace { REPLACE_EXISTING } else { 0 },
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(unix)]
fn change_name(from: &Path, to: &Path, replace: bool) -> io::Result<()> {
    if replace {
        fs::rename(from, to)?;
    } else {
        rename_no_replace(from, to)?;
    }
    sync_dir(to.parent().ok_or_else(invalid)?)?;
    if from.parent() != to.parent() {
        sync_dir(from.parent().ok_or_else(invalid)?)?;
    }
    Ok(())
}

#[cfg(unix)]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let from = CString::new(from.as_os_str().as_bytes())?;
    let to = CString::new(to.as_os_str().as_bytes())?;
    #[cfg(any(target_os = "linux", target_os = "android"))]
    let result = unsafe {
        libc::syscall(
            libc::SYS_renameat2,
            libc::AT_FDCWD,
            from.as_ptr(),
            libc::AT_FDCWD,
            to.as_ptr(),
            1u32,
        )
    };
    #[cfg(target_os = "macos")]
    let result = unsafe { libc::renamex_np(from.as_ptr(), to.as_ptr(), libc::RENAME_EXCL) };
    #[cfg(not(any(target_os = "linux", target_os = "android", target_os = "macos")))]
    let result = -1;
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

fn replace(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = ensure_parent(path)?;
    checked_metadata(path)?;
    let (tmp, mut file) = loop {
        let tmp = parent.join(format!(
            ".slag-{}-{}.tmp",
            std::process::id(),
            TEMP.fetch_add(1, Ordering::Relaxed)
        ));
        match OpenOptions::new().write(true).create_new(true).open(&tmp) {
            Ok(file) => break (tmp, file),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    };
    let result = file.write_all(bytes).and_then(|()| file.sync_all());
    drop(file);
    let result = result.and_then(|()| change_name(&tmp, path, true));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[derive(Serialize, Deserialize)]
struct Marker {
    version: u8,
    number: u64,
    hash: String,
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn marker_path(path: &Path) -> PathBuf {
    sibling(path, ".commit.json")
}
fn payload(path: &Path, number: u64, replica: u8) -> PathBuf {
    sibling(path, &format!(".slot{}-{replica}", number % 2))
}

fn read_file(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match checked_metadata(path)? {
        Some(meta) if meta.is_file() => fs::read(path).map(Some),
        Some(_) => Err(invalid()),
        None => Ok(None),
    }
}

fn read_marker(path: &Path) -> io::Result<Option<Marker>> {
    if let Some(raw) = read_file(&marker_path(path))? {
        let marker: Marker = serde_json::from_slice(&raw).map_err(|_| damaged())?;
        if marker.version != 1 || marker.number == 0 || marker.hash.len() != 64 {
            return Err(damaged());
        }
        Ok(Some(marker))
    } else {
        for slot in 0..2 {
            for replica in 0..2 {
                if checked_metadata(&payload(path, slot, replica))?.is_some() {
                    return Err(damaged());
                }
            }
        }
        Ok(None)
    }
}

fn read_generation(path: &Path) -> io::Result<Option<String>> {
    let Some(marker) = read_marker(path)? else {
        return Ok(None);
    };
    let primary = payload(path, marker.number, 0);
    let verified = |p: &Path| {
        read_file(p).and_then(|bytes| {
            bytes
                .filter(|raw| hash(raw) == marker.hash)
                .ok_or_else(damaged)
        })
    };
    let bytes = match verified(&primary) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::InvalidData => {
            let bytes = verified(&payload(path, marker.number, 1))?;
            replace(&primary, &bytes)?;
            bytes
        }
        Err(error) => return Err(error),
    };
    String::from_utf8(bytes).map(Some).map_err(|_| damaged())
}

fn write_generation(path: &Path, text: &str) -> io::Result<()> {
    let current = read_marker(path)?;
    let number = match current {
        Some(marker) => {
            if read_generation(path)?.as_deref() == Some(text) {
                return Ok(());
            }
            marker.number.checked_add(1).ok_or_else(damaged)?
        }
        None => 1,
    };
    for replica in 0..2 {
        replace(&payload(path, number, replica), text.as_bytes())?;
    }
    let marker = Marker {
        version: 1,
        number,
        hash: hash(text.as_bytes()),
    };
    replace(&marker_path(path), &serde_json::to_vec(&marker)?)
}

async fn on_disk<T: Send + 'static>(
    app: tauri::AppHandle,
    work: impl FnOnce(&Path) -> io::Result<T> + Send + 'static,
) -> Result<T, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        // Secondary webviews share this lock. No JS window is trusted to serialize disk commits.
        let _guard = SERIAL
            .lock()
            .map_err(|_| "vault I/O lock failed".to_string())?;
        work(&root).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn vault_replace(
    app: tauri::AppHandle,
    path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    on_disk(app, move |root| {
        replace(&logical(root, &path, false)?, &data)
    })
    .await
}

fn move_file(src: &Path, dst: &Path) -> io::Result<()> {
    OpenOptions::new().write(true).open(src)?.sync_all()?;
    ensure_parent(dst)?;
    change_name(src, dst, false)
}

#[tauri::command]
pub async fn vault_move(app: tauri::AppHandle, from: String, to: String) -> Result<(), String> {
    on_disk(app, move |root| {
        if from.split('/').nth(1) != to.split('/').nth(1) {
            return Err(invalid());
        }
        let src = logical(root, &from, false)?;
        let dst = logical(root, &to, false)?;
        move_file(&src, &dst)
    })
    .await
}

#[tauri::command]
pub async fn vault_remove(
    app: tauri::AppHandle,
    path: String,
    expected_digest: String,
) -> Result<(), String> {
    on_disk(app, move |root| {
        if !path
            .split('/')
            .nth(2)
            .is_some_and(|kind| matches!(kind, "notes" | ".trash"))
        {
            return Err(invalid());
        }
        let source = logical(root, &path, false)?;
        let Some(bytes) = read_file(&source)? else {
            return Ok(());
        };
        if hash(&bytes) != expected_digest {
            return Err(damaged());
        }
        // The durable removal is a write-through move out of the Markdown namespace.
        let retired = sibling(
            &source,
            &format!(
                ".slag-retired-{}-{}",
                std::process::id(),
                TEMP.fetch_add(1, Ordering::Relaxed)
            ),
        );
        change_name(&source, &retired, false)?;
        let _ = fs::remove_file(&retired);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn vault_read_generation(
    app: tauri::AppHandle,
    path: String,
) -> Result<Option<String>, String> {
    on_disk(app, move |root| {
        read_generation(&logical(root, &path, true)?)
    })
    .await
}

#[tauri::command]
pub async fn vault_write_generation(
    app: tauri::AppHandle,
    path: String,
    text: String,
) -> Result<(), String> {
    on_disk(app, move |root| {
        write_generation(&logical(root, &path, true)?, &text)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!(
                "slag-durable-{}-{}",
                std::process::id(),
                TEMP.fetch_add(1, Ordering::Relaxed)
            )))
        }
        fn journal(&self) -> PathBuf {
            self.0.join("vaults/main/note-registry.json")
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn replaces_only_active_generation_and_repairs_exact_copy() {
        let fixture = Fixture::new();
        let path = fixture.journal();
        assert_eq!(read_generation(&path).unwrap(), None);
        write_generation(&path, "old").unwrap();
        // A crash has written a payload but not published the new marker.
        replace(&payload(&path, 2, 0), b"partial").unwrap();
        assert_eq!(read_generation(&path).unwrap().as_deref(), Some("old"));
        write_generation(&path, "new").unwrap();
        fs::write(payload(&path, 2, 0), b"\0\0").unwrap();
        assert_eq!(read_generation(&path).unwrap().as_deref(), Some("new"));
        assert_eq!(fs::read(payload(&path, 2, 0)).unwrap(), b"new");
        fs::remove_file(marker_path(&path)).unwrap();
        assert!(read_generation(&path).is_err());
        assert!(write_generation(&path, "must not reset").is_err());
    }

    #[test]
    fn move_does_not_overwrite_and_paths_stay_inside_vault() {
        let fixture = Fixture::new();
        let root = &fixture.0;
        for candidate in [
            "vaults/main/notes/../state.json",
            "vaults/main/notes/CON.txt.md",
            "vaults/main/notes/A.md:x",
            "C:/file",
            "vaults/main/notes/.trash/a.md",
        ] {
            assert!(logical(root, candidate, false).is_err());
        }
        let a = logical(root, "vaults/main/notes/a.md", false).unwrap();
        let b = logical(root, "vaults/main/notes/b.md", false).unwrap();
        replace(&a, b"a").unwrap();
        replace(&b, b"b").unwrap();
        assert!(move_file(&a, &b).is_err());
        assert_eq!(fs::read(&a).unwrap(), b"a");
        assert_eq!(fs::read(b).unwrap(), b"b");
        let trash = logical(root, "vaults/main/.trash/a.md", false).unwrap();
        move_file(&a, &trash).unwrap();
        assert!(!a.exists());
        assert_eq!(fs::read(trash).unwrap(), b"a");
    }

    /// Primary replica gone or NUL: reader falls back to slot 1 and repairs primary.
    #[test]
    fn reads_slot_1_when_primary_is_nul_or_missing() {
        let fixture = Fixture::new();
        let path = fixture.journal();
        // Write generation creates two identical replicas under one marker.
        write_generation(&path, "survived-on-slot-1").unwrap();
        // Corrupt the primary: zero-byte file.
        fs::write(payload(&path, 1, 0), b"").unwrap();
        // Reader must fall back to slot 1 and repair primary back to match.
        assert_eq!(read_generation(&path).unwrap().as_deref(), Some("survived-on-slot-1"));
        assert_eq!(fs::read(payload(&path, 1, 0)).unwrap(), b"survived-on-slot-1");
    }

    /// Both replicas damaged: hash mismatch on every slot → error, no reset.
    #[test]
    fn both_replicas_corrupted_fails_without_reset() {
        let fixture = Fixture::new();
        let path = fixture.journal();
        write_generation(&path, "will-die-together").unwrap();
        // Overwrite both slots with unrelated content.
        fs::write(payload(&path, 1, 0), b"\xde\xad").unwrap();
        fs::write(payload(&path, 1, 1), b"\xbe\xef").unwrap();
        // Marker still references number 1, hashes won't match anything → error.
        let result = read_generation(&path);
        assert!(result.is_err());
        // Subsequent writes must fail because marker still points to broken generation.
        assert!(write_generation(&path, "must-fail-because-marker-stale").is_err());
    }

    /// Commit-marker missing while payloads exist: not recoverable, treated as damage.
    #[test]
    fn marker_absent_with_payloads_treated_as_damage() {
        let fixture = Fixture::new();
        let path = fixture.journal();
        // Ensure parent directory exists (payload paths are inside vaults/main).
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        // Create replicas directly without marker (simulates crash before marker write).
        fs::write(payload(&path, 5, 0), b"orphaned-data").unwrap();
        fs::write(payload(&path, 5, 1), b"orphaned-data").unwrap();
        // No marker exists — read_marker scans slots and finds them → Err(damaged).
        assert!(read_generation(&path).is_err());
        // Must not silently reset: trying to write resets number only after valid marker.
        assert!(write_generation(&path, "cannot-start-from-orphan").is_err());
    }

    /// File interrupted mid-write: hash mismatch even if file present but truncated.
    #[test]
    fn interrupted_write_caught_by_hash_check() {
        let fixture = Fixture::new();
        let path = fixture.journal();
        write_generation(&path, "full-content").unwrap();
        // Truncate primary: partial write survives but hash won't match marker.
        fs::write(payload(&path, 1, 0), b"part").unwrap();
        // Reader tries primary first (hash miss), falls to slot 1 (ok), repairs primary.
        assert_eq!(read_generation(&path).unwrap().as_deref(), Some("full-content"));
        // Now corrupt BOTH replicas — nothing recoverable.
        fs::write(payload(&path, 1, 0), b"\0\0").unwrap();
        fs::write(payload(&path, 1, 1), b"\xff\xff").unwrap();
        assert!(read_generation(&path).is_err());
    }

    /// Successful write after prior corruption does not zero any data.
    #[test]
    fn successful_write_after_corruption_keeps_old_data_alive() {
        let fixture = Fixture::new();
        let path = fixture.journal();
        // Write gen 1, corrupt primary.
        write_generation(&path, "gen-one").unwrap();
        fs::write(payload(&path, 1, 0), b"\0\0").unwrap();
        // Gen 1 still readable via slot 1.
        assert_eq!(read_generation(&path).unwrap().as_deref(), Some("gen-one"));
        // Write gen 2 — marker advances, old gen 1 stays on disk but unreadable via marker.
        write_generation(&path, "gen-two").unwrap();
        // New generation is accessible.
        assert_eq!(read_generation(&path).unwrap().as_deref(), Some("gen-two"));
        // Old markers/slots still physically present (not scrubbed).
        assert!(payload(&path, 1, 0).exists());
        assert!(payload(&path, 1, 1).exists());
    }
}
