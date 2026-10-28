//! Local filesystem listing for the explorer's "This PC" pane.
//!
//! Entries reuse the SFTP `SftpEntry` shape so the frontend shares its
//! conversion and table code with the remote pane. Hidden (dot) files are
//! always included.

use std::fs::Metadata;
use std::path::Path;
use std::time::UNIX_EPOCH;

use tracing::instrument;

use crate::sftp::{format_permissions, SftpEntry, SftpEntryType, SftpError};

/// List the contents of a local directory, hidden files included.
/// Sorted like `sftp_list_dir`: directories first, then by name.
#[tauri::command]
#[instrument]
pub async fn local_list_dir(path: String) -> Result<Vec<SftpEntry>, SftpError> {
    tokio::task::spawn_blocking(move || list_dir(Path::new(&path)))
        .await
        .map_err(|e| SftpError::LocalIoError(e.to_string()))?
}

/// The user's home directory — where the local pane starts.
#[tauri::command]
pub fn local_home_dir() -> Result<String, SftpError> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| SftpError::LocalIoError("home directory not found".into()))
}

fn list_dir(dir: &Path) -> Result<Vec<SftpEntry>, SftpError> {
    let read_dir = std::fs::read_dir(dir)
        .map_err(|e| SftpError::LocalIoError(format!("{}: {e}", dir.display())))?;

    let mut result: Vec<SftpEntry> = Vec::new();
    for entry in read_dir {
        // An entry that vanishes or can't be read mid-listing is skipped
        // rather than failing the whole directory.
        let Ok(entry) = entry else { continue };
        let Ok(file_type) = entry.file_type() else { continue };
        let path = entry.path();
        let is_symlink = file_type.is_symlink();

        // Follow symlinks (as the SFTP listing does) so a linked folder
        // navigates like a folder; a dangling link stays a symlink.
        let (entry_type, meta) = match std::fs::metadata(&path) {
            Ok(m) => (entry_type_of(&m), Some(m)),
            Err(_) if is_symlink => (SftpEntryType::Symlink, entry.metadata().ok()),
            Err(_) => (SftpEntryType::Other, entry.metadata().ok()),
        };

        let permissions = meta.as_ref().map(mode_bits).unwrap_or(0);
        let modified = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        result.push(SftpEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            entry_type,
            size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
            permissions,
            permissions_display: format_permissions(permissions),
            modified,
            is_symlink,
        });
    }

    result.sort_by(|a, b| {
        let a_dir = a.entry_type == SftpEntryType::Directory;
        let b_dir = b.entry_type == SftpEntryType::Directory;
        b_dir
            .cmp(&a_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(result)
}

fn entry_type_of(meta: &Metadata) -> SftpEntryType {
    if meta.is_dir() {
        SftpEntryType::Directory
    } else if meta.is_file() {
        SftpEntryType::File
    } else {
        SftpEntryType::Other
    }
}

#[cfg(unix)]
fn mode_bits(meta: &Metadata) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    meta.permissions().mode() & 0o7777
}

#[cfg(not(unix))]
fn mode_bits(_meta: &Metadata) -> u32 {
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_hidden_files_with_directories_first() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".env"), "x").unwrap();
        std::fs::write(dir.path().join("b.txt"), "hello").unwrap();
        std::fs::create_dir(dir.path().join("Zdir")).unwrap();
        std::fs::create_dir(dir.path().join(".config")).unwrap();

        let entries = list_dir(dir.path()).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, [".config", "Zdir", ".env", "b.txt"]);

        let b = entries.iter().find(|e| e.name == "b.txt").unwrap();
        assert_eq!(b.entry_type, SftpEntryType::File);
        assert_eq!(b.size, 5);
        assert_eq!(b.path, dir.path().join("b.txt").to_string_lossy());
        assert!(b.modified.is_some());
    }

    #[cfg(unix)]
    #[test]
    fn follows_symlinks_and_keeps_dangling_ones() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("real")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("real"), dir.path().join("link")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("missing"), dir.path().join("broken")).unwrap();

        let entries = list_dir(dir.path()).unwrap();
        let link = entries.iter().find(|e| e.name == "link").unwrap();
        assert_eq!(link.entry_type, SftpEntryType::Directory);
        assert!(link.is_symlink);
        let broken = entries.iter().find(|e| e.name == "broken").unwrap();
        assert_eq!(broken.entry_type, SftpEntryType::Symlink);
        assert!(broken.is_symlink);
    }

    #[test]
    fn missing_directory_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(list_dir(&dir.path().join("nope")).is_err());
    }
}
