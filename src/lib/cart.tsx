import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CART_STORAGE_KEY, parseCartItems, type StoredCartItem } from "@/lib/cart-storage";

export type CartItem = StoredCartItem;
type Ctx = { items: CartItem[]; add: (i: Omit<CartItem, "id">) => void; setQty: (id: string, q: number) => void; remove: (id: string) => void; clear: () => void; count: number };
const CartCtx = createContext<Ctx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => {
    try { setItems(parseCartItems(localStorage.getItem(CART_STORAGE_KEY))); } catch { setItems([]); }
  }, []);
  const save = (next: CartItem[]) => { setItems(next); try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage may be unavailable */ } };
  return (
    <CartCtx.Provider value={{
      items,
      count: items.reduce((s, i) => s + i.qty, 0),
      add: (i) => {
        if (items.length >= 50) return;
        save([...items, { ...i, qty: Math.max(1, Math.min(999, Math.trunc(i.qty))), id: crypto.randomUUID() }]);
        window.__lovableEvents?.track?.("project.add_to_cart", { product_slug: i.slug, qty: i.qty, has_dedication: Object.keys(i.options).some((k) => /frase|dedicat|mensagem/i.test(k) && !!i.options[k]) });
      },
      setQty: (id, q) => save(items.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.min(999, Math.trunc(q))) } : i))),
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
