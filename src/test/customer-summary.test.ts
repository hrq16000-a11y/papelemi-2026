import { describe, expect, it } from "vitest";
import { buildCustomerSummaries, type CustomerOrderRow } from "@/lib/customer-summary";

const rows: CustomerOrderRow[] = [
  {
    customer_name: "Ana Rodrigues",
    customer_email: "ANA@example.com",
    customer_phone: "(41) 99999-1111",
    status: "shipped",
    created_at: "2026-11-20T12:00:00.000Z",
  },
  {
    customer_name: "Ana R.",
    customer_email: "ana@example.com",
    customer_phone: "",
    status: "pending",
    created_at: "2026-10-02T12:00:00.000Z",
  },
  {
    customer_name: "Bruna Lima",
    customer_email: "bruna@example.com",
    customer_phone: "(41) 98888-2222",
    status: "paid",
    created_at: "2026-11-22T12:00:00.000Z",
  },
];

describe("customer summaries", () => {
  it("groups order snapshots by normalized email and preserves the latest contact", () => {
    const result = buildCustomerSummaries(rows);
    expect(result[1]).toEqual({
      email: "ANA@example.com",
      name: "Ana Rodrigues",
      phone: "(41) 99999-1111",
      ordersCount: 2,
      firstOrderAt: "2026-10-02T12:00:00.000Z",
      lastOrderAt: "2026-11-20T12:00:00.000Z",
      lastOrderStatus: "shipped",
    });
  });

  it("orders customers by their latest order, newest first", () => {
    expect(buildCustomerSummaries(rows).map((customer) => customer.email)).toEqual([
      "bruna@example.com",
      "ANA@example.com",
    ]);
  });

  it("ignores rows without a usable email", () => {
    expect(buildCustomerSummaries([{
      customer_name: "Sem e-mail",
      customer_email: "   ",
      customer_phone: "",
      status: "pending",
      created_at: "2026-11-20T12:00:00.000Z",
    }])).toEqual([]);
  });
});
