import { Helmet } from 'react-helmet-async';

const WebSiteStructuredData = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://emporioPapeLemi.com.br/#website",
    "url": "https://emporioPapeLemi.com.br",
    "name": "PapeLemi",
    "description": "Lembrancinhas artesanais personalizadas para maternidade, chá de bebê, batizado, casamento e aniversário.",
    "publisher": {
      "@id": "https://emporioPapeLemi.com.br/#organization"
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://emporioPapeLemi.com.br/buscar?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    },
    "inLanguage": "pt-BR"
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </Helmet>
  );
};

export default WebSiteStructuredData;
