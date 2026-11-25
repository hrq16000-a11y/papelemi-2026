import "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/sitemap.xml": {
      id: "/sitemap.xml";
      path: "/sitemap.xml";
      fullPath: "/sitemap.xml";
      preLoaderRoute: typeof import("../routes/sitemap[.]xml").Route;
      parentRoute: typeof import("../routes/__root").Route;
    };
  }
}
