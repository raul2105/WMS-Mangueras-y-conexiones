import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTE_ACCESS_MAP, getRouteAccessEntry } from "@/lib/rbac/route-access-map";

function walkPageFiles(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkPageFiles(full, out);
      continue;
    }
    if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

function fileToRoute(filePath: string) {
  const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  const withoutApp = relative.replace(/^app\//, "");
  const segments = withoutApp
    .split("/")
    .filter((segment) => segment && segment !== "page.tsx" && segment !== "layout.tsx" && segment !== "loading.tsx" && segment !== "error.tsx");

  const routeSegments = segments
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith(")"))
    .map((segment) => segment.replace(/^\[(.+)\]$/, "[$1]"));

  return `/${routeSegments.join("/")}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

describe("route access map coverage", () => {
  it("covers every discovered page route", () => {
    const pageFiles = walkPageFiles(path.join(process.cwd(), "app"))
      .filter((file) => !file.includes(`${path.sep}api${path.sep}`))
      .filter((file) => !file.endsWith(`${path.sep}app${path.sep}layout.tsx`))
      .filter((file) => !file.endsWith(`${path.sep}app${path.sep}globals.css`))
      .sort();

    const routes = pageFiles.map(fileToRoute);
    expect(routes).toHaveLength(66);

    const missing = routes.filter((route) => !getRouteAccessEntry(route));
    expect(missing).toEqual([]);
    expect(ROUTE_ACCESS_MAP.length).toBeGreaterThanOrEqual(routes.length);
  });
});
