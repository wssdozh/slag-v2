use std::{
    fs, io,
    path::{Path, PathBuf},
};
use tauri::Manager;

#[tauri::command]
pub async fn durable_atomic_write(
    app: tauri::AppHandle,
    relative_target: String,
    content: String,
) -> Result<(), String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let target = json_target(&root, &relative_target)?;
        write_json(&target, &content, replace_durable)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

fn json_target(root: &Path, relative: &str) -> io::Result<PathBuf> {
    let (dir, file) = match relative.split('/').collect::<Vec<_>>().as_slice() {
        [file @ ("settings.json" | "secrets.json")] => (None, *file),
        ["vaults", id, file @ ("state.json" | "note-registry.json")]
            if !id.is_empty()
                && *id != "."
                && *id != ".."
                && !id.ends_with(['.', ' '])
                && !id
                    .chars()
                    .any(|c| c.is_control() || "\\/:*?\"<>|".contains(c)) =>
        {
            (Some(*id), *file)
        }
        _ => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "unexpected AppData JSON path",
            ))
        }
    };
    if dir.is_none() {
        fs::create_dir_all(root)?;
    }
    let root = fs::canonicalize(root)?;
    let parent = match dir {
        Some(id) => {
            let vaults = direct_directory(&root, "vaults")?;
            direct_directory(&vaults, id)?
        }
        None => root,
    };
    Ok(parent.join(file))
}

fn direct_directory(parent: &Path, leaf: &str) -> io::Result<PathBuf> {
    let candidate = parent.join(leaf);
    let resolved = fs::canonicalize(&candidate)?;
    // Don't write through custom junctions or symlinks to another vault or another tree.
    if resolved != candidate || !resolved.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "vault directory is redirected",
        ));
    }
    Ok(resolved)
}

fn write_json(
    target: &Path,
    content: &str,
    replace: impl FnOnce(&Path, &Path) -> io::Result<()>,
) -> io::Result<()> {
    use io::Write;
    let temp = target.with_file_name(format!(".slag-{}.tmp", uuid::Uuid::new_v4()));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    let staged = file
        .write_all(content.as_bytes())
        .and_then(|()| file.sync_all());
    drop(file);
    let result = staged.and_then(|()| replace(&temp, target));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[cfg(windows)]
fn replace_durable(temp: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let temp: Vec<u16> = temp.as_os_str().encode_wide().chain([0]).collect();
    let target: Vec<u16> = target.as_os_str().encode_wide().chain([0]).collect();
    // Same-directory replacement; don't allow a copy/delete fallback across volumes.
    let result = unsafe {
        MoveFileExW(
            temp.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(unix)]
fn replace_durable(temp: &Path, target: &Path) -> io::Result<()> {
    let parent = fs::File::open(target.parent().expect("target checked by json_target"))?;
    fs::rename(temp, target)?;
    parent.sync_all()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_failed_replacement_leaves_previous_snapshot() -> io::Result<()> {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(root.join("vaults/main"))?;
        let test = || -> io::Result<()> {
            let target = json_target(&root, "vaults/main/state.json")?;
            assert!(json_target(&root, "vaults/main/notes/fake.md").is_err());
            assert!(json_target(&root, "vaults/..\\main/note-registry.json").is_err());
            assert!(json_target(&root, "settings.json.bak").is_err());
            write_json(&target, r#"{"first":true}"#, replace_durable)?;
            let next = r#"{"second":"проверка"}"#;
            let result = write_json(&target, next, |temp, _target| {
                assert_eq!(fs::read_to_string(temp)?, next);
                Err(io::Error::other("interrupted before replace"))
            });
            assert!(result.is_err());
            assert_eq!(fs::read_to_string(&target)?, r#"{"first":true}"#);
            assert_eq!(fs::read_dir(target.parent().unwrap())?.count(), 1);
            write_json(&target, next, replace_durable)?;
            assert_eq!(fs::read_to_string(&target)?, next);
            Ok(())
        }();
        let _ = fs::remove_dir_all(root);
        test
    }
}
