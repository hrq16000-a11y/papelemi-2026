import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { CANONICAL_ORIGIN } from "@/emp-orio/lib/urls";
import { routeTree } from "@/routeTree.gen";
import { Route } from "@/routes/admin";

describe("PapeLemi Emporio admin route", () => {
  it("registers the admin entry with private-page metadata", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    expect(router.matchRoutes("/admin").some((match) => match.routeId.startsWith("/admin"))).toBe(true);
    expect(Route.options.component).toBeTypeOf("function");
    expect(Route.options.head).toBeTypeOf("function");
    expect(Route.options.head?.().meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
  });

  it("uses the PapeLemi canonical origin in the imported engine", () => {
    expect(CANONICAL_ORIGIN).toBe("https://www.papelemi.com.br");
  });
});
