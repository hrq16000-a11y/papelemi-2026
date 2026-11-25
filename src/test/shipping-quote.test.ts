import { describe, expect, it } from "vitest";
import { applyShippingRules, isAllowedShippingProviderEndpoint, manualShippingOption, packShippingCart, quoteCorreiosEstimate } from "@/lib/shipping-quote";

describe("shipping quote helpers", () => {
  it("soma peso e subtotal apenas dos itens que exigem envio", () => {
    const result = packShippingCart([
      { quantity: 2, weight_kg: 0.25, unit_price: 40, requires_shipping: true },
      { quantity: 1, unit_price: 20, requires_shipping: false },
      { quantity: 1, unit_price: 10, requires_shipping: true },
    ], 0.15);
    expect(result.totalWeight).toBe(0.65);
    expect(result.subtotal).toBe(90);
    expect(result.shippable).toHaveLength(2);
  });

  it("usa peso padrão quando o produto não informa peso", () => {
    const result = packShippingCart([{ quantity: 3, unit_price: 12 }], 0.2);
    expect(result.totalWeight).toBe(0.6);
    expect(result.subtotal).toBe(36);
  });

  it("marca PAC e SEDEX como estimativas que exigem confirmação", () => {
    const options = quoteCorreiosEstimate({ totalWeight: 0.8, destinationZip: "80000000", originZip: "80010000" });
    expect(options).toHaveLength(2);
    expect(options.every((option) => option.estimated && option.requiresConfirmation)).toBe(true);
    expect(options[0].service_name).toContain("PAC");
    expect(options[1].service_name).toContain("SEDEX");
  });

  it("aplica frete grátis somente à opção mais barata elegível", () => {
    const options = [
      { provider: "Correios", service_name: "PAC", price: 30, estimated_delivery_days: "5–9", estimated: true, requiresConfirmation: true },
      { provider: "Correios", service_name: "SEDEX", price: 50, estimated_delivery_days: "2–4", estimated: true, requiresConfirmation: true },
    ];
    const result = applyShippingRules(options, { subtotal: 350, destinationZip: "80000000" }, [
      { condition_type: "min_cart_value", condition_value: { value: 300 }, discount_type: "free_shipping", discount_value: 0 },
    ]);
    expect(result[0].price).toBe(0);
    expect(result[0].service_name).toContain("Frete grátis");
    expect(result[1].price).toBe(50);
  });

  it("aplica desconto fixo e percentual sem permitir frete negativo", () => {
    const options = [{ provider: "Correios", service_name: "PAC", price: 20, estimated_delivery_days: "5–9", estimated: true, requiresConfirmation: true }];
    const result = applyShippingRules(options, { subtotal: 100, destinationZip: "80000000" }, [
      { condition_type: "min_cart_value", condition_value: { value: 50 }, discount_type: "fixed_discount", discount_value: 8 },
      { condition_type: "min_cart_value", condition_value: { value: 50 }, discount_type: "percentage_discount", discount_value: 50 },
    ]);
    expect(result[0].price).toBe(6);
  });

  it("aceita apenas endpoints HTTPS oficiais do Melhor Envio", () => {
    expect(isAllowedShippingProviderEndpoint("https://melhorenvio.com.br/api/v2/me/shipment/calculate")).toBe(true);
    expect(isAllowedShippingProviderEndpoint("https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate")).toBe(true);
    expect(isAllowedShippingProviderEndpoint("http://melhorenvio.com.br/api/v2/me/shipment/calculate")).toBe(false);
    expect(isAllowedShippingProviderEndpoint("https://melhorenvio.com.br.attacker.example/quote")).toBe(false);
  });

  it("aplica regras condicionais por UF e faixa de CEP", () => {
    const options = [{ provider: "Correios", service_name: "PAC", price: 25, estimated_delivery_days: "5–9", estimated: true, requiresConfirmation: true }];
    const stateResult = applyShippingRules(options, { subtotal: 80, state: "PR", destinationZip: "80000000" }, [
      { condition_type: "specific_state", condition_value: { states: ["PR", "SC"] }, discount_type: "fixed_discount", discount_value: 5 },
    ]);
    const zipResult = applyShippingRules(options, { subtotal: 80, state: "PR", destinationZip: "80000000" }, [
      { condition_type: "zip_code_range", condition_value: { from: "79000000", to: "89999999" }, discount_type: "percentage_discount", discount_value: 20 },
    ]);
    expect(stateResult[0].price).toBe(20);
    expect(zipResult[0].price).toBe(20);
  });

  it("fornece opção segura de frete a combinar quando a loja ainda não configurou o serviço", () => {
    const option = manualShippingOption();
    expect(option.price).toBe(0);
    expect(option.requiresConfirmation).toBe(true);
    expect(option.service_name).toBe("Frete a combinar");
  });
});
