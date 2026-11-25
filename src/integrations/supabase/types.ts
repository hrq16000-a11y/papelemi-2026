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
          height_cm: number | null
          images: string[]
          length_cm: number | null
          min_qty: number | null
          name: string
          personalizable: boolean
          personalization: Json
          price: number
          production_days: string
          promo_price: number | null
          published: boolean
          requires_shipping: boolean
          sizes: string[]
          slug: string
          stock: number
          store_key: string
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          best_seller?: boolean
          category_slug: string
          colors?: string[]
          description?: string
          finishes?: string[]
          height_cm?: number | null
          images?: string[]
          length_cm?: number | null
          min_qty?: number | null
          name: string
          personalizable?: boolean
          personalization?: Json
          price: number
          production_days?: string
          promo_price?: number | null
          published?: boolean
          requires_shipping?: boolean
          sizes?: string[]
          slug: string
          stock?: number
          store_key?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          best_seller?: boolean
          category_slug?: string
          colors?: string[]
          description?: string
          finishes?: string[]
          height_cm?: number | null
          images?: string[]
          length_cm?: number | null
          min_qty?: number | null
          name?: string
          personalizable?: boolean
          personalization?: Json
          price?: number
          production_days?: string
          promo_price?: number | null
          published?: boolean
          requires_shipping?: boolean
          sizes?: string[]
          slug?: string
          stock?: number
          store_key?: string
          weight_kg?: number | null
          width_cm?: number | null
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
      shipping_audit_logs: {
        Row: {
          cart_snapshot: Json | null
          created_at: string
          destination_zip: string | null
          error_message: string | null
          estimated: boolean | null
          event_type: string
          http_status: number | null
          id: string
          melhor_envio_has_key: boolean | null
          provider_name: string | null
          store_key: string
          total_weight_kg: number | null
        }
        Insert: {
          cart_snapshot?: Json | null
          created_at?: string
          destination_zip?: string | null
          error_message?: string | null
          estimated?: boolean | null
          event_type?: string
          http_status?: number | null
          id?: string
          melhor_envio_has_key?: boolean | null
          provider_name?: string | null
          store_key?: string
          total_weight_kg?: number | null
        }
        Update: {
          cart_snapshot?: Json | null
          created_at?: string
          destination_zip?: string | null
          error_message?: string | null
          estimated?: boolean | null
          event_type?: string
          http_status?: number | null
          id?: string
          melhor_envio_has_key?: boolean | null
          provider_name?: string | null
          store_key?: string
          total_weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_audit_logs_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      shipping_providers: {
        Row: {
          api_key: string | null
          api_secret: string | null
          config_json: Json
          created_at: string
          endpoint_url: string | null
          id: string
          is_active: boolean
          provider_code: string
          provider_name: string
          store_key: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          config_json?: Json
          created_at?: string
          endpoint_url?: string | null
          id?: string
          is_active?: boolean
          provider_code: string
          provider_name: string
          store_key?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          config_json?: Json
          created_at?: string
          endpoint_url?: string | null
          id?: string
          is_active?: boolean
          provider_code?: string
          provider_name?: string
          store_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_providers_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      shipping_quote_cache: {
        Row: {
          cache_key: string
          created_at: string
          options: Json
          store_key: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          options: Json
          store_key?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          options?: Json
          store_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_quote_cache_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      shipping_quote_rate_limits: {
        Row: {
          ip_hash: string
          request_count: number
          store_key: string
          window_start: string
        }
        Insert: {
          ip_hash: string
          request_count?: number
          store_key?: string
          window_start: string
        }
        Update: {
          ip_hash?: string
          request_count?: number
          store_key?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_quote_rate_limits_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      shipping_rules: {
        Row: {
          condition_type: Database["public"]["Enums"]["shipping_condition_type"]
          condition_value: Json
          created_at: string
          discount_type: Database["public"]["Enums"]["shipping_discount_type"]
          discount_value: number
          id: string
          is_active: boolean
          priority: number
          rule_name: string
          store_key: string
          updated_at: string
        }
        Insert: {
          condition_type: Database["public"]["Enums"]["shipping_condition_type"]
          condition_value?: Json
          created_at?: string
          discount_type: Database["public"]["Enums"]["shipping_discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          priority?: number
          rule_name: string
          store_key?: string
          updated_at?: string
        }
        Update: {
          condition_type?: Database["public"]["Enums"]["shipping_condition_type"]
          condition_value?: Json
          created_at?: string
          discount_type?: Database["public"]["Enums"]["shipping_discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          priority?: number
          rule_name?: string
          store_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rules_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_key"]
          },
        ]
      }
      shipping_settings: {
        Row: {
          created_at: string
          default_box_height_cm: number
          default_box_length_cm: number
          default_box_weight_kg: number
          default_box_width_cm: number
          free_shipping_enabled: boolean
          free_shipping_threshold: number
          handling_fee: number
          id: string
          is_enabled: boolean
          origin_zip_code: string
          pickup_address: string
          pickup_enabled: boolean
          pickup_instructions: string
          pickup_label: string
          shipping_markup_percentage: number
          singleton: boolean
          store_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_box_height_cm?: number
          default_box_length_cm?: number
          default_box_weight_kg?: number
          default_box_width_cm?: number
          free_shipping_enabled?: boolean
          free_shipping_threshold?: number
          handling_fee?: number
          id?: string
          is_enabled?: boolean
          origin_zip_code?: string
          pickup_address?: string
          pickup_enabled?: boolean
          pickup_instructions?: string
          pickup_label?: string
          shipping_markup_percentage?: number
          singleton?: boolean
          store_key?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_box_height_cm?: number
          default_box_length_cm?: number
          default_box_weight_kg?: number
          default_box_width_cm?: number
          free_shipping_enabled?: boolean
          free_shipping_threshold?: number
          handling_fee?: number
          id?: string
          is_enabled?: boolean
          origin_zip_code?: string
          pickup_address?: string
          pickup_enabled?: boolean
          pickup_instructions?: string
          pickup_label?: string
          shipping_markup_percentage?: number
          singleton?: boolean
          store_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_settings_store_key_fkey"
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
      consume_shipping_quote_rate_limit: {
        Args: { _ip_hash: string; _limit?: number; _window_start: string }
        Returns: number
      }
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
      shipping_condition_type:
        | "min_cart_value"
        | "specific_state"
        | "zip_code_range"
      shipping_discount_type:
        | "free_shipping"
        | "fixed_discount"
        | "percentage_discount"
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
      shipping_condition_type: [
        "min_cart_value",
        "specific_state",
        "zip_code_range",
      ],
      shipping_discount_type: [
        "free_shipping",
        "fixed_discount",
        "percentage_discount",
      ],
    },
  },
} as const
