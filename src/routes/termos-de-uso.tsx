import { publicSocialMeta } from "@/lib/social-preview";
import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/store/LegalPage";

export const Route = createFileRoute("/termos-de-uso")({
  head: () => ({ meta: [
    { title: "Termos de uso — PapeLemi" }, { name: "description", content: "Condições de compra, personalização, produção, trocas e uso da loja PapeLemi." },
    { property: "og:title", content: "Termos de uso — PapeLemi" }, { property: "og:description", content: "Condições de compra da PapeLemi." }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" },
      ...publicSocialMeta("Termos de uso — PapeLemi", "Condições de compra da PapeLemi."),
  ] }),
  component: () => (
    <LegalPage title="Termos de uso" updated="25/11/2026">
      <p>Ao usar a loja PapeLemi você concorda com as condições abaixo.</p>
      <h2>Produtos personalizados</h2>
      <p>Confira nomes, datas e frases antes de finalizar: o produto é produzido exatamente como informado. A prévia no site é uma ilustração aproximada.</p>
      <h2>Prazos de produção</h2>
      <p>Cada produto informa seu prazo de produção, contado após a confirmação do pagamento e somado ao prazo de entrega.</p>
      <h2>Trocas e arrependimento</h2>
      <p>Produtos personalizados não podem ser revendidos, por isso o direito de arrependimento (art. 49 do CDC) se aplica apenas a itens sem personalização. Defeitos de fabricação são sempre trocados.</p>
      <h2>Sugestões da assistente</h2>
      <p>As frases sugeridas são geradas automaticamente; revise o texto escolhido antes de aplicá-lo ao produto.</p>
      <h2>Preços</h2>
      <p>Os preços exibidos podem mudar sem aviso; vale o preço no momento da compra.</p>
    </LegalPage>
  ),
});
