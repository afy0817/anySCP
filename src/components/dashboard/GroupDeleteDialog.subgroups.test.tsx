// The delete dialog for a group with subgroups: it has to say they exist and
// offer the cascade even when no host sits in the group itself.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupDeleteDialog } from "./GroupDeleteDialog";
import type { HostGroup } from "../../types";

const group: HostGroup = {
  id: "g1",
  name: "prod",
  color: "#6366f1",
  icon: null,
  sort_order: 0,
  default_username: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  parent_id: null,
};

describe("GroupDeleteDialog with subgroups", () => {
  it("offers the cascade for a group holding only subgroups", () => {
    const onConfirm = vi.fn();
    render(<GroupDeleteDialog group={group} hostCount={0} subgroupCount={2} onConfirm={onConfirm} onCancel={vi.fn()} />);

    expect(screen.getByText("It has 2 subgroups.")).toBeInTheDocument();
    expect(screen.queryByText(/empty group/i)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /also delete all 2 subgroups/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete group & hosts/i }));

    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("counts both hosts and subgroups", () => {
    render(<GroupDeleteDialog group={group} hostCount={3} subgroupCount={1} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("This group contains 3 hosts.")).toBeInTheDocument();
    expect(screen.getByText("It has 1 subgroup.")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /also delete all subgroups and the 3 hosts inside/i }),
    ).toBeInTheDocument();
  });

  it("calls an empty group empty", () => {
    render(<GroupDeleteDialog group={group} hostCount={0} subgroupCount={0} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("This empty group will be permanently removed.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
