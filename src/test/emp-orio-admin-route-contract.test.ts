import { describe, expect, it } from "vitest";
import { Route } from "@/routes/admin";

describe("PapeLemi Emporio admin route", () => {
  it("exposes the admin entry component and private-page metadata", () => {
    expect(Route.options.component).toBeTypeOf("function");
    expect(Route.options.head).toBeTypeOf("function");
  });
});
