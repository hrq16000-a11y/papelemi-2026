import type { Database } from "@/integrations/supabase/types";

type TableShape = {
  Row: object;
  Insert: object;
  Update: object;
  Relationships: unknown[];
};

type ExtendTable<
  T extends TableShape,
  RowExtra extends object,
  InsertExtra extends object,
  UpdateExtra extends object,
> = {
  Row: T["Row"] & RowExtra;
  Insert: T["Insert"] & InsertExtra;
  Update: T["Update"] & UpdateExtra;
  Relationships: T["Relationships"];
};

type ProductTable = Database["public"]["Tables"]["products"];
type CategoryTable = Database["public"]["Tables"]["categories"];

export type CatalogLifecycleDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Omit<Database["public"]["Tables"], "products" | "categories"> & {
      products: ExtendTable<
        ProductTable,
        { archived_at: string | null },
        { archived_at?: string | null },
        { archived_at?: string | null }
      >;
      categories: ExtendTable<
        CategoryTable,
        { active: boolean; archived_at: string | null },
        { active?: boolean; archived_at?: string | null },
        { active?: boolean; archived_at?: string | null }
      >;
    };
  };
};
