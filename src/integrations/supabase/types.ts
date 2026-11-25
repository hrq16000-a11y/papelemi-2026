export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          description: string
          image: string
          name: string
          slug: string
          sort: number
          store_key: string
        }
        Insert: {
          description?: string
          image?: string
          name: string
          slug: string
          sort?: number
          store_key?: string
        }
        Update: {
          description?: string
          image?: string
          name?: string
          slug?: string
          sort?: number
          store_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          percent: number
          store_key: string
        }
        Insert: {
          active?: boolean
          code: string
          percent: number
          store_key?: string
        }
        Update: {
          active?: boolean
          code?: string
          percent?: number
          store_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupons_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      curated_phrases: {
        Row: {
          active: boolean
          created_at: string
          id: string
          occasion: string
          phrase: string
          store_key: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          occasion?: string
          phrase: string
          store_key?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          occasion?: string
          phrase?: string
          store_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "curated_phrases_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      customers: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          email: string | null
          email_normalized: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          state: string | null
          status: string
          store_key: string
          tags: string[]
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_normalized?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          state?: string | null
          status?: string
          store_key?: string
          tags?: string[]
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_normalized?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          state?: string | null
          status?: string
          store_key?: string
          tags?: string[]
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_number: number
          line_total: number
          order_id: string
          personalization: Json
          product_image: string | null
          product_name: string
          product_slug: string | null
          quantity: number
          store_key: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_number: number
          line_total: number
          order_id: string
          personalization?: Json
          product_image?: string | null
          product_name: string
          product_slug?: string | null
          quantity: number
          store_key?: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_number?: number
          line_total?: number
          order_id?: string
          personalization?: Json
          product_image?: string | null
          product_name?: string
          product_slug?: string | null
          quantity?: number
          store_key?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
          {
            foreignKeyName: "order_items_store_order_fkey"
            columns: ["store_key", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["store_key", "id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_privacy: boolean
          address: Json
          coupon_code: string | null
          created_at: string
          customer_email: string
          customer_id: string | null
          customer_name: string
          customer_notes: string
          customer_phone: string
          discount: number
          id: string
          items: Json
          mp_payment_id: string | null
          privacy_consent_at: string | null
          shipping: number
          source: string
          status: string
          store_key: string
          subtotal: number
          total: number
        }
        Insert: {
          accepted_privacy?: boolean
          address?: Json
          coupon_code?: string | null
          created_at?: string
          customer_email: string
          customer_id?: string | null
          customer_name: string
          customer_notes?: string
          customer_phone?: string
          discount?: number
          id?: string
          items?: Json
          mp_payment_id?: string | null
          privacy_consent_at?: string | null
          shipping?: number
          source?: string
          status?: string
          store_key?: string
          subtotal: number
          total: number
        }
        Update: {
          accepted_privacy?: boolean
          address?: Json
          coupon_code?: string | null
          created_at?: string
          customer_email?: string
          customer_id?: string | null
          customer_name?: string
          customer_notes?: string
          customer_phone?: string
          discount?: number
          id?: string
          items?: Json
          mp_payment_id?: string | null
          privacy_consent_at?: string | null
          shipping?: number
          source?: string
          status?: string
          store_key?: string
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_customer_fkey"
            columns: ["store_key", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["store_key", "id"]
          },
          {
            foreignKeyName: "orders_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      products: {
        Row: {
          best_seller: boolean
          category_slug: string
          colors: string[]
          description: string
          finishes: string[]
          images: string[]
          min_qty: number | null
          name: string
          personalizable: boolean
          personalization: Json
          price: number
          production_days: string
          promo_price: number | null
          published: boolean
          sizes: string[]
          slug: string
          stock: number
          store_key: string
        }
        Insert: {
          best_seller?: boolean
          category_slug: string
          colors?: string[]
          description?: string
          finishes?: string[]
          images?: string[]
          min_qty?: number | null
          name: string
          personalizable?: boolean
          personalization?: Json
          price: number
          production_days?: string
          promo_price?: number | null
          published?: boolean
          sizes?: string[]
          slug: string
          stock?: number
          store_key?: string
        }
        Update: {
          best_seller?: boolean
          category_slug?: string
          colors?: string[]
          description?: string
          finishes?: string[]
          images?: string[]
          min_qty?: number | null
          name?: string
          personalizable?: boolean
          personalization?: Json
          price?: number
          production_days?: string
          promo_price?: number | null
          published?: boolean
          sizes?: string[]
          slug?: string
          stock?: number
          store_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_store_fkey"
            columns: ["store_key", "category_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["store_key", "slug"]
          },
          {
            foreignKeyName: "products_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          is_active: boolean
          name: string
          primary_domain: string
          store_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          name: string
          primary_domain: string
          store_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          name?: string
          primary_domain?: string
          store_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          store_key: string
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          store_key?: string
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_store_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _store_key: string
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "editor" | "customer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "editor", "customer"],
    },
  },
} as const
