use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

const WORKSPACE_TREE_CHANGED_EVENT: &str = "workspace-tree-changed";
const WATCHER_EMIT_DEBOUNCE_MS: u64 = 120;

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceTreeChangedPayload {
    pub workspace: String,
}

struct ActiveWorkspaceTreeWatcher {
    workspace: String,
    _watcher: RecommendedWatcher,
}

static ACTIVE_WATCHER: OnceLock<Mutex<Option<ActiveWorkspaceTreeWatcher>>> = OnceLock::new();

fn watcher_state() -> &'static Mutex<Option<ActiveWorkspaceTreeWatcher>> {
    ACTIVE_WATCHER.get_or_init(|| Mutex::new(None))
}

fn normalize_path(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    if raw == "/" {
        raw
    } else {
        raw.trim_end_matches('/').to_string()
    }
}

fn should_skip_name(name: &str) -> bool {
    name.starts_with('.')
}

fn scan_directory(root: &Path, dir: &Path, out: &mut Vec<String>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    let mut children = Vec::new();
    for entry in entries.flatten() {
        children.push(entry.path());
    }
    children.sort_by(|left, right| {
        let left_name = left
            .file_name()
            .map(|value| value.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let right_name = right
            .file_name()
            .map(|value| value.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        left_name.cmp(&right_name)
    });

    for path in children {
        let name = match path.file_name() {
            Some(name) => name.to_string_lossy().to_string(),
            None => continue,
        };
        if should_skip_name(&name) {
            continue;
        }

        if path.is_dir() {
            let normalized = normalize_path(&path);
            out.push(format!("{}/", normalized));
            scan_directory(root, &path, out);
            continue;
        }

        if path.is_file() {
            let _ = root;
            out.push(normalize_path(&path));
        }
    }
}

pub fn read_workspace_tree(workspace: &str) -> Result<Vec<String>, String> {
    let root = PathBuf::from(workspace);
    if !root.exists() {
        return Err(format!("Workspace path does not exist: {}", workspace));
    }
    if !root.is_dir() {
        return Err(format!("Workspace path is not a directory: {}", workspace));
    }

    let mut out = Vec::new();
    scan_directory(&root, &root, &mut out);
    Ok(out)
}

pub fn start_workspace_tree_watcher(app: &AppHandle, workspace: &str) -> Result<(), String> {
    let root = PathBuf::from(workspace);
    if !root.exists() {
        return Err(format!("Workspace path does not exist: {}", workspace));
    }
    if !root.is_dir() {
        return Err(format!("Workspace path is not a directory: {}", workspace));
    }

    let normalized_workspace = normalize_path(&root);
    let app_handle = app.clone();
    let event_workspace = normalized_workspace.clone();
    let mut last_emit = Instant::now()
        .checked_sub(Duration::from_millis(WATCHER_EMIT_DEBOUNCE_MS))
        .unwrap_or_else(Instant::now);

    let mut watcher = RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| match result {
            Ok(_event) => {
                if last_emit.elapsed() < Duration::from_millis(WATCHER_EMIT_DEBOUNCE_MS) {
                    return;
                }
                last_emit = Instant::now();
                let _ = app_handle.emit(
                    WORKSPACE_TREE_CHANGED_EVENT,
                    WorkspaceTreeChangedPayload {
                        workspace: event_workspace.clone(),
                    },
                );
            }
            Err(error) => {
                eprintln!("[workspace_tree] Watcher error for '{}': {}", event_workspace, error);
            }
        },
        Config::default(),
    )
    .map_err(|error| format!("Could not create workspace watcher: {}", error))?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| format!("Could not watch workspace '{}': {}", workspace, error))?;

    let mut guard = watcher_state()
        .lock()
        .map_err(|_| "Could not lock workspace watcher state.".to_string())?;
    *guard = Some(ActiveWorkspaceTreeWatcher {
        workspace: normalized_workspace,
        _watcher: watcher,
    });

    Ok(())
}

pub fn stop_workspace_tree_watcher(workspace: Option<&str>) {
    let Ok(mut guard) = watcher_state().lock() else {
        return;
    };

    let should_clear = match (&*guard, workspace) {
        (Some(_), None) => true,
        (Some(active), Some(workspace)) => active.workspace == normalize_path(Path::new(workspace)),
        (None, _) => false,
    };

    if should_clear {
        *guard = None;
    }
}
