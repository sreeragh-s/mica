'use client';

import * as React from 'react';

import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { readDir, stat } from '@tauri-apps/plugin-fs';

import { isMarkdownFile, isSupportedEditorFile } from '@/lib/file-types';
import { getCurrentWorkspace, getWorkspaceScopedStorageKey } from '@/lib/workspace';

const ACTIVE_FILE_PATH_KEY = 'active-file-path';
const WIKILINK_INDEX_UPDATED_EVENT = 'wikilink-index-updated';
const WIKILINK_REBUILD_REQUESTED_EVENT = 'wikilink-rebuild-requested';
const OPEN_WIKILINK_GRAPH_EVENT = 'open-wikilink-graph';
const WORKSPACE_INDEX_PROGRESS_EVENT = 'workspace-index-progress';

export const WIKI_GRAPH_TAB_PATH = '__wiki-graph__';
export const WIKI_GRAPH_TAB_NAME = 'Wiki Graph';

type WikiLinkPhase = 'idle' | 'scanning' | 'saving' | 'complete' | 'error';
type WikiLinkMetaStatus = 'ready' | 'indexing' | 'error';

type ParsedLinkOccurrence = {
  displayText: string;
  rawTarget: string;
  targetSubpath: string | null;
  isEmbed: boolean;
  snippet: string;
  syntax: 'wikilink' | 'markdown';
};

type WikiLinkNoteRecord = {
  id: string;
  workspaceId: string;
  workspacePath: string;
  path: string;
  relativePath: string;
  name: string;
  title: string;
  aliases: string[];
  previewSnippet: string;
  rawLinks: ParsedLinkOccurrence[];
  size: number;
  mtime: number | null;
};

type WikiLinkLinkRecord = {
  id: string;
  workspaceId: string;
  sourcePath: string;
  sourceRelativePath: string;
  targetPath: string | null;
  targetRelativePath: string | null;
  targetName: string;
  targetLookupKey: string;
  targetSubpath: string | null;
  isEmbed: boolean;
  count: number;
  snippets: string[];
};

export type WikiLinkMetaRecord = {
  id: string;
  workspaceId: string;
  workspacePath: string;
  status: WikiLinkMetaStatus;
  processedFiles: number;
  totalFiles: number;
  totalMarkdownFiles: number;
  totalResolvedLinks: number;
  totalDanglingLinks: number;
  lastIndexedAt: number | null;
  lastError: string | null;
};

type WorkspaceIndexedFileEntry = WorkspaceFileEntry & {
  size: number;
  mtime: number | null;
};

type FileLookup = {
  byAlias: Map<string, WikiLinkNoteRecord[]>;
  byBasenameNoExt: Map<string, WikiLinkNoteRecord[]>;
  byBasenameWithExt: Map<string, WikiLinkNoteRecord[]>;
  byRelativeNoExt: Map<string, WikiLinkNoteRecord>;
  byRelativeWithExt: Map<string, WikiLinkNoteRecord>;
};

type RefreshOptions = {
  forceFull?: boolean;
};

type RebuildRequestDetail = {
  force?: boolean;
};

export type WorkspaceFileEntry = {
  name: string;
  path: string;
  relativePath: string;
};

export type WikiLinkListItem = {
  count: number;
  isDangling: boolean;
  path: string | null;
  previewSnippet: string;
  relativePath: string | null;
  taggedText: string | null;
  title: string;
};

export type WikiLinkSidebarData = {
  backlinks: WikiLinkListItem[];
  isIndexed: boolean;
  isLoading: boolean;
  meta: WikiLinkMetaRecord | null;
  outgoingLinks: WikiLinkListItem[];
};

export type WikiLinkGraphNode = {
  degree: number;
  id: string;
  isDangling: boolean;
  path: string | null;
  relativePath: string | null;
  title: string;
};

export type WikiLinkGraphEdge = {
  count: number;
  id: string;
  isDangling: boolean;
  source: string;
  target: string;
};

export type WikiLinkGraphData = {
  edges: WikiLinkGraphEdge[];
  isIndexed: boolean;
  isLoading: boolean;
  meta: WikiLinkMetaRecord | null;
  nodes: WikiLinkGraphNode[];
  workspace: string | null;
};

export type WikiLinkIndexingState = {
  currentFile: string | null;
  error: string | null;
  phase: WikiLinkPhase;
  processedFiles: number;
  totalFiles: number;
  workspace: string | null;
};

export type WikiLinkFreshnessResult = {
  changedFiles: WorkspaceIndexedFileEntry[];
  deletedPaths: string[];
  stale: boolean;
  workspaceFiles: WorkspaceIndexedFileEntry[];
};

export type WikiLinkIndexSummary = {
  isLoading: boolean;
  meta: WikiLinkMetaRecord | null;
  workspace: string | null;
};

type WorkspaceIndexSnapshot = {
  links: WikiLinkLinkRecord[];
  meta: WikiLinkMetaRecord | null;
  notes: WikiLinkNoteRecord[];
};

export function isWorkspaceRelativeLink(href?: string) {
  if (!href) {
    return false;
  }

  return !/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href);
}

export function normalizePathForCompare(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

function getWorkspaceId(workspace: string) {
  return encodeURIComponent(normalizePathForCompare(workspace));
}

function getFileTitle(fileName: string) {
  if (fileName.endsWith('.excalidraw.json')) {
    return fileName.slice(0, -'.excalidraw.json'.length);
  }

  if (fileName.endsWith('.excalidraw')) {
    return fileName.slice(0, -'.excalidraw'.length);
  }

  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) {
    return fileName;
  }

  return fileName.slice(0, lastDot);
}

function normalizeLookupKey(value: string) {
  return value.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '').toLowerCase();
}

function removeFileExtension(path: string) {
  const normalizedPath = path.replace(/\\/g, '/');
  const lastSlash = normalizedPath.lastIndexOf('/');
  const directory = lastSlash >= 0 ? normalizedPath.slice(0, lastSlash + 1) : '';
  const fileName = lastSlash >= 0 ? normalizedPath.slice(lastSlash + 1) : normalizedPath;

  if (fileName.endsWith('.excalidraw.json')) {
    return `${directory}${fileName.slice(0, -'.json'.length)}`;
  }

  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) {
    return normalizedPath;
  }

  return `${directory}${fileName.slice(0, lastDot)}`;
}

function decodeLinkTarget(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripFrontmatter(content: string) {
  if (!content.startsWith('---\n')) {
    return content;
  }

  const endIndex = content.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return content;
  }

  return content.slice(endIndex + 5);
}

function stripMarkdownToText(content: string) {
  return collapseWhitespace(
    stripFrontmatter(content)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[\[([^[\]]+)\]\]/g, '$1')
      .replace(/\[\[([^[\]]+)\]\]/g, '$1')
      .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
  );
}

export function getPreviewSnippet(content: string) {
  return stripMarkdownToText(content).slice(0, 180);
}

function getSnippetFromMatch(content: string, index: number, length: number) {
  const start = Math.max(0, index - 72);
  const end = Math.min(content.length, index + length + 72);
  return collapseWhitespace(content.slice(start, end)).slice(0, 180);
}

function splitWikiLinkValue(value: string) {
  const pipeIndex = value.indexOf('|');
  const rawTarget = pipeIndex >= 0 ? value.slice(0, pipeIndex) : value;

  return rawTarget.trim();
}

function getWikiLinkDisplayText(value: string) {
  const pipeIndex = value.indexOf('|');
  const displayText = pipeIndex >= 0 ? value.slice(pipeIndex + 1).trim() : '';

  if (displayText) {
    return displayText;
  }

  const rawTarget = splitWikiLinkValue(value);
  const { path, subpath } = splitLinkTarget(rawTarget);
  return (path || subpath || rawTarget).trim();
}

function splitLinkTarget(rawTarget: string) {
  if (rawTarget.startsWith('#')) {
    return {
      path: '',
      subpath: rawTarget.slice(1) || null,
    };
  }

  const hashIndex = rawTarget.indexOf('#');
  if (hashIndex === -1) {
    return {
      path: rawTarget,
      subpath: null,
    };
  }

  return {
    path: rawTarget.slice(0, hashIndex),
    subpath: rawTarget.slice(hashIndex + 1) || null,
  };
}

export function extractAliases(content: string) {
  if (!content.startsWith('---\n')) {
    return [];
  }

  const endIndex = content.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return [];
  }

  const frontmatter = content.slice(4, endIndex);
  const lines = frontmatter.split('\n');
  const aliases: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^aliases\s*:\s*(.*)$/);

    if (!match) {
      continue;
    }

    const inlineValue = match[1].trim();

    if (inlineValue.startsWith('[') && inlineValue.endsWith(']')) {
      inlineValue
        .slice(1, -1)
        .split(',')
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
        .forEach((entry) => aliases.push(entry));
      continue;
    }

    if (inlineValue) {
      aliases.push(inlineValue.replace(/^['"]|['"]$/g, ''));
      continue;
    }

    for (let nestedIndex = index + 1; nestedIndex < lines.length; nestedIndex += 1) {
      const nestedLine = lines[nestedIndex];
      const itemMatch = nestedLine.match(/^\s*-\s+(.*)$/);

      if (!itemMatch) {
        break;
      }

      aliases.push(itemMatch[1].trim().replace(/^['"]|['"]$/g, ''));
      index = nestedIndex;
    }
  }

  return Array.from(new Set(aliases.filter(Boolean)));
}

export function extractWikilinks(content: string) {
  return Array.from(content.matchAll(/(!)?\[\[([^[\]]+)\]\]/g), (match) => ({
    displayText: getWikiLinkDisplayText(match[2] ?? ''),
    rawTarget: splitWikiLinkValue(match[2] ?? ''),
    snippet: getSnippetFromMatch(content, match.index ?? 0, match[0].length),
    syntax: 'wikilink' as const,
    targetSubpath: splitLinkTarget(splitWikiLinkValue(match[2] ?? '')).subpath,
    isEmbed: Boolean(match[1]),
  })).filter((link) => Boolean(link.rawTarget) || Boolean(link.targetSubpath));
}

export function extractMarkdownLinks(content: string) {
  return Array.from(content.matchAll(/(!)?\[([^\]]*)\]\(([^)]+)\)/g), (match) => {
    const rawHref = decodeLinkTarget((match[3] ?? '').trim().replace(/^<|>$/g, ''));
    const [hrefWithoutQuery] = rawHref.split('?');
    const { path, subpath } = splitLinkTarget(hrefWithoutQuery);
    const displayText = collapseWhitespace((match[2] ?? '').trim());

    return {
      displayText: displayText || path.trim() || subpath || rawHref,
      rawTarget: path.trim(),
      snippet: getSnippetFromMatch(content, match.index ?? 0, match[0].length),
      syntax: 'markdown' as const,
      targetSubpath: subpath,
      isEmbed: Boolean(match[1]),
    };
  }).filter((link) => Boolean(link.rawTarget) || Boolean(link.targetSubpath));
}

function buildFileLookup(notes: WikiLinkNoteRecord[]) {
  const lookup: FileLookup = {
    byAlias: new Map(),
    byBasenameNoExt: new Map(),
    byBasenameWithExt: new Map(),
    byRelativeNoExt: new Map(),
    byRelativeWithExt: new Map(),
  };

  for (const note of notes) {
    const relativeWithExt = normalizeLookupKey(note.relativePath);
    const relativeNoExt = normalizeLookupKey(removeFileExtension(note.relativePath));
    const basenameWithExt = normalizeLookupKey(note.name);
    const basenameNoExt = normalizeLookupKey(note.title);

    lookup.byRelativeWithExt.set(relativeWithExt, note);
    lookup.byRelativeNoExt.set(relativeNoExt, note);

    lookup.byBasenameWithExt.set(basenameWithExt, [
      ...(lookup.byBasenameWithExt.get(basenameWithExt) ?? []),
      note,
    ]);
    lookup.byBasenameNoExt.set(basenameNoExt, [
      ...(lookup.byBasenameNoExt.get(basenameNoExt) ?? []),
      note,
    ]);

    for (const alias of note.aliases) {
      const aliasKey = normalizeLookupKey(alias);
      if (!aliasKey) continue;

      lookup.byAlias.set(aliasKey, [...(lookup.byAlias.get(aliasKey) ?? []), note]);
    }
  }

  return lookup;
}

function resolveRelativePath(fromRelativePath: string, targetPath: string) {
  const sourceParts = fromRelativePath.split('/').slice(0, -1);
  const targetParts = targetPath.replace(/\\/g, '/').split('/');
  const stack = [...sourceParts];

  for (const part of targetParts) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..') {
      stack.pop();
      continue;
    }

    stack.push(part);
  }

  return stack.join('/');
}

function resolveCandidateTarget(
  rawTarget: string,
  lookup: FileLookup,
  sourceRelativePath: string,
  syntax: ParsedLinkOccurrence['syntax']
) {
  if (!rawTarget) {
    const selfNote =
      lookup.byRelativeWithExt.get(normalizeLookupKey(sourceRelativePath)) ??
      lookup.byRelativeNoExt.get(normalizeLookupKey(removeFileExtension(sourceRelativePath)));

    return {
      path: selfNote?.path ?? null,
      relativePath: selfNote?.relativePath ?? sourceRelativePath,
      title: selfNote?.title ?? getFileTitle(getWorkspaceFileName(sourceRelativePath)),
    };
  }

  const normalizedTarget = rawTarget.replace(/^\.?\//, '').replace(/\\/g, '/');
  const normalizedKey = normalizeLookupKey(normalizedTarget);
  const normalizedKeyNoExt = normalizeLookupKey(removeFileExtension(normalizedTarget));
  const relativeMarkdownKey =
    syntax === 'markdown'
      ? normalizeLookupKey(resolveRelativePath(sourceRelativePath, normalizedTarget))
      : '';
  const relativeMarkdownKeyNoExt =
    syntax === 'markdown'
      ? normalizeLookupKey(removeFileExtension(resolveRelativePath(sourceRelativePath, normalizedTarget)))
      : '';

  const exactMatch =
    lookup.byRelativeWithExt.get(relativeMarkdownKey) ??
    lookup.byRelativeNoExt.get(relativeMarkdownKeyNoExt) ??
    lookup.byRelativeWithExt.get(normalizedKey) ??
    lookup.byRelativeNoExt.get(normalizedKeyNoExt);

  if (exactMatch) {
    return {
      path: exactMatch.path,
      relativePath: exactMatch.relativePath,
      title: exactMatch.title,
    };
  }

  const basenameMatches =
    lookup.byBasenameWithExt.get(normalizedKey) ??
    lookup.byBasenameNoExt.get(normalizedKeyNoExt) ??
    lookup.byAlias.get(normalizedKey) ??
    lookup.byAlias.get(normalizedKeyNoExt) ??
    [];

  if (basenameMatches.length === 1) {
    const match = basenameMatches[0];
    return {
      path: match.path,
      relativePath: match.relativePath,
      title: match.title,
    };
  }

  return {
    path: null,
    relativePath: null,
    title: rawTarget,
  };
}

export function createNoteRecordId(workspace: string, path: string) {
  return `${getWorkspaceId(workspace)}::${path}`;
}

function createLinkAggregationKey(
  workspace: string,
  sourcePath: string,
  targetLookupKey: string,
  targetPath: string | null
) {
  return `${getWorkspaceId(workspace)}::${sourcePath}::${targetPath ?? `dangling:${targetLookupKey}`}`;
}

function sortNoteRecords(records: WikiLinkNoteRecord[]) {
  return [...records].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function sortLinkRecords(records: WikiLinkLinkRecord[]) {
  return [...records].sort((a, b) => {
    const sourceCompare = a.sourceRelativePath.localeCompare(b.sourceRelativePath);
    if (sourceCompare !== 0) return sourceCompare;

    const targetA = a.targetRelativePath ?? a.targetName;
    const targetB = b.targetRelativePath ?? b.targetName;
    return targetA.localeCompare(targetB);
  });
}

export function buildWorkspaceSnapshot(
  workspace: string,
  noteRecords: WikiLinkNoteRecord[],
  metaOverrides: Pick<WikiLinkMetaRecord, 'status' | 'processedFiles' | 'lastIndexedAt' | 'lastError'>
) {
  const lookup = buildFileLookup(noteRecords);
  const aggregatedLinks = new Map<string, WikiLinkLinkRecord>();
  let totalResolvedLinks = 0;
  let totalDanglingLinks = 0;

  for (const note of noteRecords) {
    for (const occurrence of note.rawLinks) {
      const targetDescriptor = splitLinkTarget(occurrence.rawTarget);
      const resolvedTarget =
        targetDescriptor.path || occurrence.targetSubpath
          ? resolveCandidateTarget(
              targetDescriptor.path,
              lookup,
              note.relativePath,
              occurrence.syntax
            )
          : {
              path: note.path,
              relativePath: note.relativePath,
              title: note.title,
            };
      const targetLookupKey = normalizeLookupKey(
        targetDescriptor.path || occurrence.targetSubpath || note.relativePath
      );
      const recordId = createLinkAggregationKey(
        workspace,
        note.path,
        targetLookupKey,
        resolvedTarget.path
      );
      const existing = aggregatedLinks.get(recordId);

      if (resolvedTarget.path) {
        totalResolvedLinks += 1;
      } else {
        totalDanglingLinks += 1;
      }

      if (existing) {
        existing.count += 1;
        if (occurrence.snippet && existing.snippets.length < 5) {
          existing.snippets.push(occurrence.snippet);
        }
        continue;
      }

      aggregatedLinks.set(recordId, {
        id: recordId,
        workspaceId: getWorkspaceId(workspace),
        sourcePath: note.path,
        sourceRelativePath: note.relativePath,
        targetPath: resolvedTarget.path,
        targetRelativePath: resolvedTarget.relativePath,
        targetName: resolvedTarget.title,
        targetLookupKey: targetDescriptor.path || occurrence.targetSubpath || note.relativePath,
        targetSubpath: targetDescriptor.subpath ?? occurrence.targetSubpath,
        isEmbed: occurrence.isEmbed,
        count: 1,
        snippets: occurrence.snippet ? [occurrence.snippet] : [],
      });
    }
  }

  const meta: WikiLinkMetaRecord = {
    id: getWorkspaceId(workspace),
    workspaceId: getWorkspaceId(workspace),
    workspacePath: workspace,
    status: metaOverrides.status,
    processedFiles: metaOverrides.processedFiles,
    totalFiles: noteRecords.length,
    totalMarkdownFiles: noteRecords.filter((record) => isMarkdownFile(record.path)).length,
    totalResolvedLinks,
    totalDanglingLinks,
    lastIndexedAt: metaOverrides.lastIndexedAt,
    lastError: metaOverrides.lastError,
  };

  return {
    links: sortLinkRecords(Array.from(aggregatedLinks.values())),
    meta,
    notes: sortNoteRecords(noteRecords),
  };
}

async function readWorkspaceIndex(workspace: string) {
  console.info('[WikiLinkIndex] Reading backend snapshot', { workspace });
  return invoke<WorkspaceIndexSnapshot>('read_workspace_index_snapshot', { workspace });
}

function dispatchWikiLinkIndexUpdated(workspace: string) {
  console.info('[WikiLinkIndex] Dispatching index updated event', { workspace });
  window.dispatchEvent(
    new CustomEvent(WIKILINK_INDEX_UPDATED_EVENT, {
      detail: {
        workspace,
        updatedAt: Date.now(),
      },
    })
  );
}

async function listWorkspaceIndexedFilesForPath(workspace: string) {
  const queue = [workspace];
  const files: WorkspaceIndexedFileEntry[] = [];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) continue;

    const entries = await readDir(currentPath);

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = `${currentPath}/${entry.name}`;

      if (entry.isDirectory) {
        queue.push(fullPath);
        continue;
      }

      if (!isSupportedEditorFile(fullPath)) continue;

      const fileInfo = await stat(fullPath);
      files.push({
        name: entry.name,
        path: fullPath,
        relativePath: getRelativeWorkspacePath(fullPath, workspace),
        size: fileInfo.size,
        mtime: fileInfo.mtime ? fileInfo.mtime.getTime() : null,
      });
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

export async function checkWorkspaceWikiLinkIndexFreshness(
  workspace: string
): Promise<WikiLinkFreshnessResult> {
  const [workspaceFiles, existingIndex] = await Promise.all([
    listWorkspaceIndexedFilesForPath(workspace),
    readWorkspaceIndex(workspace),
  ]);

  if (!existingIndex.meta || existingIndex.meta.status !== 'ready') {
    return {
      changedFiles: workspaceFiles,
      deletedPaths: existingIndex.notes.map((note) => note.path),
      stale: workspaceFiles.length > 0 || existingIndex.notes.length > 0,
      workspaceFiles,
    };
  }

  const existingByPath = new Map(existingIndex.notes.map((note) => [note.path, note]));
  const workspacePathSet = new Set(workspaceFiles.map((file) => file.path));
  const changedFiles = workspaceFiles.filter((file) => {
    const existing = existingByPath.get(file.path);
    if (!existing) return true;

    return existing.size !== file.size || existing.mtime !== file.mtime;
  });
  const deletedPaths = existingIndex.notes
    .filter((note) => !workspacePathSet.has(note.path))
    .map((note) => note.path);

  return {
    changedFiles,
    deletedPaths,
    stale: changedFiles.length > 0 || deletedPaths.length > 0,
    workspaceFiles,
  };
}

async function runWorkspaceIndexRefresh(
  workspace: string,
  onProgress?: (state: WikiLinkIndexingState) => void,
  options?: RefreshOptions
) {
  console.info('[WikiLinkIndex] Requesting backend rebuild', {
    forceFull: options?.forceFull ?? false,
    workspace,
  });
  let unlisten: (() => void) | null = null;

  if (onProgress) {
    unlisten = await listen<WikiLinkIndexingState>(WORKSPACE_INDEX_PROGRESS_EVENT, (event) => {
      if (event.payload.workspace === workspace) {
        if (
          event.payload.phase !== 'scanning' ||
          event.payload.processedFiles === 0 ||
          event.payload.processedFiles === event.payload.totalFiles ||
          event.payload.processedFiles % 100 === 0
        ) {
          console.info('[WikiLinkIndex] Backend progress', event.payload);
        }
        onProgress(event.payload);
      }
    });
  }

  try {
    const changed = await invoke<boolean>('rebuild_workspace_index', {
      forceFull: options?.forceFull ?? false,
      workspace,
    });
    console.info('[WikiLinkIndex] Backend rebuild finished', {
      changed,
      forceFull: options?.forceFull ?? false,
      workspace,
    });
    dispatchWikiLinkIndexUpdated(workspace);
    return changed;
  } finally {
    unlisten?.();
  }
}

export function requestWorkspaceWikiLinkRebuild(force = true) {
  window.dispatchEvent(
    new CustomEvent<RebuildRequestDetail>(WIKILINK_REBUILD_REQUESTED_EVENT, {
      detail: { force },
    })
  );
}

export function requestOpenWikiLinkGraph() {
  window.dispatchEvent(new CustomEvent(OPEN_WIKILINK_GRAPH_EVENT));
}

export async function refreshWorkspaceWikiLinkIndex(
  workspace: string,
  onProgress?: (state: WikiLinkIndexingState) => void
) {
  return runWorkspaceIndexRefresh(workspace, onProgress);
}

export async function rebuildWorkspaceWikiLinkIndex(
  workspace: string,
  onProgress?: (state: WikiLinkIndexingState) => void
) {
  return runWorkspaceIndexRefresh(workspace, onProgress, { forceFull: true });
}

export async function getWorkspaceWikiLinkIndexSummary(workspace: string | null) {
  if (!workspace) {
    return null;
  }

  console.info('[WikiLinkIndex] Reading backend summary', { workspace });
  return invoke<WikiLinkMetaRecord | null>('get_workspace_index_summary', { workspace });
}

export function resolveWorkspaceLinkPath(href: string) {
  const workspace = getCurrentWorkspace();

  if (!workspace) {
    return null;
  }

  const normalizedWorkspace = normalizePathForCompare(workspace);
  const normalizedHref = href.replace(/^\.?\//, '').replace(/\\/g, '/');

  return {
    name: normalizedHref.split('/').pop() ?? normalizedHref,
    path: `${normalizedWorkspace}/${normalizedHref}`,
  };
}

export function openWorkspaceLink(href: string) {
  const target = resolveWorkspaceLinkPath(href);

  if (!target) {
    return false;
  }

  window.dispatchEvent(
    new CustomEvent('file-selected', {
      detail: target,
    })
  );

  return true;
}

export function getRelativeWorkspacePath(path: string, workspace: string) {
  const normalizedPath = normalizePathForCompare(path);
  const normalizedWorkspace = normalizePathForCompare(workspace);

  if (normalizedPath === normalizedWorkspace) {
    return '.';
  }

  if (normalizedPath.startsWith(`${normalizedWorkspace}/`)) {
    return normalizedPath.slice(normalizedWorkspace.length + 1);
  }

  return path;
}

export function getWorkspaceFileName(path: string) {
  const normalizedPath = normalizePathForCompare(path);
  const parts = normalizedPath.split('/');

  return parts[parts.length - 1] ?? path;
}

export async function listWorkspaceFiles() {
  const workspace = getCurrentWorkspace();

  if (!workspace) {
    return null;
  }

  const files = await listWorkspaceIndexedFilesForPath(workspace);
  return files.map(({ name, path, relativePath }) => ({ name, path, relativePath }));
}

export function isSameFilePath(a?: string | null, b?: string | null) {
  if (!a || !b) {
    return false;
  }

  return normalizePathForCompare(a) === normalizePathForCompare(b);
}

export function useActiveFilePath() {
  const [activeFilePath, setActiveFilePath] = React.useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const workspace = getCurrentWorkspace();
    return localStorage.getItem(
      getWorkspaceScopedStorageKey(ACTIVE_FILE_PATH_KEY, workspace)
    );
  });

  React.useEffect(() => {
    const handleActiveFileChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string | null }>).detail;
      setActiveFilePath(detail?.path ?? null);
    };

    const handleWorkspaceChanged = () => {
      const workspace = getCurrentWorkspace();
      setActiveFilePath(
        localStorage.getItem(
          getWorkspaceScopedStorageKey(ACTIVE_FILE_PATH_KEY, workspace)
        )
      );
    };

    window.addEventListener('active-file-changed', handleActiveFileChanged);
    window.addEventListener('workspace-changed', handleWorkspaceChanged);

    return () => {
      window.removeEventListener('active-file-changed', handleActiveFileChanged);
      window.removeEventListener('workspace-changed', handleWorkspaceChanged);
    };
  }, []);

  return activeFilePath;
}

export function useWikiLinkIndexSummary() {
  const [state, setState] = React.useState<WikiLinkIndexSummary>({
    isLoading: true,
    meta: null,
    workspace: getCurrentWorkspace(),
  });

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const workspace = getCurrentWorkspace();
      setState((currentState) => ({
        ...currentState,
        isLoading: true,
        workspace,
      }));

      let meta: WikiLinkMetaRecord | null = null;

      try {
        meta = await getWorkspaceWikiLinkIndexSummary(workspace);
      } catch (error) {
        console.error('[WikiLinkIndex] Failed to load index summary:', error);
      }

      if (cancelled) return;

      setState({
        isLoading: false,
        meta,
        workspace,
      });
    };

    const handleUpdate = () => {
      void load();
    };

    void load();

    window.addEventListener(WIKILINK_INDEX_UPDATED_EVENT, handleUpdate);
    window.addEventListener('workspace-changed', handleUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener(WIKILINK_INDEX_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('workspace-changed', handleUpdate);
    };
  }, []);

  return state;
}

export function useOpenWikiLinkGraph(handler: () => void) {
  React.useEffect(() => {
    window.addEventListener(OPEN_WIKILINK_GRAPH_EVENT, handler);
    return () => window.removeEventListener(OPEN_WIKILINK_GRAPH_EVENT, handler);
  }, [handler]);
}

export function useWikiLinkSidebarData(activeFilePath: string | null): WikiLinkSidebarData {
  const [state, setState] = React.useState<WikiLinkSidebarData>({
    backlinks: [],
    isIndexed: false,
    isLoading: true,
    meta: null,
    outgoingLinks: [],
  });

  React.useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      const workspace = getCurrentWorkspace();

      if (!workspace || !activeFilePath) {
        setState({
          backlinks: [],
          isIndexed: false,
          isLoading: false,
          meta: null,
          outgoingLinks: [],
        });
        return;
      }

      setState((currentState) => ({
        ...currentState,
        isLoading: true,
      }));

      try {
        const { links, meta, notes } = await readWorkspaceIndex(workspace);
        if (cancelled) return;

        const notesByPath = new Map(notes.map((note) => [note.path, note]));
        const backlinks = links
          .filter((record) => record.targetPath === activeFilePath)
          .map((record) => {
            const sourceNote = notesByPath.get(record.sourcePath);

            return {
              count: record.count,
              isDangling: false,
              path: sourceNote?.path ?? record.sourcePath,
              previewSnippet: record.snippets[0] ?? sourceNote?.previewSnippet ?? '',
              relativePath: sourceNote?.relativePath ?? record.sourceRelativePath,
              taggedText: null,
              title:
                sourceNote?.title ??
                getFileTitle(sourceNote?.name ?? getWorkspaceFileName(record.sourcePath)),
            };
          })
          .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));

        const lookup = buildFileLookup(notes);
        const activeNote = notesByPath.get(activeFilePath);
        const outgoingLinks = activeNote
          ? activeNote.rawLinks
              .map((occurrence) => {
            const targetDescriptor = splitLinkTarget(occurrence.rawTarget);
            const resolvedTarget =
              targetDescriptor.path || occurrence.targetSubpath
                ? resolveCandidateTarget(
                    targetDescriptor.path,
                    lookup,
                    activeNote.relativePath,
                    occurrence.syntax
                  )
                : {
                    path: activeNote.path,
                    relativePath: activeNote.relativePath,
                    title: activeNote.title,
                  };
            const targetNote = resolvedTarget.path ? notesByPath.get(resolvedTarget.path) : null;

            return {
              count: 0,
              isDangling: !resolvedTarget.path,
              path: targetNote?.path ?? resolvedTarget.path,
              previewSnippet: targetNote?.previewSnippet ?? occurrence.snippet ?? '',
              relativePath: targetNote?.relativePath ?? resolvedTarget.relativePath ?? null,
              taggedText: occurrence.displayText || occurrence.rawTarget || null,
              title: targetNote?.title ?? resolvedTarget.title,
            };
          })
          .filter((item, index, items) => {
            const itemKey = `${item.path ?? item.title}::${item.taggedText ?? ''}`;
            return (
              items.findIndex(
                (candidate) =>
                  `${candidate.path ?? candidate.title}::${candidate.taggedText ?? ''}` === itemKey
              ) === index
            );
          })
          .sort((a, b) => {
            if (a.isDangling !== b.isDangling) {
              return a.isDangling ? 1 : -1;
            }

            const taggedTextCompare = (a.taggedText ?? '').localeCompare(b.taggedText ?? '');
            if (taggedTextCompare !== 0) {
              return taggedTextCompare;
            }

            return a.title.localeCompare(b.title);
          })
          : [];

        setState({
          backlinks,
          isIndexed: Boolean(meta),
          isLoading: meta?.status === 'indexing',
          meta,
          outgoingLinks,
        });
      } catch (error) {
        console.error('[WikiLinkIndex] Failed to read sidebar data:', error);
        if (cancelled) return;

        setState({
          backlinks: [],
          isIndexed: false,
          isLoading: false,
          meta: null,
          outgoingLinks: [],
        });
      }
    };

    const handleIndexUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ workspace?: string }>).detail;
      const workspace = getCurrentWorkspace();

      if (detail?.workspace && workspace && detail.workspace !== workspace) {
        return;
      }

      void loadData();
    };

    void loadData();

    window.addEventListener(WIKILINK_INDEX_UPDATED_EVENT, handleIndexUpdate);
    window.addEventListener('workspace-changed', handleIndexUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener(WIKILINK_INDEX_UPDATED_EVENT, handleIndexUpdate);
      window.removeEventListener('workspace-changed', handleIndexUpdate);
    };
  }, [activeFilePath]);

  return state;
}

export function useWikiLinkGraphData(): WikiLinkGraphData {
  const [state, setState] = React.useState<WikiLinkGraphData>({
    edges: [],
    isIndexed: false,
    isLoading: true,
    meta: null,
    nodes: [],
    workspace: getCurrentWorkspace(),
  });

  React.useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      const workspace = getCurrentWorkspace();

      if (!workspace) {
        setState({
          edges: [],
          isIndexed: false,
          isLoading: false,
          meta: null,
          nodes: [],
          workspace: null,
        });
        return;
      }

      setState((currentState) => ({
        ...currentState,
        isLoading: true,
        workspace,
      }));

      try {
        const { links, meta, notes } = await readWorkspaceIndex(workspace);

        if (cancelled) {
          return;
        }

        const degreeByNodeId = new Map<string, number>();
        const nodesById = new Map<string, WikiLinkGraphNode>();

        notes.forEach((note) => {
          nodesById.set(note.path, {
            degree: 0,
            id: note.path,
            isDangling: false,
            path: note.path,
            relativePath: note.relativePath,
            title: note.title,
          });
        });

        const edges = links
          .map((record) => {
            const targetId = record.targetPath ?? `dangling:${record.targetLookupKey}`;

            if (!record.targetPath && !nodesById.has(targetId)) {
              nodesById.set(targetId, {
                degree: 0,
                id: targetId,
                isDangling: true,
                path: null,
                relativePath: record.targetRelativePath ?? null,
                title: record.targetName,
              });
            }

            degreeByNodeId.set(record.sourcePath, (degreeByNodeId.get(record.sourcePath) ?? 0) + record.count);
            degreeByNodeId.set(targetId, (degreeByNodeId.get(targetId) ?? 0) + record.count);

            return {
              count: record.count,
              id: record.id,
              isDangling: !record.targetPath,
              source: record.sourcePath,
              target: targetId,
            } satisfies WikiLinkGraphEdge;
          })
          .filter((edge) => nodesById.has(edge.source) && nodesById.has(edge.target));

        const nodes = Array.from(nodesById.values())
          .map((node) => ({
            ...node,
            degree: degreeByNodeId.get(node.id) ?? 0,
          }))
          .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title));

        setState({
          edges,
          isIndexed: Boolean(meta),
          isLoading: meta?.status === 'indexing',
          meta,
          nodes,
          workspace,
        });
      } catch (error) {
        console.error('[WikiLinkIndex] Failed to read graph data:', error);

        if (cancelled) {
          return;
        }

        setState({
          edges: [],
          isIndexed: false,
          isLoading: false,
          meta: null,
          nodes: [],
          workspace,
        });
      }
    };

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ workspace?: string }>).detail;
      const workspace = getCurrentWorkspace();

      if (detail?.workspace && workspace && detail.workspace !== workspace) {
        return;
      }

      void loadData();
    };

    void loadData();

    window.addEventListener(WIKILINK_INDEX_UPDATED_EVENT, handleUpdate);
    window.addEventListener('workspace-changed', handleUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener(WIKILINK_INDEX_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('workspace-changed', handleUpdate);
    };
  }, []);

  return state;
}

export function useWikiLinkRebuildRequests(handler: (force: boolean) => void) {
  React.useEffect(() => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<RebuildRequestDetail>).detail;
      handler(detail?.force !== false);
    };

    window.addEventListener(WIKILINK_REBUILD_REQUESTED_EVENT, handleRequest);
    return () => window.removeEventListener(WIKILINK_REBUILD_REQUESTED_EVENT, handleRequest);
  }, [handler]);
}
