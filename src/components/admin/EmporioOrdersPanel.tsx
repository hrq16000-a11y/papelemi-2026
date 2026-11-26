import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listOrders,
  getOrderDetails,
  setOrderStatus,
} from "@/lib/shop.functions";
import {
  Package, Search, Filter, Eye, Truck, Clock, CheckCircle, XCircle, AlertCircle,
  Mail, Phone, MapPin, Calendar, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Order {
  id: string;
  order_code: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address_cep: string;
  address_street: string;
  address_number: string;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string;
  address_state: string;
  shipping_method: string;
  shipping_company: string | null;
  shipping_days: string | null;
  shipping_price: number;
  subtotal: number;
  total: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tracking_code?: string | null;
  tracking_carrier?: string | null;
  tracking_url?: string | null;
  shipped_at?: string | null;
  payment_status?: string | null;
}

interface OrderItem {
  id: string;
  product_name: string;
  product_slug: string | null;
  product_image: string | null;
  quantity: number;
  unit_price: number;
  personalization: string | null;
}

const statusOptions = [
  { value: 'pending', label: 'Pendente', color: 'bg-yellow-500', icon: Clock },
  { value: 'confirmed', label: 'Confirmado', color: 'bg-blue-500', icon: CheckCircle },
  { value: 'processing', label: 'Em produção', color: 'bg-purple-500', icon: Package },
  { value: 'shipped', label: 'Enviado', color: 'bg-indigo-500', icon: Truck },
  { value: 'delivered', label: 'Entregue', color: 'bg-green-500', icon: CheckCircle },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-red-500', icon: XCircle },
];

const getStatusInfo = (status: string) => {
  return statusOptions.find(s => s.value === status) || statusOptions[0];
}
