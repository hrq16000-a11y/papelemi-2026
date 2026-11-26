import { describe, expect, it } from "vitest";
import { fit } from "@/lib/ai.functions";

describe("AI phrase length guard", () => {
  it("keeps text unchanged when it fits", () => {
    expect(fit("Com carinho", 20)).toBe("Com carinho");
  });

  it("reserves one character for the ellipsis", () => {
    expect(fit("Uma dedicatória muito maior que o limite", 12)).toHaveLength(12);
    expect(fit("Uma dedicatória muito maior que o limite", 12).endsWith("…")).toBe(true);
  });

  it("supports a one-character personalization field", () => {
    expect(fit("Uma frase longa", 1)).toBe("…");
  });
});
