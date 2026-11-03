// Drives the hosts page's two group layouts — the collapsible tree and the
// one-group-at-a-time folder view — plus search, subgroup creation and a
// drag-and-drop move, all against a mocked backend.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { HostsDashboard } from "../HostsDashboard";
import { useHostBrowserStore } from "../../../stores/host-browser-store";
import type { HostGroup, SavedHost } from "../../../types";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

function group(id: string, name: string, parentId: string | null): HostGroup {
  return {
    id,
    name,
    color: "#6366f1",
    icon: null,
    sort_order: 0,
    default_username: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    parent_id: parentId,
  };
}

function host(id: string, label: string, groupId: string | null): SavedHost {
  return {
    id,
    label,
    host: `${id}.example.com`,
    port: 22,
    username: "root",
    auth_type: "password",
    group_id: groupId,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    key_path: null,
    color: null,
    notes: null,
    environment: null,
    os_type: null,
    startup_command: null,
    proxy_jump: null,
    proxy_jump_host_id: null,
    start_directory: null,
    keep_alive_interval: null,
    default_shell: null,
    font_size: null,
    last_connected_at: null,
    connection_count: null,
  };
}

// prod ─ web ─ (web-1), prod ─ (db-1), plus top-level "laptop".
const groups = [group("prod", "prod", null), group("web", "web", "prod")];
const hosts = [host("web-1", "web-1", "web"), host("db-1", "db-1", "prod"), host("laptop", "laptop", null)];

function mockBackend() {
  invoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "list_groups":
        return Promise.resolve(groups);
      case "list_hosts":
        return Promise.resolve(hosts);
      case "list_recent_connections":
      case "s3_list_connections":
        return Promise.resolve([]);
      default:
        return Promise.resolve(undefined);
    }
  });
}

const shown = (testId: string) => screen.queryByTestId(testId) !== null;

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
  useHostBrowserStore.setState({ viewMode: "folder", folderId: null, collapsed: new Set() });
  mockBackend();
});

describe("folder view", () => {
  it("shows one group at a time and navigates with the breadcrumb", async () => {
    render(<HostsDashboard />);
    await screen.findByTestId("group-card-prod");

    // Top level: the top-level group and host only.
    expect(shown("host-card-laptop")).toBe(true);
    expect(shown("group-card-web")).toBe(false);
    expect(shown("host-card-db-1")).toBe(false);

    fireEvent.click(screen.getByTestId("group-card-prod"));
    expect(shown("group-card-web")).toBe(true);
    expect(shown("host-card-db-1")).toBe(true);
    expect(shown("host-card-laptop")).toBe(false);

    fireEvent.click(screen.getByTestId("group-card-web"));
    expect(shown("host-card-web-1")).toBe(true);
    expect(screen.getByTestId("host-crumb-web")).toHaveAttribute("aria-current", "location");

    fireEvent.click(screen.getByTestId("host-crumb-top"));
    expect(shown("group-card-prod")).toBe(true);
    expect(shown("host-card-laptop")).toBe(true);
  });

  it("searches across every group", async () => {
    render(<HostsDashboard />);
    await screen.findByTestId("group-card-prod");

    fireEvent.change(screen.getByTestId("host-search"), { target: { value: "web-1" } });

    expect(shown("host-card-web-1")).toBe(true);
    expect(shown("host-card-laptop")).toBe(false);
    expect(shown("group-card-prod")).toBe(false);
  });

  it("creates a new group inside the open one", async () => {
    render(<HostsDashboard />);
    fireEvent.click(await screen.findByTestId("group-card-prod"));

    fireEvent.click(screen.getByTestId("new-group-button"));
    fireEvent.change(await screen.findByTestId("group-modal-name"), { target: { value: "cache" } });
    fireEvent.click(screen.getByTestId("group-modal-save"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "create_group",
        expect.objectContaining({ group: expect.objectContaining({ name: "cache", parent_id: "prod" }) }),
      ),
    );
  });
});

describe("tree view", () => {
  async function renderTree() {
    render(<HostsDashboard />);
    await screen.findByTestId("group-card-prod");
    fireEvent.click(screen.getByTestId("host-view-tree"));
  }

  it("shows every level and remembers the mode", async () => {
    await renderTree();

    for (const id of [
      "host-tree-root", "group-card-prod", "group-card-web", "host-card-web-1", "host-card-db-1", "host-card-laptop",
    ]) {
      expect(shown(id)).toBe(true);
    }
    expect(localStorage.getItem("anyscp.hosts.viewMode")).toBe("tree");
  });

  it("collapses and expands a group", async () => {
    await renderTree();

    fireEvent.click(screen.getByTestId("group-card-prod"));
    expect(screen.getByTestId("group-card-prod")).toHaveAttribute("aria-expanded", "false");
    expect(shown("group-card-web")).toBe(false);
    expect(shown("host-card-db-1")).toBe(false);
    expect(shown("host-card-laptop")).toBe(true);

    fireEvent.click(screen.getByTestId("group-card-prod"));
    expect(shown("host-card-web-1")).toBe(true);
  });

  it("collapses everything under the top Hosts row", async () => {
    await renderTree();

    fireEvent.click(screen.getByTestId("host-tree-root"));

    expect(screen.getByTestId("host-tree-root")).toHaveAttribute("aria-expanded", "false");
    expect(shown("group-card-prod")).toBe(false);
    expect(shown("host-card-laptop")).toBe(false);
  });

  it("shows only the branches leading to a search match, even collapsed ones", async () => {
    await renderTree();
    fireEvent.click(screen.getByTestId("group-card-prod"));

    fireEvent.change(screen.getByTestId("host-search"), { target: { value: "web-1" } });

    expect(shown("group-card-prod")).toBe(true);
    expect(shown("group-card-web")).toBe(true);
    expect(shown("host-card-web-1")).toBe(true);
    expect(shown("host-card-db-1")).toBe(false);
    expect(shown("host-card-laptop")).toBe(false);
  });

  it("creates a subgroup from a group's context menu", async () => {
    await renderTree();

    fireEvent.contextMenu(screen.getByTestId("group-card-web"));
    fireEvent.click(screen.getByText("New Subgroup"));
    fireEvent.change(await screen.findByTestId("group-modal-name"), { target: { value: "edge" } });
    fireEvent.click(screen.getByTestId("group-modal-save"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "create_group",
        expect.objectContaining({ group: expect.objectContaining({ name: "edge", parent_id: "web" }) }),
      ),
    );
  });

  describe("drag and drop", () => {
    // jsdom has no layout: stack the rows 40px apart by their order in the DOM.
    let rectSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        const rows = [...document.querySelectorAll("[role='treeitem']")];
        const idx = rows.indexOf(this);
        const top = idx === -1 ? 1000 : idx * 40;
        return { x: 0, y: top, left: 0, top, width: 400, height: 36, right: 400, bottom: top + 36, toJSON: () => ({}) } as DOMRect;
      });
    });
    afterEach(() => {
      rectSpy.mockRestore();
    });

    /** Press on `from`, move past the 5px threshold, then release over (x, y).
     *  dnd-kit swallows clicks for 50ms after a drop (the browser's post-drag
     *  click); wait that out so the guard can't eat the next test's click. */
    async function drag(from: HTMLElement, to: { x: number; y: number }) {
      const start = from.getBoundingClientRect();
      const x0 = start.left + 10;
      const y0 = start.top + 18;
      act(() => {
        fireEvent.mouseDown(from, { button: 0, clientX: x0, clientY: y0 });
      });
      act(() => {
        fireEvent.mouseMove(document, { clientX: x0, clientY: y0 + 10 });
      });
      act(() => {
        fireEvent.mouseMove(document, { clientX: to.x, clientY: to.y });
      });
      act(() => {
        fireEvent.mouseUp(document, { clientX: to.x, clientY: to.y });
      });
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    it("moves a host into the group dropped on", async () => {
      await renderTree();
      const target = screen.getByTestId("group-card-web").getBoundingClientRect();

      // The middle of a group row means "into it".
      await drag(screen.getByTestId("host-card-laptop"), { x: 100, y: target.top + 18 });

      await waitFor(() =>
        expect(invoke).toHaveBeenCalledWith("move_host_to_group", { id: "laptop", groupId: "web" }),
      );
    });

    it("moves a host to the top level when dropped on the Hosts row", async () => {
      await renderTree();
      const target = screen.getByTestId("host-tree-root").getBoundingClientRect();

      await drag(screen.getByTestId("host-card-web-1"), { x: 100, y: target.top + 18 });

      await waitFor(() =>
        expect(invoke).toHaveBeenCalledWith("move_host_to_group", { id: "web-1", groupId: null }),
      );
    });

    it("moves a group next to a top-level host out to the top level", async () => {
      await renderTree();
      const target = screen.getByTestId("host-card-laptop").getBoundingClientRect();

      await drag(screen.getByTestId("group-card-web"), { x: 100, y: target.top + 4 });

      await waitFor(() =>
        expect(invoke).toHaveBeenCalledWith("move_group", { id: "web", parentId: null }),
      );
    });

    it("refuses to move a group into its own subgroup", async () => {
      await renderTree();
      const target = screen.getByTestId("group-card-web").getBoundingClientRect();

      await drag(screen.getByTestId("group-card-prod"), { x: 100, y: target.top + 18 });

      expect(invoke).not.toHaveBeenCalledWith("move_group", expect.anything());
    });
  });
});
