use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParsedLinkOccurrence {
    pub display_text: String,
    pub raw_target: String,
    pub target_subpath: Option<String>,
    pub is_embed: bool,
    pub snippet: String,
    pub syntax: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WikiLinkNoteRecord {
    pub id: String,
    pub workspace_id: String,
    pub workspace_path: String,
    pub path: String,
    pub relative_path: String,
    pub name: String,
    pub title: String,
    pub aliases: Vec<String>,
    pub preview_snippet: String,
    pub raw_links: Vec<ParsedLinkOccurrence>,
    pub size: u64,
    pub mtime: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WikiLinkLinkRecord {
    pub id: String,
    pub workspace_id: String,
    pub source_path: String,
    pub source_relative_path: String,
    pub target_path: Option<String>,
    pub target_relative_path: Option<String>,
    pub target_name: String,
    pub target_lookup_key: String,
    pub target_subpath: Option<String>,
    pub is_embed: bool,
    pub count: u32,
    pub snippets: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WikiLinkMetaRecord {
    pub id: String,
    pub workspace_id: String,
    pub workspace_path: String,
    pub status: String,
    pub processed_files: usize,
    pub total_files: usize,
    pub total_markdown_files: usize,
    pub total_resolved_links: usize,
    pub total_dangling_links: usize,
    pub last_indexed_at: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIndexSnapshot {
    pub notes: Vec<WikiLinkNoteRecord>,
    pub links: Vec<WikiLinkLinkRecord>,
    pub meta: Option<WikiLinkMetaRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WikiLinkIndexingState {
    pub current_file: Option<String>,
    pub error: Option<String>,
    pub phase: String,
    pub processed_files: usize,
    pub total_files: usize,
    pub workspace: String,
}

#[derive(Debug, Clone)]
struct IndexedFileEntry {
    path: String,
    relative_path: String,
    name: String,
    size: u64,
    mtime: Option<i64>,
}

#[derive(Debug, Clone)]
struct ResolvedTarget {
    path: Option<String>,
    relative_path: Option<String>,
    title: String,
    lookup_key: String,
}

#[derive(Default)]
struct FileLookup {
    by_alias: HashMap<String, Vec<WikiLinkNoteRecord>>,
    by_basename_no_ext: HashMap<String, Vec<WikiLinkNoteRecord>>,
    by_basename_with_ext: HashMap<String, Vec<WikiLinkNoteRecord>>,
    by_relative_no_ext: HashMap<String, WikiLinkNoteRecord>,
    by_relative_with_ext: HashMap<String, WikiLinkNoteRecord>,
}

#[derive(Default)]
struct FrontmatterData {
    aliases: Vec<String>,
}

fn log_index(message: impl AsRef<str>) {
    println!("[workspace_index] {}", message.as_ref());
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/").trim_end_matches('/').to_string()
}

fn workspace_id(workspace: &str) -> String {
    let normalized = normalize_path(workspace);
    let mut hasher = DefaultHasher::new();
    normalized.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn snapshot_file_path(workspace: &str) -> Result<PathBuf, String> {
    let cache_root = dirs::cache_dir()
        .ok_or_else(|| "Could not resolve the application cache directory.".to_string())?;
    let dir = cache_root.join("notelab").join("workspace-index");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create workspace index cache directory: {}", error))?;
    Ok(dir.join(format!("{}.json", workspace_id(workspace))))
}

fn read_snapshot_from_disk(workspace: &str) -> Result<Option<WorkspaceIndexSnapshot>, String> {
    let path = snapshot_file_path(workspace)?;
    if !path.exists() {
        log_index(format!(
            "No cached snapshot found for workspace '{}' at {}",
            normalize_path(workspace),
            path.display()
        ));
        return Ok(None);
    }

    log_index(format!(
        "Loading cached snapshot for workspace '{}' from {}",
        normalize_path(workspace),
        path.display()
    ));
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read cached workspace index: {}", error))?;
    let snapshot = serde_json::from_str::<WorkspaceIndexSnapshot>(&raw)
        .map_err(|error| format!("Could not parse cached workspace index: {}", error))?;
    Ok(Some(snapshot))
}

fn write_snapshot_to_disk(workspace: &str, snapshot: &WorkspaceIndexSnapshot) -> Result<(), String> {
    let path = snapshot_file_path(workspace)?;
    let temp_path = path.with_extension("json.tmp");
    log_index(format!(
        "Writing snapshot for workspace '{}' to {} (notes={}, links={})",
        normalize_path(workspace),
        path.display(),
        snapshot.notes.len(),
        snapshot.links.len()
    ));
    let json =
        serde_json::to_vec(snapshot).map_err(|error| format!("Could not serialize workspace index: {}", error))?;

    let mut temp_file = fs::File::create(&temp_path)
        .map_err(|error| format!("Could not create temporary workspace index file: {}", error))?;
    temp_file
        .write_all(&json)
        .map_err(|error| format!("Could not write workspace index cache: {}", error))?;
    temp_file
        .flush()
        .map_err(|error| format!("Could not flush workspace index cache: {}", error))?;

    fs::rename(&temp_path, &path)
        .map_err(|error| format!("Could not finalize workspace index cache write: {}", error))?;
    Ok(())
}

fn is_markdown_file(path: &str) -> bool {
    path.to_lowercase().ends_with(".md")
}

fn is_supported_editor_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    let image_extensions = [
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg", ".avif", ".heic",
        ".heif",
    ];
    let video_extensions = [".mp4", ".webm", ".mov", ".m4v", ".ogv", ".mkv", ".avi"];

    is_markdown_file(path)
        || lower.ends_with(".excalidraw")
        || lower.ends_with(".excalidraw.json")
        || lower.ends_with(".codedrawing")
        || lower.ends_with(".codedrawing.json")
        || lower.ends_with(".pdf")
        || lower.ends_with(".html")
        || lower.ends_with(".htm")
        || image_extensions.iter().any(|ext| lower.ends_with(ext))
        || video_extensions.iter().any(|ext| lower.ends_with(ext))
}

fn relative_workspace_path(path: &str, workspace: &str) -> String {
    let normalized_path = normalize_path(path);
    let normalized_workspace = normalize_path(workspace);

    if normalized_path == normalized_workspace {
        return ".".to_string();
    }

    if normalized_path.starts_with(&format!("{}/", normalized_workspace)) {
        return normalized_path[normalized_workspace.len() + 1..].to_string();
    }

    normalized_path
}

fn file_title(file_name: &str) -> String {
    if file_name.ends_with(".excalidraw.json") {
        return file_name[..file_name.len() - ".excalidraw.json".len()].to_string();
    }
    if file_name.ends_with(".excalidraw") {
        return file_name[..file_name.len() - ".excalidraw".len()].to_string();
    }

    match file_name.rsplit_once('.') {
        Some((name, _)) if !name.is_empty() => name.to_string(),
        _ => file_name.to_string(),
    }
}

fn normalize_lookup_key(value: &str) -> String {
    value
        .replace('\\', "/")
        .trim_start_matches("./")
        .trim_matches('/')
        .to_lowercase()
}

fn remove_file_extension(path: &str) -> String {
    if path.ends_with(".excalidraw.json") {
        return path[..path.len() - ".json".len()].to_string();
    }

    let normalized = path.replace('\\', "/");
    match normalized.rfind('.') {
        Some(index) => normalized[..index].to_string(),
        None => normalized,
    }
}

fn decode_link_target(value: &str) -> String {
    value.replace("%20", " ")
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn split_link_target(value: &str) -> (String, Option<String>) {
    match value.split_once('#') {
        Some((path, subpath)) => {
            let normalized_path = decode_link_target(path);
            let normalized_subpath = collapse_whitespace(&decode_link_target(subpath));
            (
                normalized_path,
                if normalized_subpath.is_empty() {
                    None
                } else {
                    Some(normalized_subpath)
                },
            )
        }
        None => (decode_link_target(value), None),
    }
}

fn is_workspace_relative_link(href: &str) -> bool {
    !(href.starts_with('#')
        || href.starts_with('/')
        || href.starts_with("http://")
        || href.starts_with("https://")
        || href.starts_with("mailto:")
        || href.starts_with("file:"))
}

fn get_snippet_from_match(content: &str, start: usize, length: usize) -> String {
    let snippet_start = start.saturating_sub(72);
    let snippet_end = (start + length + 72).min(content.len());
    collapse_whitespace(&content[snippet_start..snippet_end])
}

fn strip_frontmatter(content: &str) -> String {
    if !content.starts_with("---\n") {
        return content.to_string();
    }

    match content[4..].find("\n---\n") {
        Some(end) => content[end + 9..].to_string(),
        None => content.to_string(),
    }
}

fn parse_frontmatter(content: &str) -> FrontmatterData {
    if !content.starts_with("---\n") {
        return FrontmatterData::default();
    }

    let Some(end) = content[4..].find("\n---\n") else {
        return FrontmatterData::default();
    };
    let frontmatter = &content[4..end + 4];
    let mut aliases = Vec::new();
    let mut lines = frontmatter.lines().peekable();

    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("aliases:") {
            let inline = rest.trim();
            if inline.starts_with('[') && inline.ends_with(']') {
                let values = &inline[1..inline.len() - 1];
                for value in values.split(',') {
                    let alias = value.trim().trim_matches('"').trim_matches('\'');
                    if !alias.is_empty() {
                        aliases.push(alias.to_string());
                    }
                }
                continue;
            }

            while let Some(next_line) = lines.peek() {
                let next_trimmed = next_line.trim();
                if let Some(item) = next_trimmed.strip_prefix("- ") {
                    let alias = item.trim().trim_matches('"').trim_matches('\'');
                    if !alias.is_empty() {
                        aliases.push(alias.to_string());
                    }
                    lines.next();
                } else {
                    break;
                }
            }
        }
    }

    FrontmatterData { aliases }
}

fn get_preview_snippet(content: &str) -> String {
    let stripped = strip_frontmatter(content);
    for line in stripped.lines() {
        let trimmed = collapse_whitespace(line);
        if !trimmed.is_empty() {
            return trimmed.chars().take(180).collect();
        }
    }
    String::new()
}

fn extract_wikilinks(content: &str) -> Vec<ParsedLinkOccurrence> {
    let bytes = content.as_bytes();
    let mut cursor = 0usize;
    let mut links = Vec::new();

    while cursor + 1 < bytes.len() {
        let is_embed = if cursor + 2 < bytes.len() && bytes[cursor] == b'!' && bytes[cursor + 1] == b'[' && bytes[cursor + 2] == b'[' {
            cursor += 1;
            true
        } else {
            false
        };

        if cursor + 1 >= bytes.len() || bytes[cursor] != b'[' || bytes[cursor + 1] != b'[' {
            cursor += 1;
            continue;
        }

        let start = cursor;
        cursor += 2;
        let mut end = cursor;
        while end + 1 < bytes.len() && !(bytes[end] == b']' && bytes[end + 1] == b']') {
            end += 1;
        }
        if end + 1 >= bytes.len() {
            break;
        }

        let raw = &content[cursor..end];
        let (raw_target_part, target_subpath) = split_link_target(raw.split('|').next().unwrap_or("").trim());
        let display_text = raw
            .split_once('|')
            .map(|(_, display)| display.trim().to_string())
            .unwrap_or_default();
        if !raw_target_part.is_empty() {
            links.push(ParsedLinkOccurrence {
                display_text,
                raw_target: raw_target_part.clone(),
                target_subpath,
                is_embed,
                snippet: get_snippet_from_match(content, start, end + 2 - start),
                syntax: "wikilink".to_string(),
            });
        }

        cursor = end + 2;
    }

    links
}

fn extract_markdown_links(content: &str) -> Vec<ParsedLinkOccurrence> {
    let bytes = content.as_bytes();
    let mut cursor = 0usize;
    let mut links = Vec::new();

    while cursor < bytes.len() {
        let is_embed = cursor > 0 && bytes[cursor - 1] == b'!';
        if bytes[cursor] != b'[' {
            cursor += 1;
            continue;
        }

        let text_start = cursor + 1;
        let mut text_end = text_start;
        while text_end < bytes.len() && bytes[text_end] != b']' {
            text_end += 1;
        }
        if text_end + 1 >= bytes.len() || bytes[text_end + 1] != b'(' {
            cursor += 1;
            continue;
        }

        let target_start = text_end + 2;
        let mut target_end = target_start;
        while target_end < bytes.len() && bytes[target_end] != b')' {
            target_end += 1;
        }
        if target_end >= bytes.len() {
            break;
        }

        let raw_target = content[target_start..target_end].trim();
        if is_workspace_relative_link(raw_target) {
            let (target_path, target_subpath) = split_link_target(raw_target);
            links.push(ParsedLinkOccurrence {
                display_text: content[text_start..text_end].trim().to_string(),
                raw_target: target_path,
                target_subpath,
                is_embed,
                snippet: get_snippet_from_match(content, cursor, target_end + 1 - cursor),
                syntax: "markdown".to_string(),
            });
        }

        cursor = target_end + 1;
    }

    links
}

fn build_file_lookup(notes: &[WikiLinkNoteRecord]) -> FileLookup {
    let mut lookup = FileLookup::default();

    for note in notes {
        let alias_values = note
            .aliases
            .iter()
            .map(|alias| normalize_lookup_key(alias))
            .filter(|alias| !alias.is_empty())
            .collect::<Vec<_>>();
        let basename_with_ext = normalize_lookup_key(&note.name);
        let basename_no_ext = normalize_lookup_key(&file_title(&note.name));
        let relative_with_ext = normalize_lookup_key(&note.relative_path);
        let relative_no_ext = normalize_lookup_key(&remove_file_extension(&note.relative_path));

        for alias in alias_values {
            lookup.by_alias.entry(alias).or_default().push(note.clone());
        }
        lookup
            .by_basename_with_ext
            .entry(basename_with_ext)
            .or_default()
            .push(note.clone());
        lookup
            .by_basename_no_ext
            .entry(basename_no_ext)
            .or_default()
            .push(note.clone());
        lookup
            .by_relative_with_ext
            .insert(relative_with_ext, note.clone());
        lookup
            .by_relative_no_ext
            .insert(relative_no_ext, note.clone());
    }

    lookup
}

fn resolve_from_candidates(candidates: Option<&Vec<WikiLinkNoteRecord>>, fallback_title: &str) -> Option<ResolvedTarget> {
    candidates.and_then(|items| {
        items.first().map(|note| ResolvedTarget {
            path: Some(note.path.clone()),
            relative_path: Some(note.relative_path.clone()),
            title: note.title.clone(),
            lookup_key: normalize_lookup_key(&note.relative_path),
        })
    }).or_else(|| {
        if fallback_title.is_empty() {
            None
        } else {
            Some(ResolvedTarget {
                path: None,
                relative_path: None,
                title: fallback_title.to_string(),
                lookup_key: normalize_lookup_key(fallback_title),
            })
        }
    })
}

fn resolve_candidate_target(
    raw_target: &str,
    lookup: &FileLookup,
    source_relative_path: &str,
) -> ResolvedTarget {
    let normalized = normalize_lookup_key(raw_target);
    let normalized_no_ext = normalize_lookup_key(&remove_file_extension(raw_target));
    let source_dir = source_relative_path
        .rsplit_once('/')
        .map(|(dir, _)| dir.to_string())
        .unwrap_or_default();
    let source_relative_candidate = if source_dir.is_empty() {
        normalized.clone()
    } else {
        normalize_lookup_key(&format!("{}/{}", source_dir, raw_target))
    };
    let source_relative_candidate_no_ext = normalize_lookup_key(&remove_file_extension(&source_relative_candidate));
    let fallback_title = if raw_target.is_empty() {
        "Untitled".to_string()
    } else {
        file_title(raw_target.split('/').last().unwrap_or(raw_target))
    };

    if let Some(note) = lookup.by_relative_with_ext.get(&normalized) {
        return ResolvedTarget {
            path: Some(note.path.clone()),
            relative_path: Some(note.relative_path.clone()),
            title: note.title.clone(),
            lookup_key: normalized,
        };
    }
    if let Some(note) = lookup.by_relative_no_ext.get(&normalized_no_ext) {
        return ResolvedTarget {
            path: Some(note.path.clone()),
            relative_path: Some(note.relative_path.clone()),
            title: note.title.clone(),
            lookup_key: normalized_no_ext,
        };
    }
    if let Some(note) = lookup.by_relative_with_ext.get(&source_relative_candidate) {
        return ResolvedTarget {
            path: Some(note.path.clone()),
            relative_path: Some(note.relative_path.clone()),
            title: note.title.clone(),
            lookup_key: source_relative_candidate,
        };
    }
    if let Some(note) = lookup.by_relative_no_ext.get(&source_relative_candidate_no_ext) {
        return ResolvedTarget {
            path: Some(note.path.clone()),
            relative_path: Some(note.relative_path.clone()),
            title: note.title.clone(),
            lookup_key: source_relative_candidate_no_ext,
        };
    }

    let base_name = raw_target
        .replace('\\', "/")
        .split('/')
        .last()
        .unwrap_or(raw_target)
        .to_string();
    let base_name_key = normalize_lookup_key(&base_name);
    let base_name_no_ext_key = normalize_lookup_key(&file_title(&base_name));

    if let Some(target) = resolve_from_candidates(lookup.by_basename_with_ext.get(&base_name_key), &fallback_title) {
        return target;
    }
    if let Some(target) = resolve_from_candidates(lookup.by_basename_no_ext.get(&base_name_no_ext_key), &fallback_title) {
        return target;
    }
    if let Some(target) = resolve_from_candidates(lookup.by_alias.get(&normalized), &fallback_title) {
        return target;
    }

    ResolvedTarget {
        path: None,
        relative_path: None,
        title: fallback_title,
        lookup_key: if normalized.is_empty() {
            base_name_no_ext_key
        } else {
            normalized
        },
    }
}

fn create_note_record_id(workspace: &str, path: &str) -> String {
    format!("{}::{}", workspace_id(workspace), normalize_path(path))
}

fn create_link_record_id(
    workspace: &str,
    source_path: &str,
    target_lookup_key: &str,
    target_subpath: Option<&str>,
) -> String {
    format!(
        "{}::{}::{}::{}",
        workspace_id(workspace),
        normalize_path(source_path),
        target_lookup_key,
        target_subpath.unwrap_or("")
    )
}

fn list_workspace_files(workspace: &str) -> Result<Vec<IndexedFileEntry>, String> {
    let root = Path::new(workspace);
    if !root.exists() {
        log_index(format!(
            "Workspace '{}' does not exist on disk, returning empty file list",
            normalize_path(workspace)
        ));
        return Ok(Vec::new());
    }

    log_index(format!(
        "Scanning workspace '{}' for supported files",
        normalize_path(workspace)
    ));
    let mut stack = vec![root.to_path_buf()];
    let mut files = Vec::new();

    while let Some(dir) = stack.pop() {
        let read_dir = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(error) => {
                eprintln!(
                    "[workspace_index] Failed to read directory {}: {}",
                    dir.display(),
                    error
                );
                continue;
            }
        };

        for entry in read_dir.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with('.') {
                continue;
            }

            let path_buf = entry.path();
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };

            if metadata.is_dir() {
                stack.push(path_buf);
                continue;
            }

            let path = normalize_path(&path_buf.to_string_lossy());
            if !is_supported_editor_file(&path) {
                continue;
            }

            let mtime = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .and_then(|duration| i64::try_from(duration.as_millis()).ok());

            files.push(IndexedFileEntry {
                path: path.clone(),
                relative_path: relative_workspace_path(&path, workspace),
                name: file_name,
                size: metadata.len(),
                mtime,
            });
        }
    }

    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    let markdown_files = files.iter().filter(|file| is_markdown_file(&file.path)).count();
    log_index(format!(
        "Workspace scan complete for '{}': {} supported files ({} markdown)",
        normalize_path(workspace),
        files.len(),
        markdown_files
    ));
    Ok(files)
}

fn parse_workspace_file(workspace: &str, file: &IndexedFileEntry) -> Result<WikiLinkNoteRecord, String> {
    if !is_markdown_file(&file.path) {
        return Ok(WikiLinkNoteRecord {
            aliases: Vec::new(),
            id: create_note_record_id(workspace, &file.path),
            mtime: file.mtime,
            name: file.name.clone(),
            path: file.path.clone(),
            preview_snippet: String::new(),
            raw_links: Vec::new(),
            relative_path: file.relative_path.clone(),
            size: file.size,
            title: file_title(&file.name),
            workspace_id: workspace_id(workspace),
            workspace_path: normalize_path(workspace),
        });
    }

    let content = fs::read_to_string(&file.path)
        .map_err(|error| format!("Failed to read markdown file {}: {}", file.path, error))?;
    let frontmatter = parse_frontmatter(&content);
    let mut raw_links = extract_wikilinks(&content);
    raw_links.extend(extract_markdown_links(&content));
    raw_links.retain(|link| !link.raw_target.is_empty() && is_workspace_relative_link(&link.raw_target));

    Ok(WikiLinkNoteRecord {
        aliases: frontmatter.aliases,
        id: create_note_record_id(workspace, &file.path),
        mtime: file.mtime,
        name: file.name.clone(),
        path: file.path.clone(),
        preview_snippet: get_preview_snippet(&content),
        raw_links,
        relative_path: file.relative_path.clone(),
        size: file.size,
        title: file_title(&file.name),
        workspace_id: workspace_id(workspace),
        workspace_path: normalize_path(workspace),
    })
}

fn build_workspace_snapshot(
    workspace: &str,
    notes: Vec<WikiLinkNoteRecord>,
    status: &str,
    processed_files: usize,
    last_indexed_at: Option<i64>,
    last_error: Option<String>,
) -> WorkspaceIndexSnapshot {
    let lookup = build_file_lookup(&notes);
    let notes_by_path = notes
        .iter()
        .map(|note| (note.path.clone(), note.clone()))
        .collect::<HashMap<_, _>>();
    let mut aggregated_links = BTreeMap::<String, WikiLinkLinkRecord>::new();

    for note in &notes {
        for occurrence in &note.raw_links {
            let resolved = resolve_candidate_target(&occurrence.raw_target, &lookup, &note.relative_path);
            let key = create_link_record_id(
                workspace,
                &note.path,
                &resolved.lookup_key,
                occurrence.target_subpath.as_deref(),
            );

            let target_note = resolved
                .path
                .as_ref()
                .and_then(|path| notes_by_path.get(path));
            let entry = aggregated_links.entry(key.clone()).or_insert_with(|| WikiLinkLinkRecord {
                id: key.clone(),
                workspace_id: workspace_id(workspace),
                source_path: note.path.clone(),
                source_relative_path: note.relative_path.clone(),
                target_path: resolved.path.clone(),
                target_relative_path: resolved.relative_path.clone(),
                target_name: target_note
                    .map(|record| record.title.clone())
                    .unwrap_or_else(|| resolved.title.clone()),
                target_lookup_key: resolved.lookup_key.clone(),
                target_subpath: occurrence.target_subpath.clone(),
                is_embed: occurrence.is_embed,
                count: 0,
                snippets: Vec::new(),
            });

            entry.count += 1;
            if !occurrence.snippet.is_empty() && !entry.snippets.iter().any(|snippet| snippet == &occurrence.snippet) {
                entry.snippets.push(occurrence.snippet.clone());
            }
        }
    }

    let links = aggregated_links.into_values().collect::<Vec<_>>();
    let total_resolved_links = links.iter().filter(|record| record.target_path.is_some()).count();
    let total_dangling_links = links.len().saturating_sub(total_resolved_links);
    let total_markdown_files = notes.iter().filter(|record| is_markdown_file(&record.path)).count();
    let total_files = notes.len();

    let mut notes = notes;
    notes.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    WorkspaceIndexSnapshot {
        links,
        meta: Some(WikiLinkMetaRecord {
            id: workspace_id(workspace),
            workspace_id: workspace_id(workspace),
            workspace_path: normalize_path(workspace),
            status: status.to_string(),
            processed_files,
            total_files,
            total_markdown_files,
            total_resolved_links,
            total_dangling_links,
            last_indexed_at,
            last_error,
        }),
        notes,
    }
}

fn emit_progress(app: &AppHandle, state: WikiLinkIndexingState) {
    if state.processed_files == 0
        || state.phase != "scanning"
        || state.processed_files == state.total_files
        || state.processed_files % 100 == 0
    {
        log_index(format!(
            "Progress phase={} processed={}/{} workspace='{}' current_file={}",
            state.phase,
            state.processed_files,
            state.total_files,
            state.workspace,
            state.current_file.as_deref().unwrap_or("-")
        ));
    }
    let _ = app.emit("workspace-index-progress", state);
}

pub fn read_workspace_index_snapshot(workspace: &str) -> Result<WorkspaceIndexSnapshot, String> {
    log_index(format!(
        "Snapshot requested for workspace '{}'",
        normalize_path(workspace)
    ));
    Ok(read_snapshot_from_disk(workspace)?.unwrap_or(WorkspaceIndexSnapshot {
        notes: Vec::new(),
        links: Vec::new(),
        meta: None,
    }))
}

pub fn get_workspace_index_summary(workspace: &str) -> Result<Option<WikiLinkMetaRecord>, String> {
    log_index(format!(
        "Index summary requested for workspace '{}'",
        normalize_path(workspace)
    ));
    Ok(read_snapshot_from_disk(workspace)?.and_then(|snapshot| snapshot.meta))
}

pub fn rebuild_workspace_index(
    app: &AppHandle,
    workspace: &str,
    force_full: bool,
) -> Result<bool, String> {
    let workspace = normalize_path(workspace);
    log_index(format!(
        "Starting {} index rebuild for workspace '{}'",
        if force_full { "full" } else { "incremental" },
        workspace
    ));
    let files = list_workspace_files(&workspace)?;
    let existing_snapshot = read_snapshot_from_disk(&workspace)?;
    let existing_notes = existing_snapshot
        .as_ref()
        .map(|snapshot| {
            snapshot
                .notes
                .iter()
                .cloned()
                .map(|note| (note.path.clone(), note))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();

    let mut note_map = if force_full {
        HashMap::new()
    } else {
        existing_notes.clone()
    };
    let mut changed_files = Vec::new();
    let current_paths = files.iter().map(|file| file.path.clone()).collect::<Vec<_>>();

    if force_full {
        changed_files = files.clone();
    } else {
        for file in &files {
            let unchanged = existing_notes.get(&file.path).map(|note| {
                note.size == file.size && note.mtime == file.mtime
            }).unwrap_or(false);
            if !unchanged {
                changed_files.push(file.clone());
            }
        }

        let current_path_set = current_paths.iter().cloned().collect::<std::collections::HashSet<_>>();
        note_map.retain(|path, _| current_path_set.contains(path));
    }

    let deleted_files = files.len().saturating_sub(note_map.len().min(files.len()));
    log_index(format!(
        "Index rebuild plan for '{}': total_files={} changed_files={} cached_notes_before={} force_full={}",
        workspace,
        files.len(),
        changed_files.len(),
        existing_notes.len(),
        force_full
    ));

    if changed_files.is_empty() && existing_snapshot.is_some() {
        log_index(format!(
            "No file changes detected for '{}'; skipping rebuild",
            workspace
        ));
        return Ok(false);
    }

    emit_progress(
        app,
        WikiLinkIndexingState {
            current_file: None,
            error: None,
            phase: "scanning".to_string(),
            processed_files: 0,
            total_files: changed_files.len(),
            workspace: workspace.clone(),
        },
    );

    for (index, file) in changed_files.iter().enumerate() {
        let record = parse_workspace_file(&workspace, file).unwrap_or_else(|error| {
            eprintln!(
                "[workspace_index] Failed to parse file {}: {}",
                file.path, error
            );
            WikiLinkNoteRecord {
                aliases: Vec::new(),
                id: create_note_record_id(&workspace, &file.path),
                mtime: file.mtime,
                name: file.name.clone(),
                path: file.path.clone(),
                preview_snippet: String::new(),
                raw_links: Vec::new(),
                relative_path: file.relative_path.clone(),
                size: file.size,
                title: file_title(&file.name),
                workspace_id: workspace_id(&workspace),
                workspace_path: workspace.clone(),
            }
        });
        note_map.insert(file.path.clone(), record);

        emit_progress(
            app,
            WikiLinkIndexingState {
                current_file: Some(file.relative_path.clone()),
                error: None,
                phase: "scanning".to_string(),
                processed_files: index + 1,
                total_files: changed_files.len(),
                workspace: workspace.clone(),
            },
        );
    }

    emit_progress(
        app,
        WikiLinkIndexingState {
            current_file: None,
            error: None,
            phase: "saving".to_string(),
            processed_files: changed_files.len(),
            total_files: changed_files.len(),
            workspace: workspace.clone(),
        },
    );

    let last_indexed_at = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok());
    let snapshot = build_workspace_snapshot(
        &workspace,
        note_map.into_values().collect(),
        "ready",
        files.len(),
        last_indexed_at,
        None,
    );

    write_snapshot_to_disk(&workspace, &snapshot)?;
    log_index(format!(
        "Index rebuild complete for '{}': processed_changed_files={} final_notes={} final_links={} deleted_or_pruned_estimate={}",
        workspace,
        changed_files.len(),
        snapshot.notes.len(),
        snapshot.links.len(),
        deleted_files
    ));

    emit_progress(
        app,
        WikiLinkIndexingState {
            current_file: None,
            error: None,
            phase: "complete".to_string(),
            processed_files: changed_files.len(),
            total_files: changed_files.len(),
            workspace,
        },
    );

    Ok(true)
}
