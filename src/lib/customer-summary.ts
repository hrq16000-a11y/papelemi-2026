export type CustomerOrderRow = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  status: string;
  created_at: string;
};

export type CustomerSummary = {
  email: string;
  name: string;
  phone: string;
  ordersCount: number;
  firstOrderAt: string;
  lastOrderAt: string;
  lastOrderStatus: string;
};

export function buildCustomerSummaries(rows: readonly CustomerOrderRow[]): CustomerSummary[] {
  const customers = new Map<string, CustomerSummary>();

  for (const row of rows) {
    const email = row.customer_email.trim();
    const key = email.toLocaleLowerCase("pt-BR");
    if (!key) continue;

    const name = row.customer_name.trim();
    const phone = row.customer_phone.trim();
    const existing = customers.get(key);

    if (!existing) {
      customers.set(key, {
        email,
        name,
        phone,
        ordersCount: 1,
        firstOrderAt: row.created_at,
        lastOrderAt: row.created_at,
        lastOrderStatus: row.status,
      });
      continue;
    }

    existing.ordersCount += 1;
    if (row.created_at && (!existing.firstOrderAt || row.created_at < existing.firstOrderAt)) {
      existing.firstOrderAt = row.created_at;
    }
    if (row.created_at > existing.lastOrderAt) {
      existing.email = email;
      existing.name = name || existing.name;
      existing.phone = phone || existing.phone;
      existing.lastOrderAt = row.created_at;
      existing.lastOrderStatus = row.status;
    } else {
      if (!existing.name && name) existing.name = name;
      if (!existing.phone && phone) existing.phone = phone;
    }
  }

  return [...customers.values()].sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
}
