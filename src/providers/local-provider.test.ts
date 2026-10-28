import { describe, it, expect } from "vitest";
import { createLocalProvider, localParent, localRoot, localSegments } from "./local-provider";

describe("local provider paths", () => {
  it("walks up POSIX paths to the root", () => {
    expect(localParent("/Users/me/Docs")).toBe("/Users/me");
    expect(localParent("/Users/me/")).toBe("/Users");
    expect(localParent("/Users")).toBe("/");
    expect(localParent("/")).toBe("/");
  });

  it("walks up Windows paths to the drive root", () => {
    expect(localParent("C:\\Users\\me")).toBe("C:\\Users");
    expect(localParent("C:\\Users")).toBe("C:\\");
    expect(localParent("C:\\")).toBe("C:\\");
    expect(localRoot("D:\\data")).toBe("D:\\");
  });

  it("builds breadcrumb segments root first", () => {
    expect(localSegments("/Users/me")).toEqual([
      { label: "/", path: "/" },
      { label: "Users", path: "/Users" },
      { label: "me", path: "/Users/me" },
    ]);
    expect(localSegments("C:\\Users\\me")).toEqual([
      { label: "C:", path: "C:\\" },
      { label: "Users", path: "C:\\Users" },
      { label: "me", path: "C:\\Users\\me" },
    ]);
  });

  it("joins with the path's own separator", () => {
    expect(createLocalProvider("/").joinPath("/Users", ".env")).toBe("/Users/.env");
    expect(createLocalProvider("/").joinPath("/", "tmp")).toBe("/tmp");
    expect(createLocalProvider("C:\\").joinPath("C:\\Users", "me")).toBe("C:\\Users\\me");
    expect(createLocalProvider("C:\\").rootLabel()).toBe("C:");
  });
});
