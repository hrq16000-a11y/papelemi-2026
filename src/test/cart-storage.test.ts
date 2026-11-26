import { describe, expect, it } from "vitest";
import { parseCartItems } from "@/lib/cart-storage";

describe("cart storage", () => {
  it("restores saved personalization and dedication values", () => {
    const raw = JSON.stringify([{
      id: "cart-line-1",
      slug: "caderneta-saude-ursinho-clean",
      qty: 2,
      options: {
        Cor: "",
        Nome: "Lia",
        "Mensagem ou dedicatória": "Que sua vida seja cheia de luz.",
        "Observações para a encomenda": "Embalagem para presente",
      },
    }]);
    expect(parseCartItems(raw)).toEqual([{
      id: "cart-line-1",
      slug: "caderneta-saude-ursinho-clean",
      qty: 2,
      options: {
        Cor: "",
        Nome: "Lia",
        "Mensagem ou dedicatória": "Que sua vida seja cheia de luz.",
        "Observações para a encomenda": "Embalagem para presente",
      },
    }]);
  });

  it("returns an empty cart for malformed storage instead of crashing", () => {
    expect(parseCartItems("{not-json")).toEqual([]);
    expect(parseCartItems(JSON.stringify([{ id: "bad", qty: 0 }]))).toEqual([]);
  });

  it("rejects quantities above the checkout limit", () => {
    expect(parseCartItems(JSON.stringify([{ id: "cart-line-1", slug: "produto", qty: 1000, options: {} }]))).toEqual([]);
  });
  it("ignores malformed lines without discarding valid cart items", () => {
    expect(parseCartItems(JSON.stringify([
      { id: "valid", slug: "p", qty: 1, options: { Nome: "Lia" } },
      { id: "invalid", slug: "p", qty: 1000, options: {} },
    ]))).toEqual([{ id: "valid", slug: "p", qty: 1, options: { Nome: "Lia" } }]);
  });

  it("rejects oversized option maps and caps restored cart lines", () => {
    const oversized = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`campo-${i}`, "x"]));
    expect(parseCartItems(JSON.stringify([{ id: "bad", slug: "p", qty: 1, options: oversized }]))).toEqual([]);
    const many = Array.from({ length: 55 }, (_, i) => ({ id: String(i), slug: "p", qty: 1, options: {} }));
    expect(parseCartItems(JSON.stringify(many))).toHaveLength(50);
  });

});
