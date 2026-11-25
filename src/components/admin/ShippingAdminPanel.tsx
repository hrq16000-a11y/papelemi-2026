import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2, Truck, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteShippingRule,
  listShippingAuditLogs,
  listShippingProviders,
  listShippingRules,
  listShippingSettings,
  saveShippingRule,
  updateShippingProvider,
  updateShippingSettings,
} from "@/lib/shop.functions";

type Settings = NonNullable<Awaited<ReturnType<typeof listShippingSettings>>>;
type Provider = Awaited<ReturnType<typeof listShippingProviders>>[number];
type Rule = Awaited<ReturnType<typeof listShippingRules>>[number];
type AuditLog = Awaited<ReturnType<typeof listShippingAuditLogs>>[number];
type RuleDraft = {
  id?: string;
  rule_name: string;
  condition_type: "min_cart_value" | "specific_state" | "zip_code_range";
  value: string;
  states: string;
  from: string;
  to: string;
  discount_type: "free_shipping" | "fixed_discount" | "percentage_discount";
  discount_value: string;
  priority: string;
  is_active: boolean;
};
const emptyRule: RuleDraft = {
  rule_name: "",
  condition_type: "min_cart_value",
  value: "299",
  states: "",
  from: "",
  to: "",
  discount_type: "free_shipping",
  discount_value: "0",
  priority: "0",
  is_active: true,
};
const fieldClass = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:border-primary disabled:opacity-50";

export default function ShippingAdminPanel() {
  const [tab, setTab] = useState<"settings" | "providers" | "rules" | "audit">("settings");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providerEdit, setProviderEdit] = useState<{ id: string; apiKey: string; apiSecret: string; endpointUrl: string } | null>(null);
  const [ruleEdit, setRuleEdit] = useState<RuleDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSettings, nextProviders, nextRules, nextLogs] = await Promise.all([
        listShippingSettings(), listShippingProviders(), listShippingRules(), listShippingAuditLogs(),
      ]);
      setSettings(nextSettings);
      setProviders(nextProviders);
      setRules(nextRules);
      setLogs(nextLogs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o módulo de fretes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveSettings = async () => {
    if (!settings || saving) return;
    setSaving(true);
    try {
      await updateShippingSettings({ data: {
        id: settings.id,
        origin_zip_code: settings.origin_zip_code.replace(/\D/g, ""),
        is_enabled: settings.is_enabled,
        default_box_weight_kg: Number(settings.default_box_weight_kg),
        default_box_length_cm: Number(settings.default_box_length_cm),
        default_box_width_cm: Number(settings.default_box_width_cm),
        default_box_height_cm: Number(settings.default_box_height_cm),
        handling_fee: Number(settings.handling_fee),
        shipping_markup_percentage: Number(settings.shipping_markup_percentage),
        pickup_enabled: settings.pickup_enabled,
        pickup_label: settings.pickup_label,
        pickup_address: settings.pickup_address,
        pickup_instructions: settings.pickup_instructions,
        free_shipping_enabled: settings.free_shipping_enabled,
        free_shipping_threshold: Number(settings.free_shipping_threshold),
      } });
      toast.success("Configurações de frete salvas.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as configurações.");
    } finally { setSaving(false); }
  };

  const saveProvider = async () => {
    if (!providerEdit || saving) return;
    setSaving(true);
    try {
      await updateShippingProvider({ data: {
        id: providerEdit.id,
        ...(providerEdit.apiKey.trim() ? { apiKey: providerEdit.apiKey.trim() } : {}),
        ...(providerEdit.apiSecret.trim() ? { apiSecret: providerEdit.apiSecret.trim() } : {}),
        endpointUrl: providerEdit.endpointUrl.trim() ? providerEdit.endpointUrl.trim() : null,
      } });
      toast.success("Provedor atualizado. As credenciais permanecem protegidas no servidor.");
      setProviderEdit(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o provedor.");
    } finally { setSaving(false); }
  };

  const toggleProvider = async (provider: Provider) => {
    try {
      await updateShippingProvider({ data: { id: provider.id, isActive: !provider.is_active } });
      toast.success(provider.is_active ? "Provedor desativado." : "Provedor ativado.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o provedor.");
    }
  };

  const saveRule = async () => {
    if (!ruleEdit || saving) return;
    const condition_value: Record<string, unknown> = ruleEdit.condition_type === "min_cart_value"
      ? { value: Number(ruleEdit.value) }
      : ruleEdit.condition_type === "specific_state"
        ? { states: ruleEdit.states.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) }
        : { from: ruleEdit.from.replace(/\D/g, ""), to: ruleEdit.to.replace(/\D/g, "") };
    const minimumValue = Number(condition_value["value"] ?? 0);
    const states = Array.isArray(condition_value["states"]) ? condition_value["states"] : [];
    const zipFrom = typeof condition_value["from"] === "string" ? condition_value["from"] : "";
    const zipTo = typeof condition_value["to"] === "string" ? condition_value["to"] : "";
    if (ruleEdit.condition_type === "min_cart_value" && (!Number.isFinite(minimumValue) || minimumValue < 0)) {
      toast.error("Informe um valor mínimo válido.");
      return;
    }
    if (ruleEdit.condition_type === "specific_state" && states.length === 0) {
      toast.error("Informe ao menos uma UF.");
      return;
    }
    if (ruleEdit.condition_type === "zip_code_range" && (zipFrom.length !== 8 || zipTo.length !== 8 || zipFrom > zipTo)) {
      toast.error("Informe uma faixa de CEP válida.");
      return;
    }
    setSaving(true);
    try {
      await saveShippingRule({ data: {
        ...(ruleEdit.id ? { id: ruleEdit.id } : {}),
        rule_name: ruleEdit.rule_name.trim(),
        condition_type: ruleEdit.condition_type,
        condition_value,
        discount_type: ruleEdit.discount_type,
        discount_value: Number(ruleEdit.discount_value),
        is_active: ruleEdit.is_active,
        priority: Number(ruleEdit.priority),
      } });
      toast.success("Regra de frete salva.");
      setRuleEdit(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a regra.");
    } finally { setSaving(false); }
  };

  const removeRule = async (rule: Rule) => {
    if (!window.confirm(`Excluir a regra "${rule.rule_name}"?`)) return;
    try {
      await deleteShippingRule({ data: { id: rule.id } });
      toast.success("Regra removida.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a regra.");
    }
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  };

  if (loading) return <div className="flex min-h-56 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" /> Carregando gestão de fretes…</div>;
  if (!settings) return <section className="rounded-2xl border border-border bg-card p-6"><p className="text-sm text-muted-foreground">Configuração de frete não encontrada.</p><button type="button" className={secondaryClass} onClick={() => void load()}>Tentar novamente</button></section>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Operação logística</p>
          <h2 className="mt-1 text-2xl font-semibold">Gestão de fretes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Origem, transportadoras, regras comerciais e auditoria — isolados na loja PapeLemi.</p>
        </div>
        <button type="button" className={secondaryClass} onClick={() => void load()}><RefreshCw className="size-4" /> Atualizar</button>
      </div>

      {!settings.origin_zip_code || !settings.is_enabled ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div><strong>Frete ainda não está ativo.</strong><p className="mt-1 text-muted-foreground">Informe o CEP de origem, configure um provedor e habilite o módulo para liberar cotações no checkout.</p></div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {([
          ["settings", "Origem e padrões"],
          ["providers", "Transportadoras"],
          ["rules", "Regras e promoções"],
          ["audit", "Auditoria"],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-full border px-4 py-2 text-sm ${tab === key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`}>{label}</button>
        ))}
      </div>

      {tab === "settings" ? (
        <section className="max-w-3xl rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-medium">Configuração da loja</h3><p className="text-xs text-muted-foreground">O endereço de origem é privado e usado somente no cálculo.</p></div><Truck className="size-5 text-primary" /></div>
          <label className="block text-sm">CEP de origem<input className={fieldClass} inputMode="numeric" maxLength={8} value={settings.origin_zip_code} onChange={(e) => updateSetting("origin_zip_code", e.target.value.replace(/\D/g, "").slice(0,8))} placeholder="00000000" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["default_box_weight_kg", "Peso padrão por item (kg)", "0.001"],
              ["default_box_length_cm", "Comprimento padrão (cm)", "0.01"],
              ["default_box_width_cm", "Largura padrão (cm)", "0.01"],
              ["default_box_height_cm", "Altura padrão (cm)", "0.01"],
              ["handling_fee", "Taxa de manuseio (R$)", "0.01"],
              ["shipping_markup_percentage", "Margem sobre frete (%)", "0.01"],
              ["free_shipping_threshold", "Valor mínimo para frete grátis (R$)", "0.01"],
            ] as const).map(([key,label,step]) => (
              <label key={key} className="block text-sm">{label}<input className={fieldClass} type="number" min="0" step={step} value={String(settings[key])} onChange={(e) => updateSetting(key, Number(e.target.value) as Settings[typeof key])} /></label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.is_enabled} onChange={(e) => updateSetting("is_enabled", e.target.checked)} /> Ativar cálculo de frete</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.free_shipping_enabled} onChange={(e) => updateSetting("free_shipping_enabled", e.target.checked)} /> Habilitar frete grátis por valor</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.pickup_enabled} onChange={(e) => updateSetting("pickup_enabled", e.target.checked)} /> Permitir retirada no local</label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Nome da retirada<input className={fieldClass} value={settings.pickup_label} onChange={(e) => updateSetting("pickup_label", e.target.value)} /></label>
            <label className="block text-sm">Endereço da retirada<input className={fieldClass} value={settings.pickup_address} onChange={(e) => updateSetting("pickup_address", e.target.value)} /></label>
          </div>
          <label className="block text-sm">Instruções para retirada<textarea className={fieldClass} rows={3} value={settings.pickup_instructions} onChange={(e) => updateSetting("pickup_instructions", e.target.value)} /></label>
          <button type="button" disabled={saving} className={buttonClass} onClick={() => void saveSettings()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar configurações</button>
        </section>
      ) : null}

      {tab === "providers" ? (
        <section className="space-y-3">
          {providers.map((provider) => (
            <article key={provider.id} className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-medium">{provider.provider_name}</h3>
                <p className="text-xs text-muted-foreground">{provider.provider_code} · {provider.is_active ? "Ativo" : "Inativo"}</p>
                <p className="mt-1 text-xs">{provider.has_api_key ? <span className="text-emerald-700 dark:text-emerald-400"><ShieldCheck className="mr-1 inline size-3" /> API Key configurada</span> : <span className="text-amber-700 dark:text-amber-400">API Key ausente</span>}</p>
                <p className="text-xs text-muted-foreground">{provider.endpoint_url || "Endpoint não configurado"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondaryClass} onClick={() => setProviderEdit({ id: provider.id, apiKey: "", apiSecret: "", endpointUrl: provider.endpoint_url ?? "" })}><Pencil className="size-4" /> Configurar</button>
                <button type="button" className={provider.is_active ? secondaryClass : buttonClass} onClick={() => void toggleProvider(provider)}>{provider.is_active ? "Desativar" : "Ativar"}</button>
              </div>
            </article>
          ))}
          {!providers.length ? <p className="text-sm text-muted-foreground">Nenhuma transportadora cadastrada.</p> : null}
        </section>
      ) : null}

      {tab === "rules" ? (
        <section className="space-y-3">
          <div className="flex justify-end"><button type="button" className={buttonClass} onClick={() => setRuleEdit({ ...emptyRule })}><Plus className="size-4" /> Nova regra</button></div>
          {rules.map((rule) => (
            <article key={rule.id} className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-medium">{rule.rule_name}</h3><p className="text-xs text-muted-foreground">{rule.condition_type} → {rule.discount_type} · Prioridade {rule.priority} · {rule.is_active ? "Ativa" : "Inativa"}</p></div>
              <div className="flex gap-2"><button type="button" className={secondaryClass} onClick={() => {
                const cv = rule.condition_value as Record<string, unknown>;
                setRuleEdit({
                  id: rule.id, rule_name: rule.rule_name, condition_type: rule.condition_type,
                  value: String(cv["value"] ?? ""), states: Array.isArray(cv["states"]) ? cv["states"].join(", ") : "",
                  from: String(cv["from"] ?? ""), to: String(cv["to"] ?? ""), discount_type: rule.discount_type,
                  discount_value: String(rule.discount_value), priority: String(rule.priority), is_active: rule.is_active,
                });
              }}><Pencil className="size-4" /> Editar</button><button type="button" className={secondaryClass} onClick={() => void removeRule(rule)}><Trash2 className="size-4" /> Excluir</button></div>
            </article>
          ))}
          {!rules.length ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma regra de frete cadastrada.</p> : null}
        </section>
      ) : null}

      {tab === "audit" ? (
        <section className="space-y-3">
          {logs.map((log) => (
            <article key={log.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{log.event_type}</strong><span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("pt-BR")}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{log.provider_name || "Sem provedor"} · CEP {log.destination_zip || "não informado"} · {log.total_weight_kg ?? "—"} kg</p>
              {log.error_message ? <p className="mt-2 text-sm text-destructive">{log.error_message}</p> : null}
            </article>
          ))}
          {!logs.length ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum evento de frete registrado.</p> : null}
        </section>
      ) : null}

      {providerEdit ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setProviderEdit(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="shipping-provider-title" className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between"><h3 id="shipping-provider-title" className="font-medium">Credenciais da transportadora</h3><button type="button" onClick={() => setProviderEdit(null)} aria-label="Fechar"><X className="size-4" /></button></div>
            <p className="mt-2 text-xs text-muted-foreground">Os valores atuais nunca são enviados ao navegador. Preencha somente os campos que deseja substituir.</p>
            <label className="mt-4 block text-sm">API Key<input className={fieldClass} type="password" autoComplete="new-password" value={providerEdit.apiKey} onChange={(e) => setProviderEdit({ ...providerEdit, apiKey: e.target.value })} /></label>
            <label className="mt-3 block text-sm">API Secret (se aplicável)<input className={fieldClass} type="password" autoComplete="new-password" value={providerEdit.apiSecret} onChange={(e) => setProviderEdit({ ...providerEdit, apiSecret: e.target.value })} /></label>
            <label className="mt-3 block text-sm">Endpoint de cotação<input className={fieldClass} type="url" value={providerEdit.endpointUrl} onChange={(e) => setProviderEdit({ ...providerEdit, endpointUrl: e.target.value })} placeholder="https://…" /></label>
            <div className="mt-5 flex justify-end gap-2"><button type="button" className={secondaryClass} onClick={() => setProviderEdit(null)}>Cancelar</button><button type="button" className={buttonClass} disabled={saving} onClick={() => void saveProvider()}><Save className="size-4" /> Salvar</button></div>
          </section>
        </div>
      ) : null}

      {ruleEdit ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setRuleEdit(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="shipping-rule-title" className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between"><h3 id="shipping-rule-title" className="font-medium">{ruleEdit.id ? "Editar regra" : "Nova regra de frete"}</h3><button type="button" onClick={() => setRuleEdit(null)} aria-label="Fechar"><X className="size-4" /></button></div>
            <label className="mt-4 block text-sm">Nome da regra<input className={fieldClass} value={ruleEdit.rule_name} onChange={(e) => setRuleEdit({ ...ruleEdit, rule_name: e.target.value })} /></label>
            <label className="mt-3 block text-sm">Condição<select className={fieldClass} value={ruleEdit.condition_type} onChange={(e) => setRuleEdit({ ...ruleEdit, condition_type: e.target.value as RuleDraft["condition_type"] })}><option value="min_cart_value">Valor mínimo do carrinho</option><option value="specific_state">Estado (UF)</option><option value="zip_code_range">Faixa de CEP</option></select></label>
            {ruleEdit.condition_type === "min_cart_value" ? <label className="mt-3 block text-sm">Valor mínimo (R$)<input className={fieldClass} type="number" min="0" step="0.01" value={ruleEdit.value} onChange={(e) => setRuleEdit({ ...ruleEdit, value: e.target.value })} /></label> : null}
            {ruleEdit.condition_type === "specific_state" ? <label className="mt-3 block text-sm">UFs separadas por vírgula<input className={fieldClass} value={ruleEdit.states} onChange={(e) => setRuleEdit({ ...ruleEdit, states: e.target.value })} placeholder="PR, SC, SP" /></label> : null}
            {ruleEdit.condition_type === "zip_code_range" ? <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-sm">CEP inicial<input className={fieldClass} value={ruleEdit.from} onChange={(e) => setRuleEdit({ ...ruleEdit, from: e.target.value.replace(/\D/g, "").slice(0,8) })} /></label><label className="text-sm">CEP final<input className={fieldClass} value={ruleEdit.to} onChange={(e) => setRuleEdit({ ...ruleEdit, to: e.target.value.replace(/\D/g, "").slice(0,8) })} /></label></div> : null}
            <label className="mt-3 block text-sm">Benefício<select className={fieldClass} value={ruleEdit.discount_type} onChange={(e) => setRuleEdit({ ...ruleEdit, discount_type: e.target.value as RuleDraft["discount_type"] })}><option value="free_shipping">Frete grátis</option><option value="fixed_discount">Desconto fixo (R$)</option><option value="percentage_discount">Desconto percentual (%)</option></select></label>
            {ruleEdit.discount_type !== "free_shipping" ? <label className="mt-3 block text-sm">Desconto<input className={fieldClass} type="number" min="0" step="0.01" value={ruleEdit.discount_value} onChange={(e) => setRuleEdit({ ...ruleEdit, discount_value: e.target.value })} /></label> : null}
            <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-sm">Prioridade<input className={fieldClass} type="number" value={ruleEdit.priority} onChange={(e) => setRuleEdit({ ...ruleEdit, priority: e.target.value })} /></label><label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={ruleEdit.is_active} onChange={(e) => setRuleEdit({ ...ruleEdit, is_active: e.target.checked })} /> Ativa</label></div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" className={secondaryClass} onClick={() => setRuleEdit(null)}>Cancelar</button><button type="button" className={buttonClass} disabled={saving} onClick={() => void saveRule()}><Save className="size-4" /> Salvar regra</button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
