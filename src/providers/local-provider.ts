import type { ProviderCapabilities, FileSystemProvider } from "../types/explorer";

// The local "This PC" pane is a transfer source/target only: browse it and
// drag entries to or from the remote pane. File management stays in the OS.
const LOCAL_CAPABILITIES: ProviderCapabilities = {
  canRename: false,
  canCreateFile: false,
  canCreateFolder: false,
  canDelete: false,
  canUpload: false,
  canDownload: false,
  canDragDropUpload: false,
  canInternalDragMove: false,
  canCopyPaste: false,
  canEditInEditor: false,
  canGetInfo: false,
  hasPermissions: false,
  hasStorageClass: false,
  canPresignUrl: false,
};

const WINDOWS_ROOT = /^[A-Za-z]:\\?$/;

/** Separator a local path uses: "\" for Windows drive paths, "/" otherwise. */
function separatorOf(path: string): "/" | "\\" {
  return /^[A-Za-z]:/.test(path) ? "\\" : "/";
}

/** Root of a local path: "/" on POSIX, the drive ("C:\") on Windows. */
export function localRoot(path: string): string {
  const drive = /^([A-Za-z]:)/.exec(path);
  return drive ? `${drive[1]}\\` : "/";
}

/** Parent of a local path; the root is its own parent. */
export function localParent(path: string): string {
  const sep = separatorOf(path);
  const root = localRoot(path);
  if (path === root || WINDOWS_ROOT.test(path)) return root;
  const trimmed = path.endsWith(sep) ? path.slice(0, -1) : path;
  const idx = trimmed.lastIndexOf(sep);
  if (idx < 0) return root;
  const parent = trimmed.slice(0, idx);
  return parent.length <= root.length - 1 ? root : parent;
}

/** Breadcrumb segments for a local path, root first. */
export function localSegments(path: string): { label: string; path: string }[] {
  const sep = separatorOf(path);
  const root = localRoot(path);
  const parts = path.slice(root.length).split(sep).filter((s) => s.length > 0);
  return [
    { label: sep === "/" ? "/" : root.slice(0, -1), path: root },
    ...parts.map((seg, i) => ({
      label: seg,
      path: root + parts.slice(0, i + 1).join(sep),
    })),
  ];
}

export function createLocalProvider(root: string): FileSystemProvider {
  return {
    type: "local",
    sessionId: "local",
    capabilities: LOCAL_CAPABILITIES,
    joinPath(parent: string, child: string): string {
      const sep = separatorOf(parent);
      return parent.endsWith(sep) ? `${parent}${child}` : `${parent}${sep}${child}`;
    },
    parentPath: localParent,
    rootLabel(): string {
      return root === "/" ? "/" : root.slice(0, -1);
    },
  };
}
