import type { Database, Json } from "@/integrations/supabase/types";

type TableShape = {
  Row: object;
  Insert: object;
  Update: object;
  Relationships: unknown[];
};

type ExtendTable<T extends TableShape, R extends object, I extends object, U extends object> = {
  Row: T["Row"] & R;
  Insert: T["Insert"] & I;
  Update: T["Update"] & U;
  Relationships: T["Relationships"];
};

type OrderLifecycleColumns = {
  order_code: string;
  address_cep: string;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string;
  address_state: string;
  shipping_method: string;
  shipping_company: string | null;
  shipping_days: string | null;
  shipping_price: number;
  discount_amount: number;
  payment_status: "pending" | "approved" | "refunded" | "cancelled";
  payment_id: string | null;
  payment_method: string | null;
  paid_at: string | null;
  notes: string | null;
  tracking_code: string | null;
  tracking_carrier: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  updated_at: string;
};

type OrderHistoryRow = {
  id: string;
  store_key: string;
  order_id: string;
  order_code: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_by: string | null;
  created_at: string;
};

type OrderHistoryTable = {
  Row: OrderHistoryRow;
  Insert: Omit<OrderHistoryRow, "id" | "created_at"> & { id?: string; created_at?: string };
  Update: Partial<OrderHistoryRow>;
  Relationships: [{
    foreignKeyName: "order_status_history_store_order_fkey";
    columns: ["store_key", "order_id"];
    isOneToOne: false;
    referencedRelation: "orders";
    referencedColumns: ["store_key", "id"];
  }];
};

type AdminUpdateOrderArgs = {
  _actor_id: string;
  _order_id: string;
  _status: string;
  _shipping_method: string;
  _shipping_company: string | null;
  _shipping_days: string | null;
  _shipping_price: number;
  _tracking_code: string | null;
  _tracking_carrier: string | null;
  _tracking_url: string | null;
  _notes: string | null;
};

export type OrderLifecycleDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<Database["public"]["Tables"], "orders"> & {
      orders: ExtendTable<
        Database["public"]["Tables"]["orders"],
        OrderLifecycleColumns,
        Partial<OrderLifecycleColumns>,
        Partial<OrderLifecycleColumns>
      >;
      order_status_history: OrderHistoryTable;
    };
    Functions: Database["public"]["Functions"] & {
      admin_update_order: {
        Args: AdminUpdateOrderArgs;
        Returns: Json;
      };
    };
  };
};
