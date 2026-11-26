import { describe, expect, it } from "vitest";
import { Route } from "@/routes/admin";

describe("PapeLemi Emporio admin route", () => {
  it("registers the original admin runtime at /admin", () => {
    expect(Route.options.path).toBe("/admin");
    expect(Route.options.head).toBeTypeOf("function");
  });
});
