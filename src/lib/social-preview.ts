/** Explicit public route metadata only. Never attach a brand preview at the root or to private order/admin routes. */
const SITE = "https://www.papelemi.com.br";
const BRAND_IMAGE = SITE + "/social-preview.png";
const BRAND_ALT = "PapeLemi — papelaria personalizada, cadernetas, planners e presentes";

export function publicCanonical(path: `/${string}`) {
  return { rel: "canonical", href: SITE + path };
}

export function publicSocialMeta(path: `/${string}`, title: string, description: string, image?: string) {
  let url = BRAND_IMAGE;
  if (image && (/^https:\/\//i.test(image) || (image.startsWith("/") && !image.startsWith("//")))) {
    try {
      const candidate = new URL(image, SITE);
      if (candidate.protocol === "https:" && !candidate.username && !candidate.password) {
        url = candidate.href;
      }
    } catch {
      // Keep the branded fallback for missing or invalid catalog images.
    }
  }
  const brand = url === BRAND_IMAGE;
  const alt = brand ? BRAND_ALT : title;
  return [
    { property: "og:url", content: publicCanonical(path).href },
    { property: "og:image", content: url },
    { property: "og:image:alt", content: alt },
    ...(brand ? [
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/png" },
    ] : []),
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: url },
    { name: "twitter:image:alt", content: alt },
  ];
}
