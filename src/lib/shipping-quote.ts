import type { Json } from "@/integrations/supabase/types";

export type ShippingOptionDraft = {
  provider: string;
  service_name: string;
  price: number;
  estimated_delivery_days: string;
  estimated: boolean;
  requiresConfirmation: boolean;
  pickupAddress?: string;
  pickupInstructions?: string;
};

export type ShippingRuleLike = {
  condition_type: "min_cart_value" | "specific_state" | "zip_code_range";
  condition_value: Json;
  discount_type: "free_shipping" | "fixed_discount" | "percentage_discount";
  discount_value: number;
};

export type ShippingCartItem = {
  quantity: number;
  weight_kg?: number | null;
  unit_price?: number | null;
  requires_shipping?: boolean | null;
};

export function roundShippingMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function packShippingCart(items: ShippingCartItem[], defaultItemWeight: number) {
  const shippable = items.filter((item) => item.requires_shipping !== false);
  const totalWeight = roundShippingMoney(shippable.reduce(
    (sum, item) => sum + (item.weight_kg != null ? Number(item.weight_kg) : defaultItemWeight) * item.quantity,
    0,
  ));
  const subtotal = roundShippingMoney(shippable.reduce(
    (sum, item) => sum + Number(item.unit_price ?? 0) * item.quantity,
    0,
  ));
  return { shippable, totalWeight, subtotal };
}

export function quoteCorreiosEstimate(input: { totalWeight: number; destinationZip: string; originZip: string }): ShippingOptionDraft[] {
  const weight = Math.max(0.1, input.totalWeight);
  const destinationPrefix = Number(input.destinationZip.slice(0, 2));
  const originPrefix = Number(input.originZip.slice(0, 2));
  const difference = Math.abs(destinationPrefix - originPrefix);
  const zoneFactor = difference <= 3 ? 0.85 : difference <= 15 ? 1 : difference <= 35 ? 1.25 : 1.5;
  const pac = Math.min(60, Math.max(15, roundShippingMoney((18 + weight * 6) * zoneFactor)));
  const sedex = Math.min(95, roundShippingMoney(pac * 1.6));
  return [
    { provider: "Correios", service_name: "PAC (estimativa)", price: pac, estimated_delivery_days: "5–9 dias úteis", estimated: true, requiresConfirmation: true },
    { provider: "Correios", service_name: "SEDEX (estimativa)", price: sedex, estimated_delivery_days: "2–4 dias úteis", estimated: true, requiresConfirmation: true },
  ];
}

function matchesShippingRule(rule: ShippingRuleLike, context: { subtotal: number; state?: string; destinationZip: string }): boolean {
  const value = rule.condition_value && typeof rule.condition_value === "object" && !Array.isArray(rule.condition_value)
    ? rule.condition_value as Record<string, Json>
    : {};
  if (rule.condition_type === "min_cart_value") return context.subtotal >= Number(value["value"] ?? 0);
  if (rule.condition_type === "specific_state") {
    const states = Array.isArray(value["states"]) ? value["states"].map(String) : value["state"] ? [String(value["state"])] : [];
    return Boolean(context.state) && states.map((state) => state.toUpperCase()).includes(context.state!.toUpperCase());
  }
  if (rule.condition_type === "zip_code_range") {
    const from = String(value["from"] ?? "").replace(/\D/g, "");
    const to = String(value["to"] ?? "").replace(/\D/g, "");
    return from.length === 8 && to.length === 8 && context.destinationZip >= from && context.destinationZip <= to;
  }
  return false;
}

export function applyShippingRules(
  options: ShippingOptionDraft[],
  context: { subtotal: number; state?: string; destinationZip: string },
  rules: ShippingRuleLike[],
): ShippingOptionDraft[] {
  let result = [...options].sort((a, b) => a.price - b.price);
  for (const rule of rules) {
    if (!matchesShippingRule(rule, context)) continue;
    if (rule.discount_type === "free_shipping") {
      if (result[0]) result[0] = { ...result[0], price: 0, service_name: `${result[0].service_name} · Frete grátis` };
    } else if (rule.discount_type === "fixed_discount") {
      result = result.map((option) => ({ ...option, price: Math.max(0, roundShippingMoney(option.price - Number(rule.discount_value))) }));
    } else if (rule.discount_type === "percentage_discount") {
      const percentage = Math.min(100, Math.max(0, Number(rule.discount_value)));
      result = result.map((option) => ({ ...option, price: roundShippingMoney(option.price * (1 - percentage / 100)) }));
    }
    result.sort((a, b) => a.price - b.price);
  }
  return result;
}

export function isAllowedShippingProviderEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "melhorenvio.com.br" || url.hostname.endsWith(".melhorenvio.com.br"));
  } catch { return false; }
}

export function manualShippingOption(): ShippingOptionDraft {
  return {
    provider: "PapeLemi",
    service_name: "Frete a combinar",
    price: 0,
    estimated_delivery_days: "A confirmar",
    estimated: false,
    requiresConfirmation: true,
  };
}

