import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL;
if (!baseUrl) throw new Error("BASE_URL não configurada");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
const pageErrors = [];
const results = [];

page.on("pageerror", (error) => pageErrors.push(error.message));

function htmlAttribute(tag, name) {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function readHtmlMeta(html, attributeName, expectedValue) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((candidate) => htmlAttribute(candidate, attributeName) === expectedValue);
  return tag ? htmlAttribute(tag, "content") : "";
}

function readHtmlTitle(html) {
  return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
}

function readHtmlJsonLd(html) {
  const tags = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  return tags.flatMap((tag) => {
    const body = tag.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      return [JSON.parse(body)];
    } catch {
      return [];
    }
  });
}

async function openRoute(path) {
  const url = new URL(path, baseUrl).toString();
  let lastError;

  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      if (response && response.status() >= 200 && response.status() < 400) {
        await page.locator("h1").first().waitFor({ timeout: 15000 });
        await page.waitForFunction(
          () => document.documentElement.dataset.appHydrated === "true",
          { timeout: 15000 },
        );
        return response;
      }

      lastError = new Error(`Preview respondeu HTTP ${response?.status() ?? "sem resposta"} em ${path}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < 18) await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  throw lastError ?? new Error(`Não foi possível abrir ${path}`);
}

async function inspectLayout(width) {
  return page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector("h1")?.textContent?.trim() ?? "",
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "",
    hydrated: document.documentElement.dataset.appHydrated === "true",
    jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => script.textContent ?? "")
      .filter(Boolean),
  }));
}

try {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    const productResponse = await openRoute("/produto/caderneta-saude-ursinho-clean");
    const productHtml = await productResponse.text();
    const product = await inspectLayout(width);

    if (!productResponse.ok()) throw new Error(`Produto retornou HTTP ${productResponse.status()}`);
    const productSsrTitle = readHtmlTitle(productHtml);
    const productSsrDescription = readHtmlMeta(productHtml, "name", "description");
    const productSsrJsonLd = readHtmlJsonLd(productHtml).find((value) => value?.["@type"] === "Product");
    if (!productSsrTitle.includes("Caderneta de Saúde") || !productSsrTitle.includes("PapeLemi")) {
      throw new Error(`Title não está presente no HTML SSR em ${width}px`);
    }
    if (!productSsrDescription) throw new Error(`Meta description não está presente no HTML SSR em ${width}px`);
    if (!productSsrJsonLd || productSsrJsonLd.name !== "Caderneta de Saúde · Ursinho Clean") {
      throw new Error(`Product JSON-LD ausente ou inconsistente no HTML SSR em ${width}px`);
    }
    if (!product.h1.includes("Caderneta de Saúde")) throw new Error(`H1 de produto inesperado em ${width}px: ${product.h1}`);
    if (!product.title.includes("PapeLemi")) throw new Error(`Title hidratado ausente em ${width}px`);
    if (!product.description) throw new Error(`Meta description hidratada ausente em ${width}px`);
    if (!product.hydrated) throw new Error(`Aplicação não concluiu hidratação em ${width}px`);
    if (product.documentWidth > width + 1 || product.bodyWidth > width + 1) {
      throw new Error(`Overflow horizontal em ${width}px: document=${product.documentWidth}, body=${product.bodyWidth}`);
    }

    const productSchema = product.jsonLd
      .map((value) => {
        try { return JSON.parse(value); } catch { return null; }
      })
      .find((value) => value?.["@type"] === "Product");

    if (!productSchema || productSchema.name !== "Caderneta de Saúde · Ursinho Clean") {
      throw new Error(`Product JSON-LD ausente ou inconsistente em ${width}px`);
    }

    const categoryResponse = await openRoute("/categoria/cadernetas");
    const categoryHtml = await categoryResponse.text();
    const category = await inspectLayout(width);
    if (!categoryResponse.ok()) throw new Error(`Categoria retornou HTTP ${categoryResponse.status()}`);
    const categorySsrTitle = readHtmlTitle(categoryHtml);
    const categorySsrDescription = readHtmlMeta(categoryHtml, "name", "description");
    if (!categorySsrTitle.includes("Cadernetas") || !categorySsrTitle.includes("PapeLemi")) {
      throw new Error(`Title da categoria não está presente no HTML SSR em ${width}px`);
    }
    if (!categorySsrDescription) throw new Error(`Meta description da categoria não está presente no HTML SSR em ${width}px`);
    if (!category.h1.includes("Cadernetas")) throw new Error(`H1 de categoria inesperado em ${width}px: ${category.h1}`);
    if (!category.description) throw new Error(`Meta description hidratada da categoria ausente em ${width}px`);
    if (!category.hydrated) throw new Error(`Categoria não concluiu hidratação em ${width}px`);
    if (category.documentWidth > width + 1 || category.bodyWidth > width + 1) {
      throw new Error(`Overflow horizontal na categoria em ${width}px`);
    }

    results.push({
      viewport: width,
      product: "PASS",
      productJsonLd: "PASS",
      category: "PASS",
      horizontalOverflow: "none",
    });
  }

  await page.setViewportSize({ width: 390, height: 900 });
  const missingResponse = await openRoute("/produto/qa-produto-inexistente-20261125");
  const missing = await inspectLayout(390);
  if (!missingResponse.ok()) throw new Error(`Rota de produto inexistente retornou HTTP ${missingResponse.status()}`);
  if (!missing.h1.includes("Produto não encontrado")) {
    throw new Error(`Produto inexistente não foi tratado corretamente: ${missing.h1}`);
  }
  if (!missing.robots.includes("noindex")) throw new Error("Produto inexistente não recebeu noindex");

  const missingCategoryResponse = await openRoute("/categoria/qa-categoria-inexistente-20261125");
  const missingCategory = await inspectLayout(390);
  if (!missingCategoryResponse.ok()) throw new Error(`Categoria inexistente retornou HTTP ${missingCategoryResponse.status()}`);
  if (!missingCategory.h1.includes("Categoria não encontrada")) {
    throw new Error(`Categoria inexistente não foi tratada corretamente: ${missingCategory.h1}`);
  }
  if (!missingCategory.robots.includes("noindex")) throw new Error("Categoria inexistente não recebeu noindex");

  if (pageErrors.length) throw new Error(`Erros de hidratação/runtime: ${pageErrors.join(" | ")}`);

  console.log(JSON.stringify({
    result: "PASS",
    viewports: results,
    missingProduct: "PASS",
    pageErrors: 0,
  }, null, 2));
} finally {
  await browser.close();
}
