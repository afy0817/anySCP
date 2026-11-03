// Drag-and-drop moves between groups: each store applies the move (and the
// optional new order) at once, persists both, and reloads on failure — the
// move and the reorder are separate writes, so either may have landed.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { HostGroup, S3Connection, SavedHost } from "../types";
import { useHostsStore } from "./hosts-store";
import { useGroupsStore } from "./groups-store";
import { useS3Store } from "./s3-store";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

function host(id: string, groupId: string | null): SavedHost {
  return {
    id,
    label: id,
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

function group(id: string, parentId: string | null): HostGroup {
  return {
    id,
    name: id,
    color: "#6366f1",
    icon: null,
    sort_order: 0,
    default_username: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    parent_id: parentId,
  };
}

function conn(id: string, groupId: string | null): S3Connection {
  return {
    id,
    label: id,
    provider: "aws",
    region: "us-east-1",
    endpoint: null,
    bucket: null,
    path_style: false,
    group_id: groupId,
    color: null,
    environment: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  invoke.mockReset();
});

describe("hosts-store moveHost", () => {
  const a = host("a", null);
  const b = host("b", "g");

  beforeEach(() => {
    useHostsStore.setState({ hosts: [a, b], error: null });
  });

  it("moves the host and persists only the move without a new order", async () => {
    invoke.mockResolvedValue(undefined);

    await useHostsStore.getState().moveHost("a", "g");

    expect(useHostsStore.getState().hosts.map((h) => [h.id, h.group_id])).toEqual([
      ["a", "g"],
      ["b", "g"],
    ]);
    expect(invoke.mock.calls).toEqual([["move_host_to_group", { id: "a", groupId: "g" }]]);
  });

  it("applies the new order in the same step and persists it", async () => {
    invoke.mockResolvedValue(undefined);

    await useHostsStore.getState().moveHost("a", "g", [b, a]);

    expect(useHostsStore.getState().hosts.map((h) => [h.id, h.group_id])).toEqual([
      ["b", "g"],
      ["a", "g"],
    ]);
    expect(invoke.mock.calls).toEqual([
      ["move_host_to_group", { id: "a", groupId: "g" }],
      ["reorder_hosts", { orderedIds: ["b", "a"] }],
    ]);
  });

  it("reloads what got stored and rethrows when a write fails", async () => {
    const stored = [host("a", null), host("b", "g")];
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "list_hosts") return Promise.resolve(stored);
      if (cmd === "reorder_hosts") return Promise.reject(new Error("db locked"));
      return Promise.resolve(undefined);
    });

    await expect(useHostsStore.getState().moveHost("a", "g", [b, a])).rejects.toThrow("db locked");
    expect(useHostsStore.getState().hosts).toEqual(stored);
  });
});

describe("groups-store moveGroup", () => {
  const x = group("x", null);
  const y = group("y", null);

  beforeEach(() => {
    useGroupsStore.setState({ groups: [x, y], error: null });
  });

  it("re-parents the group and persists move + order", async () => {
    invoke.mockResolvedValue(undefined);

    await useGroupsStore.getState().moveGroup("y", "x", [y, x]);

    expect(useGroupsStore.getState().groups.map((g) => [g.id, g.parent_id])).toEqual([
      ["y", "x"],
      ["x", null],
    ]);
    expect(invoke.mock.calls).toEqual([
      ["move_group", { id: "y", parentId: "x" }],
      ["reorder_groups", { orderedIds: ["y", "x"] }],
    ]);
  });

  it("reloads what got stored and rethrows when the move is rejected", async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "list_groups") return Promise.resolve([x, y]);
      return Promise.reject(new Error("cannot be moved into itself"));
    });

    await expect(useGroupsStore.getState().moveGroup("y", "x")).rejects.toThrow("into itself");
    expect(useGroupsStore.getState().groups).toEqual([x, y]);
  });
});

describe("s3-store moveConnection", () => {
  const s = conn("s", null);

  beforeEach(() => {
    useS3Store.setState({ connections: [s] });
  });

  it("moves the connection and persists the move", async () => {
    invoke.mockResolvedValue(undefined);

    await useS3Store.getState().moveConnection("s", "g");

    expect(useS3Store.getState().connections[0].group_id).toBe("g");
    expect(invoke.mock.calls).toEqual([["move_s3_to_group", { id: "s", groupId: "g" }]]);
  });

  it("reloads what got stored and rethrows when the move fails", async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "s3_list_connections") return Promise.resolve([s]);
      return Promise.reject(new Error("not found"));
    });

    await expect(useS3Store.getState().moveConnection("s", "g")).rejects.toThrow("not found");
    expect(useS3Store.getState().connections).toEqual([s]);
  });
});
