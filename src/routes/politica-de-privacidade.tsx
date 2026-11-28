import { publicCanonical, publicSocialMeta } from "@/lib/social-preview";
import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/store/LegalPage";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({ links: [publicCanonical("/politica-de-privacidade")], meta: [
    { title: "Política de privacidade — PapeLemi" }, { name: "description", content: "Como a PapeLemi trata seus dados pessoais, conforme a LGPD." },
    { property: "og:title", content: "Política de privacidade — PapeLemi" }, { property: "og:description", content: "Como tratamos seus dados." }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" },
      ...publicSocialMeta("/politica-de-privacidade", "Política de privacidade — PapeLemi", "Como tratamos seus dados."),
  ] }),
  component: () => (
    <LegalPage title="Política de privacidade" updated="25/11/2026">
      <p>Esta política explica como a PapeLemi coleta e usa dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      <h2>Dados que você nos informa</h2>
      <ul><li>Textos de personalização (nomes, frases e dedicatórias) para produzir seu pedido.</li><li>Dados de contato e entrega quando você finaliza uma compra ou nos escreve.</li></ul>
      <h2>Assistente de dedicatórias</h2>
      <p>As informações que você digita na assistente (ocasião, nomes, sentimento) são enviadas a um serviço de inteligência artificial apenas para gerar as sugestões e não são usadas para identificá-lo.</p>
      <h2>Dados guardados no seu navegador</h2>
      <p>O carrinho e suas frases favoritas ficam salvos no próprio navegador (armazenamento local), não em nossos servidores. Você pode apagá-los limpando os dados do site.</p>
      <h2>Medição de audiência</h2>
      <p>Usamos a medição de visitas da Lovable, que não usa cookies, não guarda nada no seu dispositivo, não mantém endereços IP e não identifica visitantes. Ela registra páginas visitadas, de onde o visitante veio, país, navegador, sistema operacional e tipo de dispositivo, tempo de permanência, velocidade das páginas, erros, cliques e eventos da loja (uso da assistente de dedicatórias, sugestões geradas, frases escolhidas e adições ao carrinho). Dados detalhados ficam guardados por 90 dias e resumos diários por um ano. A Lovable coleta esses dados para nós. <a className="text-primary underline" href="https://lovable.dev/privacy">A política de privacidade da Lovable</a> explica como ela os trata.</p>
      <h2>Seus direitos</h2>
      <p>Você pode pedir acesso, correção ou exclusão dos seus dados pelo e-mail de atendimento informado na página de contato.</p>
    </LegalPage>
  ),
});
