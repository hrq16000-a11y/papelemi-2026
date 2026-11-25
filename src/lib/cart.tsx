import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartItem = { id: string; slug: string; qty: number; options: Record<string, string> };
type Ctx = { items: CartItem[]; add: (i: Omit<CartItem, "id">) => void; setQty: (id: string, q: number) => void; remove: (id: string) => void; clear: () => void; count: number };
const CartCtx = createContext<Ctx | null>(null);
const KEY = "papelemi-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { /* ignore */ }
  }, []);
  const save = (next: CartItem[]) => { setItems(next); localStorage.setItem(KEY, JSON.stringify(next)); };
  return (
    <CartCtx.Provider value={{
      items,
      count: items.reduce((s, i) => s + i.qty, 0),
      add: (i) => {
        save([...items, { ...i, id: crypto.randomUUID() }]);
        window.__lovableEvents?.track?.("project.add_to_cart", { product_slug: i.slug, qty: i.qty, has_dedication: Object.keys(i.options).some((k) => /frase|dedicat|mensagem/i.test(k) && !!i.options[k]) });
      },
      setQty: (id, q) => save(items.map((i) => (i.id === id ? { ...i, qty: Math.max(1, q) } : i))),
      remove: (id) => save(items.filter((i) => i.id !== id)),
      clear: () => save([]),
    }}>{children}</CartCtx.Provider>
  );
}
export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("CartProvider ausente");
  return c;
}
