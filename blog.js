/**
 * Server-side rendering for the public blog (/blog, /blog/:slug).
 * Plain template strings, no view engine.
 */

const BASE_URL = (process.env.BASE_URL || 'http://185.22.172.45:3000').replace(/\/$/, '');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const HEADER = `
  <header class="site-header">
    <div class="container">
      <a href="/" class="logo" aria-label="МастерДом - на главную">
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 16L17 5l13 11" stroke="#f59e0b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 14.5V28h18V14.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M14 28v-8h6v8" stroke="#f59e0b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Мастер<span>Дом</span>
      </a>
      <nav class="main-nav" id="mainNav">
        <a href="/#services">Услуги</a>
        <a href="/#prices">Цены</a>
        <a href="/calculator">Калькулятор</a>
        <a href="/blog">Блог</a>
        <a href="/#contacts">Контакты</a>
      </nav>
      <div class="header-contact">
        <a href="tel:+79161437879" class="header-phone">
          8 916 143-78-79
          <small>Александр · ежедневно 9:00-21:00</small>
        </a>
        <a href="/#contacts" class="btn btn-accent btn-header">Бесплатный замер</a>
        <button class="burger" id="burgerBtn" aria-label="Меню">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </header>`;

const FOOTER = `
  <footer class="site-footer">
    <div class="container footer-grid">
      <a href="/" class="logo">
        <svg width="26" height="26" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 16L17 5l13 11" stroke="#f59e0b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 14.5V28h18V14.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M14 28v-8h6v8" stroke="#f59e0b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Мастер<span>Дом</span>
      </a>
      <div class="footer-links">
        <a href="/#services">Услуги</a>
        <a href="/#prices">Цены</a>
        <a href="/calculator">Калькулятор</a>
        <a href="/blog">Блог</a>
        <a href="/#contacts">Контакты</a>
      </div>
      <div class="footer-contact">
        <a href="tel:+79161437879" class="footer-phone">8 916 143-78-79</a>
        <span class="footer-address">Москва, район Бибирево (СВАО)</span>
      </div>
    </div>
  </footer>
  <a href="tel:+79161437879" class="fab-call" aria-label="Позвонить">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 2 .7 2.9a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c1 .3 2 .5 3 .7a2 2 0 011.6 2z"/></svg>
  </a>
  <script>
    var burger = document.getElementById('burgerBtn');
    var nav = document.getElementById('mainNav');
    if (burger && nav) {
      burger.addEventListener('click', function(){ nav.classList.toggle('open'); });
    }
  </script>`;

function page({ title, description, canonicalPath, headExtra = '', body }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${BASE_URL}${canonicalPath}">
  <meta name="geo.region" content="RU-MOW">
  <meta name="geo.placename" content="Москва, район Бибирево">
  <meta property="og:site_name" content="МастерДом">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${BASE_URL}${canonicalPath}">
  <meta name="theme-color" content="#16191f">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/landing.css">
  <link rel="stylesheet" href="/css/blog.css">
  ${headExtra}
</head>
<body>
${HEADER}
${body}
${FOOTER}
</body>
</html>`;
}

/** /blog - article list */
function renderBlogList(articles) {
  const cards = articles.map(a => `
        <a class="post-card" href="/blog/${esc(a.slug)}">
          <div class="post-card-img">${a.preview_svg || ''}</div>
          <div class="post-card-body">
            <time datetime="${esc(a.created_at)}">${formatDate(a.created_at)}</time>
            <h2>${esc(a.title)}</h2>
            <p>${esc(a.description)}</p>
            <span class="post-card-more">Читать статью →</span>
          </div>
        </a>`).join('\n');

  const body = `
  <main class="blog-wrap">
    <div class="container">
      <div class="section-head centered blog-head">
        <span class="section-label">Блог МастерДом</span>
        <h1>Статьи о ремонте и строительстве</h1>
        <p>Советы по ремонту квартир и домов, выбору материалов и планированию работ от мастеров «МастерДом» (Бибирево, СВАО, Москва).</p>
      </div>
      ${articles.length ? `<div class="post-grid">${cards}</div>` : '<p class="blog-empty">Статьи скоро появятся. Загляните позже!</p>'}
    </div>
  </main>`;

  const og = articles.find(a => a.preview_svg) ? `<meta property="og:image" content="${BASE_URL}/og-image.svg">` : '';
  return page({
    title: 'Блог о ремонте и строительстве: советы мастеров | МастерДом',
    description: 'Статьи о ремонте квартир и домов: выбор материалов, этапы работ, типичные ошибки и реальные цены. Блог строительной компании МастерДом, Москва.',
    canonicalPath: '/blog',
    headExtra: og,
    body
  });
}

/** /blog/:slug - single article */
function renderArticle(article, others) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    inLanguage: 'ru-RU',
    datePublished: article.created_at,
    dateModified: article.updated_at,
    mainEntityOfPage: `${BASE_URL}/blog/${article.slug}`,
    author: { '@type': 'Organization', name: 'МастерДом' },
    publisher: { '@type': 'Organization', name: 'МастерДом', url: BASE_URL }
  };

  const related = (others || []).map(a => `
          <a class="related-card" href="/blog/${esc(a.slug)}">
            <span>${esc(a.title)}</span>
            <small>${formatDate(a.created_at)}</small>
          </a>`).join('\n');

  const body = `
  <main class="blog-wrap">
    <article class="container article-wrap" itemscope itemtype="https://schema.org/Article">
      <nav class="crumbs"><a href="/">Главная</a> / <a href="/blog">Блог</a></nav>
      <h1 itemprop="headline">${esc(article.title)}</h1>
      <div class="article-meta">
        <time datetime="${esc(article.created_at)}">${formatDate(article.created_at)}</time>
        <span>·</span>
        <span>МастерДом, Бибирево</span>
      </div>
      ${article.preview_svg ? `<div class="article-cover">${article.preview_svg}</div>` : ''}
      <div class="article-body" itemprop="articleBody">
        ${article.content_html}
      </div>
      <div class="article-cta">
        <div>
          <b>Планируете ремонт?</b>
          <p>Бесплатный замер и смета в Бибирево, СВАО и по всей Москве. Александр ответит лично.</p>
        </div>
        <a href="tel:+79161437879" class="btn btn-accent">📞 8 916 143-78-79</a>
      </div>
      ${related ? `<div class="related"><h2>Ещё по теме</h2><div class="related-grid">${related}</div></div>` : ''}
    </article>
  </main>`;

  return page({
    title: `${article.title} | Блог МастерДом`,
    description: article.description,
    canonicalPath: `/blog/${article.slug}`,
    headExtra: `<meta name="keywords" content="${esc(article.keywords)}">
  <meta property="og:type" content="article">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    body
  });
}

/** Dynamic sitemap with published articles. */
function renderSitemap(articles) {
  const staticUrls = [
    { loc: `${BASE_URL}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${BASE_URL}/calculator`, priority: '0.8', changefreq: 'monthly' },
    { loc: `${BASE_URL}/blog`, priority: '0.9', changefreq: 'daily' }
  ];
  const urls = staticUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).concat(articles.map(a => `  <url>
    <loc>${BASE_URL}/blog/${esc(a.slug)}</loc>
    <lastmod>${String(a.updated_at).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}

module.exports = { renderBlogList, renderArticle, renderSitemap, esc };
