import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type CartItem = { id: string; slug: string; qty: number; options: Record<string, string> };
type Ctx = {
  items: CartItem[];
  add: (i: Omit<CartItem, "id">) => void;
  setQty: (id: string, q: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  count: number;
};
const CartCtx = createContext<Ctx | null>(null);
const KEY = "papelemi-cart";

function restoreCart(): CartItem[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];

    return stored.flatMap((value): CartItem[] => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      if (
        typeof item.id !== "string" ||
        typeof item.slug !== "string" ||
        !Number.isInteger(item.qty) ||
        Number(item.qty) < 1 ||
        Number(item.qty) > 999 ||
        !item.options ||
        typeof item.options !== "object" ||
        Array.isArray(item.options)
      ) return [];

      const entries = Object.entries(item.options as Record<string, unknown>);
      if (entries.some(([, option]) => typeof option !== "string")) return [];
      return [{
        id: item.id,
        slug: item.slug,
        qty: Number(item.qty),
        options: Object.fromEntries(entries) as Record<string, string>,
      }];
    });
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const itemsRef = useRef<CartItem[]>([]);

  useEffect(() => {
    const restored = restoreCart();
    itemsRef.current = restored;
    setItems(restored);
  }, []);

  const save = (next: CartItem[]) => {
    itemsRef.current = next;
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (error) {
      console.error("Não foi possível persistir o carrinho PapeLemi:", error);
    }
  };

  return (
    <CartCtx.Provider value={{
      items,
      count: items.reduce((sum, item) => sum + item.qty, 0),
      add: (item) => {
        const next = [...itemsRef.current, { ...item, id: crypto.randomUUID() }];
        save(next);
        window.__lovableEvents?.track?.("project.add_to_cart", {
          product_slug: item.slug,
          qty: item.qty,
          has_dedication: Object.keys(item.options).some((key) => /frase|dedicat|mensagem/i.test(key) && !!item.options[key]),
        });
      },
      setQty: (id, quantity) => save(itemsRef.current.map((item) => (
        item.id === id ? { ...item, qty: Math.max(1, Math.min(999, quantity)) } : item
      ))),
      remove: (id) => save(itemsRef.current.filter((item) => item.id !== id)),
      clear: () => save([]),
    }}>{children}</CartCtx.Provider>
  );
}

export function useCart() {
  const context = useContext(CartCtx);
  if (!context) throw new Error("CartProvider ausente");
  return context;
}
