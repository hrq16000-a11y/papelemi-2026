import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { listOrders, getOrderDetails, setOrderStatus } from "@/lib/shop.functions";
import {
  Package, Search, Filter, Eye, Truck, Clock, CheckCircle, XCircle, AlertCircle,
  Mail, Phone, MapPin, Calendar, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  { value: 'paid', label: 'Pago', color: 'bg-emerald-500', icon: CheckCircle },
  { value: 'confirmed', label: 'Confirmado', color: 'bg-blue-500', icon: CheckCircle },
  { value: 'processing', label: 'Em produção', color: 'bg-purple-500', icon: Package },
  { value: 'shipped', label: 'Enviado', color: 'bg-indigo-500', icon: Truck },
  { value: 'delivered', label: 'Entregue', color: 'bg-green-500', icon: CheckCircle },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-red-500', icon: XCircle },
];

const getStatusInfo = (status: string) => {
  return statusOptions.find(s => s.value === status) || statusOptions[0];
};

export default function EmporioOrdersPanel() {
  type OrderStatus = "pending" | "paid" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
  type OrderHistory = { id: string; from_status: string | null; to_status: string; note: string | null; changed_by: string | null; created_at: string };
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([]);
  const [trackingDialog, setTrackingDialog] = useState<{ order: Order; code: string; carrier: string; url: string } | null>(null);

  const loadOrders = useCallback(async () => {
    setRefreshing(true);
    try {
      const rows = await listOrders();
      setOrders(rows as Order[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os pedidos.");
      setOrders([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const handleViewOrder = useCallback(async (order: Order) => {
    setSelectedOrder(order);
    setOrderItems([]);
    setOrderHistory([]);
    try {
      const detail = await getOrderDetails({ data: { id: order.id } });
      setSelectedOrder(detail.order as Order);
      setOrderItems(detail.items as OrderItem[]);
      setOrderHistory((detail.history ?? []) as OrderHistory[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os detalhes do pedido.");
      setSelectedOrder(null);
    }
  }, []);

  useEffect(() => {
    if (!orders || typeof window === "undefined") return;
    const orderCode = new URLSearchParams(window.location.search).get("order");
    if (!orderCode || selectedOrder?.order_code === orderCode) return;
    const match = orders.find((order) => order.order_code === orderCode);
    if (match) void handleViewOrder(match);
  }, [orders, selectedOrder, handleViewOrder]);

  const handleCloseOrder = () => {
    setSelectedOrder(null);
    setOrderItems([]);
    setOrderHistory([]);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("order");
      window.history.replaceState(window.history.state, "", url);
    }
  };

  const updateOrderStatus = async ({
    orderId,
    newStatus,
    tracking,
  }: {
    orderId: string;
    newStatus: string;
    tracking?: { code: string; carrier?: string; url?: string };
  }) => {
    setUpdatingOrderId(orderId);
    try {
      await setOrderStatus({
        data: {
          id: orderId,
          status: newStatus as OrderStatus,
          ...(tracking?.code ? { trackingCode: tracking.code } : {}),
          ...(tracking?.carrier ? { trackingCarrier: tracking.carrier } : {}),
          ...(tracking?.url ? { trackingUrl: tracking.url } : {}),
        },
      });
      toast.success(newStatus === "shipped" ? "Rastreio salvo e pedido marcado como enviado." : "Status do pedido atualizado.");
      setTrackingDialog(null);
      await loadOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((current) => current ? {
          ...current,
          status: newStatus,
          ...(tracking ? {
            tracking_code: tracking.code,
            tracking_carrier: tracking.carrier ?? null,
            tracking_url: tracking.url ?? null,
            shipped_at: newStatus === "shipped" ? new Date().toISOString() : current.shipped_at,
          } : {}),
        } : current);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o pedido.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleStatusChange = (orderId: string, newStatus: string) => {
    if (newStatus === "shipped") {
      const order = orders?.find((item) => item.id === orderId);
      if (order) {
        setTrackingDialog({
          order,
          code: order.tracking_code || "",
          carrier: order.tracking_carrier || order.shipping_company || "",
          url: order.tracking_url || "",
        });
        return;
      }
    }
    void updateOrderStatus({ orderId, newStatus });
  };

  const filteredOrders = orders?.filter(order => {
    const matchesSearch =
      order.order_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && (statusFilter === "all" || order.status === statusFilter);
  }).slice().sort((a, b) => {
    switch (sortBy) {
      case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'value_desc': return Number(b.total) - Number(a.total);
      case 'value_asc': return Number(a.total) - Number(b.total);
      case 'customer_az': return a.customer_name.localeCompare(b.customer_name, 'pt-BR');
      case 'status': return (a.status || '').localeCompare(b.status || '');
      case 'recent':
      default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (value: number | string | null | undefined) => {
    return `R$ ${Number(value ?? 0).toFixed(2).replace(".", ",")}`;
  };
  const formatPersonalization = (value: unknown) => {
    if (value == null || value === "") return "";
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display text-foreground flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            Pedidos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os pedidos da loja
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadOrders()} disabled={refreshing} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statusOptions.slice(0, 4).map(status => {
          const count = orders?.filter(o => o.status === status.value).length || 0;
          const StatusIcon = status.icon;
          return (
            <div 
              key={status.value}
              className="bg-card rounded-xl border border-border p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setStatusFilter(status.value)}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${status.color}/10`}>
                  <StatusIcon className={`h-5 w-5 ${status.color.replace('bg-', 'text-')}`} />
                </div>
                <span className="text-2xl font-bold text-foreground">{count}</span>
              </div>
              <p className="text-sm text-muted-foreground">{status.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {statusOptions.map(status => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full md:w-52">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recente</SelectItem>
            <SelectItem value="oldest">Mais antigo</SelectItem>
            <SelectItem value="value_desc">Maior valor</SelectItem>
            <SelectItem value="value_asc">Menor valor</SelectItem>
            <SelectItem value="customer_az">Cliente (A-Z)</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredOrders && filteredOrders.length > 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left p-4 font-medium text-foreground">Pedido</th>
                  <th className="text-left p-4 font-medium text-foreground">Cliente</th>
                  <th className="text-left p-4 font-medium text-foreground">Total</th>
                  <th className="text-left p-4 font-medium text-foreground">Status</th>
                  <th className="text-left p-4 font-medium text-foreground">Data</th>
                  <th className="text-right p-4 font-medium text-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const statusInfo = getStatusInfo(order.status);
                  return (
                    <tr key={order.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="p-4">
                        <span className="font-mono font-bold text-primary">{order.order_code}</span>
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-foreground">{order.customer_name}</p>
                        <p className="text-sm text-muted-foreground">{order.customer_email}</p>
                      </td>
                      <td className="p-4">
                        <span className="font-semibold text-foreground">{formatCurrency(order.total)}</span>
                      </td>
                      <td className="p-4">
                        <Select 
                          value={order.status} 
                          onValueChange={(value) => handleStatusChange(order.id, value)}
                        >
                          <SelectTrigger className="w-40 h-8">
                            <Badge className={`${statusInfo.color} text-white text-xs`}>
                              {statusInfo.label}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map(status => (
                              <SelectItem key={status.value} value={status.value}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${status.color}`} />
                                  {status.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-muted-foreground">{formatDate(order.created_at)}</span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewOrder(order)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum pedido encontrado</h3>
          <p className="text-muted-foreground">Os pedidos aparecerão aqui quando forem realizados.</p>
        </div>
      )}

      {/* Order Details Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={(o) => { if (!o) handleCloseOrder(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Package className="h-6 w-6 text-primary" />
              Pedido #{selectedOrder?.order_code}
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Status */}
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge className={`${getStatusInfo(selectedOrder.status).color} text-white`}>
                  {getStatusInfo(selectedOrder.status).label}
                </Badge>
                <span className="text-sm text-muted-foreground ml-auto">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  {formatDate(selectedOrder.created_at)}
                </span>
              </div>

              {/* Customer Info */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold text-foreground mb-3">Dados do Cliente</h4>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Nome:</span>
                    <span className="text-foreground font-medium">{selectedOrder.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${selectedOrder.customer_email}`} className="text-primary hover:underline">
                      {selectedOrder.customer_email}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${selectedOrder.customer_phone}`} className="text-primary hover:underline">
                      {selectedOrder.customer_phone}
                    </a>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Endereço de Entrega
                </h4>
                <p className="text-sm text-foreground">
                  {selectedOrder.address_street}, {selectedOrder.address_number}
                  {selectedOrder.address_complement && ` - ${selectedOrder.address_complement}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedOrder.address_neighborhood && `${selectedOrder.address_neighborhood} - `}
                  {selectedOrder.address_city} - {selectedOrder.address_state}
                </p>
                <p className="text-sm text-muted-foreground">CEP: {selectedOrder.address_cep}</p>
              </div>

              {/* Shipping */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Frete
                </h4>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {selectedOrder.shipping_method} - {selectedOrder.shipping_company}
                  </span>
                  <span className="text-muted-foreground">{selectedOrder.shipping_days}</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(selectedOrder.shipping_price)}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="font-semibold text-foreground mb-3">Produtos</h4>
                <div className="space-y-3">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex gap-4 p-3 bg-muted/50 rounded-lg">
                      {item.product_image && (
                        <img 
                          src={item.product_image} 
                          alt={item.product_name}
                          className="w-16 h-16 object-contain rounded-lg bg-muted p-1"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{item.product_name}</p>
                        {item.personalization && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Personalização: {formatPersonalization(item.personalization)}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2 text-sm">
                          <span className="text-muted-foreground">
                            {item.quantity}x {formatCurrency(item.unit_price)}
                          </span>
                          <span className="font-semibold text-foreground">
                            {formatCurrency(item.quantity * item.unit_price)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-border pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frete</span>
                  <span className="text-foreground">{formatCurrency(selectedOrder.shipping_price)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>

              {orderHistory.length > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <h4 className="font-semibold text-foreground mb-3">Histórico do pedido</h4>
                  <ol className="space-y-3">
                    {orderHistory.map((entry) => (
                      <li key={entry.id} className="flex gap-3 text-sm">
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{getStatusInfo(entry.to_status).label}</p>
                          {entry.note && <p className="text-muted-foreground">{entry.note}</p>}
                          <p className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-border">
                <a
                  href={`https://wa.me/55${selectedOrder.customer_phone.replace(/\D/g, '')}?text=Olá ${selectedOrder.customer_name}! Sobre seu pedido ${selectedOrder.order_code}...`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button className="w-full bg-green-500 hover:bg-green-600">
                    <Phone className="h-4 w-4 mr-2" />
                    WhatsApp
                  </Button>
                </a>
                <a href={`mailto:${selectedOrder.customer_email}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Tracking Code Dialog (when marking as shipped) */}
      <Dialog open={!!trackingDialog} onOpenChange={(o) => !o && setTrackingDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Marcar como Enviado
            </DialogTitle>
          </DialogHeader>
          {trackingDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pedido <span className="font-mono font-semibold text-foreground">{trackingDialog.order.order_code}</span>.
                Informe o código de rastreio para registrar o envio no histórico da encomenda.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">Código de rastreio *</label>
                <Input
                  autoFocus
                  value={trackingDialog.code}
                  onChange={(e) => setTrackingDialog({ ...trackingDialog, code: e.target.value.toUpperCase().trim() })}
                  placeholder="Ex: BR123456789BR"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Transportadora</label>
                <Input
                  value={trackingDialog.carrier}
                  onChange={(e) => setTrackingDialog({ ...trackingDialog, carrier: e.target.value })}
                  placeholder="Ex: Correios, Jadlog, Loggi"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">URL de rastreio (opcional)</label>
                <Input
                  value={trackingDialog.url}
                  onChange={(e) => setTrackingDialog({ ...trackingDialog, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setTrackingDialog(null)}>
                  Cancelar
                </Button>
                <Button
                  disabled={!trackingDialog.code || trackingDialog.code.length < 4 || updatingOrderId === trackingDialog.order.id}
                  onClick={() => void updateOrderStatus({
                    orderId: trackingDialog.order.id,
                    newStatus: "shipped",
                    tracking: {
                      code: trackingDialog.code,
                      carrier: trackingDialog.carrier || undefined,
                      url: trackingDialog.url || undefined,
                    },
                  })}
                >
                  {updatingOrderId === trackingDialog.order.id ? "Salvando..." : "Salvar rastreio"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

