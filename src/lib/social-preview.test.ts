import { describe, expect, it } from "vitest";
import { publicSocialMeta } from "./social-preview";

const fallback = "https://www.papelemi.com.br/social-preview.png";
const value = (meta: ReturnType<typeof publicSocialMeta>, key: string) =>
  meta.find((tag) => ("property" in tag ? tag.property : tag.name) === key)?.content;

describe("public social images", () => {
  it("uses the branded absolute fallback and declares actual dimensions", () => {
    const meta = publicSocialMeta("Loja", "Descrição");
    expect(value(meta, "og:image")).toBe(fallback);
    expect(value(meta, "twitter:image")).toBe(fallback);
    expect(value(meta, "og:image:width")).toBe("1200");
    expect(value(meta, "og:image:height")).toBe("630");
  });
  it("preserves public catalog pictures and resolves local paths absolutely", () => {
    const meta = publicSocialMeta("Caderneta", "Descrição", "/images/papelemi/caderneta-ursinho-clean.jpg");
    expect(value(meta, "og:image")).toBe("https://www.papelemi.com.br/images/papelemi/caderneta-ursinho-clean.jpg");
    expect(value(meta, "twitter:image")).toBe(value(meta, "og:image"));
    expect(value(meta, "og:image:width")).toBeUndefined();
    expect(value(meta, "og:image:alt")).toBe("Caderneta");
  });
  it("does not use malformed, insecure or credentialed URLs", () => {
    for (const image of ["", "invalid", "http://example.com/a.png", "javascript:alert(1)", "//example.com/a.png", "https://user:pass@example.com/a.png"]) {
      expect(value(publicSocialMeta("Loja", "Descrição", image), "og:image")).toBe(fallback);
    }
  });
});
