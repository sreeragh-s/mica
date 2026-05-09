mod cli_chat;
mod git;
mod git_support;
mod github_cli;
mod workspace_index;
mod workspace_tree;
#[tauri::command]
fn get_default_workspace_path() -> Result<String, String> {
    let docs = dirs::document_dir().ok_or_else(|| {
        "Could not resolve your Documents folder. Set a workspace folder manually.".to_string()
    })?;
    Ok(docs.join("notelab").to_string_lossy().to_string())
}

#[tauri::command]
async fn rebuild_workspace_index(
    app: tauri::AppHandle,
    workspace: String,
    force_full: Option<bool>,
) -> Result<bool, String> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        workspace_index::rebuild_workspace_index(&handle, &workspace, force_full.unwrap_or(false))
    })
    .await
    .map_err(|error| format!("Workspace indexing task failed: {}", error))?
}

#[tauri::command]
fn read_workspace_index_snapshot(
    workspace: String,
) -> Result<workspace_index::WorkspaceIndexSnapshot, String> {
    workspace_index::read_workspace_index_snapshot(&workspace)
}

#[tauri::command]
fn get_workspace_index_summary(
    workspace: String,
) -> Result<Option<workspace_index::WikiLinkMetaRecord>, String> {
    workspace_index::get_workspace_index_summary(&workspace)
}

#[tauri::command]
async fn list_workspace_files_snapshot(
    workspace: String,
) -> Result<Vec<workspace_index::WorkspaceFileEntryLite>, String> {
    tokio::task::spawn_blocking(move || workspace_index::list_workspace_files_snapshot(&workspace))
        .await
        .map_err(|error| format!("Workspace file listing task failed: {}", error))?
}

#[tauri::command]
async fn read_workspace_note_connections(
    workspace: String,
    active_file_path: String,
) -> Result<workspace_index::WorkspaceNoteConnections, String> {
    tokio::task::spawn_blocking(move || {
        workspace_index::read_workspace_note_connections(&workspace, &active_file_path)
    })
    .await
    .map_err(|error| format!("Workspace note connection task failed: {}", error))?
}

#[tauri::command]
fn read_workspace_tree(workspace: String) -> Result<Vec<String>, String> {
    workspace_tree::read_workspace_tree(&workspace)
}

#[tauri::command]
fn start_workspace_tree_watcher(app: tauri::AppHandle, workspace: String) -> Result<(), String> {
    workspace_tree::start_workspace_tree_watcher(&app, &workspace)
}

#[tauri::command]
fn stop_workspace_tree_watcher(workspace: Option<String>) {
    workspace_tree::stop_workspace_tree_watcher(workspace.as_deref())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            git::check_git_installation,
            git::get_git_global_identity,
            git::set_git_global_identity,
            github_cli::check_gh_installation,
            github_cli::install_gh_cli,
            github_cli::start_gh_auth_login,
            github_cli::gh_publish_branch,
            git::git_sync_branch,
            git::init_git_repo,
            git::get_git_repo_info,
            git::get_git_status,
            git::stage_file,
            git::stage_all_files,
            git::unstage_file,
            git::unstage_all_files,
            git::discard_file_changes,
            git::commit_changes,
            git::get_git_branches,
            git::create_git_branch,
            git::checkout_branch,
            git::get_recent_commits,
            git::get_file_diff,
            get_default_workspace_path,
            cli_chat::list_cli_providers,
            cli_chat::list_cli_provider_models,
            cli_chat::chat_with_cli_provider_stream,
            rebuild_workspace_index,
            read_workspace_index_snapshot,
            get_workspace_index_summary,
            list_workspace_files_snapshot,
            read_workspace_note_connections,
            read_workspace_tree,
            start_workspace_tree_watcher,
            stop_workspace_tree_watcher,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
