import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DropTarget, DropZone, TreeItemRef } from "../../lib/host-tree";

// Drag-and-drop wiring shared by the tree and folder views. Every entry is
// both draggable and a drop target; HostBrowser works out which zone of the
// target the pointer is over and publishes it here so the target can draw it.

/** Draggable payload (`active.data.current`). */
export interface DragData {
  item: TreeItemRef;
}

export interface DropHover {
  key: string;
  zone: DropZone;
}

export const DropHoverContext = createContext<DropHover | null>(null);

function itemKey(item: TreeItemRef): string {
  return `${item.kind}:${item.id}`;
}

/** Make an entry draggable and droppable. `zone` is set while it is the drop target. */
export function useDndEntry(item: TreeItemRef, target: DropTarget, disabled: boolean) {
  const key = itemKey(item);
  const drag = useDraggable({ id: key, data: { item } satisfies DragData, disabled });
  const drop = useDroppable({ id: key, data: target, disabled });
  const hover = useContext(DropHoverContext);
  const { setNodeRef: setDragRef } = drag;
  const { setNodeRef: setDropRef } = drop;
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );
  return {
    setRef,
    attributes: drag.attributes,
    listeners: drag.listeners,
    isDragging: drag.isDragging,
    zone: hover !== null && hover.key === key ? hover.zone : null,
  };
}

/** A place that only takes entries in (breadcrumb, top-level strip). */
export function useFolderDrop(folderId: string | null, disabled: boolean) {
  const key = `into:${folderId ?? ""}`;
  const drop = useDroppable({
    id: key,
    data: { type: "folder", folderId } satisfies DropTarget,
    disabled,
  });
  const hover = useContext(DropHoverContext);
  return { setRef: drop.setNodeRef, active: hover !== null && hover.key === key };
}

/** Card wrapper for the folder view grid: drag handle + drop indicator. */
export function DndCard({
  item,
  target,
  disabled,
  children,
}: {
  item: TreeItemRef;
  target: DropTarget;
  disabled: boolean;
  children: ReactNode;
}) {
  const dnd = useDndEntry(item, target, disabled);
  return (
    <div
      ref={dnd.setRef}
      // touch-none lets the TouchSensor own the gesture once a drag begins
      // instead of the browser scrolling the page.
      className={[
        "relative h-full touch-none rounded-xl",
        dnd.isDragging ? "opacity-40" : "",
        dnd.zone === "inside" ? "ring-2 ring-accent" : "",
      ].join(" ")}
      {...dnd.attributes}
      {...dnd.listeners}
    >
      {children}
      {(dnd.zone === "before" || dnd.zone === "after") && (
        <div
          aria-hidden="true"
          className={[
            "absolute top-1 bottom-1 w-0.5 rounded-full bg-accent pointer-events-none",
            dnd.zone === "before" ? "-left-1.5" : "-right-1.5",
          ].join(" ")}
        />
      )}
    </div>
  );
}
