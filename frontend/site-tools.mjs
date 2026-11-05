import { publicRoutes, routePolicy } from './src/config/routes.js';

const fields = ['environment', 'indexable', 'isExample', 'name', 'description', 'address', 'phone', 'whatsapp', 'instagram', 'email', 'logo', 'publicUrl', 'texts'];
const textFields = ['tagline', 'homeEyebrow', 'homeTitle', 'homeAccent', 'homeIntro', 'servicesHeading', 'servicesIntro', 'barbersHeading', 'barbersIntro', 'contactIntro', 'bookingIntro', 'openingHours', 'bannerTitle', 'seoHomeDescription', 'seoServicesDescription', 'seoBarbersDescription', 'seoContactDescription'];
function keysOnly(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key));
}
export function validateSite(site) {
  if (!keysOnly(site, fields) || !keysOnly(site.address, ['street', 'locality', 'province', 'postalCode', 'country']) || !keysOnly(site.texts, textFields)) throw new Error('Configuración pública: campos desconocidos o inválidos. No incluir secretos.');
  if (!['development', 'staging', 'production'].includes(site.environment) || typeof site.indexable !== 'boolean' || typeof site.isExample !== 'boolean') throw new Error('Configuración pública: entorno o indicadores inválidos.');
  const strings = [...fields.filter((key) => !['environment', 'indexable', 'isExample', 'address', 'texts'].includes(key)).map((key) => site[key]),
    ...['street', 'locality', 'province', 'postalCode', 'country'].map((key) => site.address[key]), ...textFields.map((key) => site.texts[key])];
  if (strings.some((value) => typeof value !== 'string') || !site.name.trim() || !site.description.trim()) throw new Error('Configuración pública: textos incompletos.');
  if (strings.some((value) => /(APP_USR-|TEST-)[a-z0-9]{15}|github_pat_|ghp_|-----BEGIN .*PRIVATE KEY/i.test(value))) throw new Error('Configuración pública: posible credencial; revisar sin publicarla.');
  let origin;
  try { origin = new URL(site.publicUrl); } catch { throw new Error('Configuración pública: publicUrl debe ser una URL absoluta.'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Configuración pública: publicUrl debe contener solo el origen, sin credenciales, ruta, query ni fragmento.');
  if (site.phone && !/^\+?[\d ()-]{7,25}$/.test(site.phone)) throw new Error('Configuración pública: teléfono inválido.');
  if (site.whatsapp && !/^\d{8,15}$/.test(site.whatsapp)) throw new Error('Configuración pública: WhatsApp debe usar dígitos internacionales, sin +.');
  if (site.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.email)) throw new Error('Configuración pública: correo inválido.');
  for (const [key, value] of [['instagram', site.instagram], ['logo', site.logo]]) {
    if (!value) continue;
    if (key === 'logo' && value.startsWith('/') && !value.startsWith('//')) continue;
    let url; try { url = new URL(value); } catch { throw new Error(`Configuración pública: ${key} inválido.`); }
    if (url.protocol !== 'https:' || url.username || url.password || (key === 'instagram' && !['instagram.com', 'www.instagram.com'].includes(url.hostname))) throw new Error(`Configuración pública: ${key} inválido.`);
  }
  if (site.indexable) {
    const reserved = /(^|\.)(localhost|example\.(com|org|net))$|\.(test|invalid|localhost|local)$|ngrok/i;
    const placeholders = /ejemplo|demostraci[oó]n|desarrollo|placeholder|nombre barber[ií]a|tu direcci[oó]n|example/i;
    if (site.environment !== 'production' || site.isExample || origin.protocol !== 'https:' || !origin.hostname.includes('.') || /^[\d.:]+$/.test(origin.hostname) || reserved.test(origin.hostname)
      || ['street', 'locality', 'province', 'country'].some((key) => !site.address[key].trim()) || !site.phone.trim()
      || textFields.some((key) => !site.texts[key].trim()) || strings.some((value) => placeholders.test(value))) {
      throw new Error('Publicación indexable bloqueada: completar datos reales, dominio HTTPS y entorno production; eliminar ejemplos.');
    }
  }
  return site;
}

export function escapeHtml(value) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
export function canonicalForRoute(pathname, site) {
  const policy = routePolicy(pathname);
  return policy.descriptionKey ? new URL(policy.path, `${site.publicUrl}/`).href : null;
}
export function hairSalonSchema(site) {
  if (site.isExample) return null;
  const schema = { '@context': 'https://schema.org', '@type': 'HairSalon', name: site.name, url: site.publicUrl };
  if (site.texts.contactIntro.trim()) schema.description = site.texts.contactIntro;
  if (site.phone.trim()) schema.telephone = site.phone;
  if (site.email.trim()) schema.email = site.email;
  if (site.logo.trim()) schema.logo = site.logo.startsWith('/') ? new URL(site.logo, `${site.publicUrl}/`).href : site.logo;
  if (site.instagram.trim()) schema.sameAs = [site.instagram];
  const address = Object.fromEntries(Object.entries({ streetAddress: site.address.street, addressLocality: site.address.locality,
    addressRegion: site.address.province, postalCode: site.address.postalCode, addressCountry: site.address.country }).filter(([, value]) => value.trim()));
  if (Object.keys(address).length) schema.address = { '@type': 'PostalAddress', ...address };
  return schema;
}
function contactDetails(site) {
  const items = [['DIRECCIÓN', [site.address.street, site.address.locality, site.address.province, site.address.postalCode,
    site.address.country === 'AR' ? 'Argentina' : site.address.country].filter(Boolean).join(', ')],
  ['TELÉFONO', site.phone], ['WHATSAPP', site.whatsapp], ['HORARIOS', site.texts.openingHours]];
  if (site.email) items.push(['CORREO', site.email]);
  if (site.instagram) items.push(['INSTAGRAM', site.instagram]);
  return items.filter(([, value]) => value);
}
export function prerenderedContent(pathname, site) {
  const path = routePolicy(pathname).path;
  const { texts } = site;
  const section = (title, intro, level = 1) => `<section><h${level}>${escapeHtml(title)}</h${level}><p>${escapeHtml(intro)}</p></section>`;
  const wrap = (content) => `<!-- SEO_PRERENDER_START --><div id="seo-prerender" class="seo-prerender">${content}</div><!-- SEO_PRERENDER_END -->`;
  if (path === '/') return wrap(`<main>${section(`${texts.homeTitle} ${texts.homeAccent}`, texts.homeIntro)}${section(texts.servicesHeading, texts.servicesIntro, 2)}<div id="seo-services-list" class="row g-3"></div>${section(texts.barbersHeading, texts.barbersIntro, 2)}<div id="seo-barbers-list" class="row g-3"></div></main>`);
  if (path === '/servicios') return wrap(`<main>${section('Servicios', texts.servicesIntro)}<div id="seo-services-list" class="row g-3"></div></main>`);
  if (path === '/barberos') return wrap(`<main>${section('Nuestros barberos', texts.barbersIntro)}<div id="seo-barbers-list" class="row g-3"></div></main>`);
  if (path === '/contacto') return wrap(`<main>${section('Contacto', texts.contactIntro)}<section><h2>Información de contacto</h2>${contactDetails(site).map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join('')}</section></main>`);
  return '';
}
function removePrerenderedContent(html) {
  const startMarker = '<!-- SEO_PRERENDER_START -->';
  const endMarker = '<!-- SEO_PRERENDER_END -->';
  const start = html.indexOf(startMarker);
  const end = start === -1 ? -1 : html.indexOf(endMarker, start + startMarker.length);
  if (start === -1 && !html.includes(endMarker)) return html;
  if (start === -1 || end === -1) throw new Error('HTML prerenderizado incompleto: faltan marcadores de contenido.');
  return html.slice(0, start) + html.slice(end + endMarker.length);
}
export function sitemapXml(site, indexable = false) {
  const urls = indexable ? Object.keys(publicRoutes).filter((pathname) => publicRoutes[pathname].indexable).map((pathname) => `  <url><loc>${escapeXml(canonicalForRoute(pathname, site))}</loc></url>`).join('\n') : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls ? `\n${urls}\n` : ''}</urlset>\n`;
}
function escapeXml(value) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character])); }
export function robotsTxt(site) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', `${site.publicUrl}/`).href}\n`;
}
export function htmlForRoute(html, pathname, site, indexable = false) {
  const policy = routePolicy(pathname, indexable);
  const description = policy.descriptionKey ? site.texts[policy.descriptionKey] : site.description;
  const canonical = canonicalForRoute(pathname, site);
  const schema = policy.path === '/contacto' ? hairSalonSchema(site) : null;
  const metadata = `<meta name="description" content="${escapeHtml(description)}" />\n  <meta name="robots" content="${policy.robots}" />${canonical ? `\n  <link rel="canonical" href="${escapeHtml(canonical)}" />` : ''}${schema ? `\n  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>` : ''}`;
  const content = prerenderedContent(pathname, site);
  const withMeta = html.replace(/<title>[^]*?<\/title>/i, `<title>${escapeHtml(`${policy.title} | ${site.name}`)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/gi, '').replace(/<meta\s+name="robots"[^>]*>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>/gi, '').replace(/<script\s+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace('</head>', `  ${metadata}\n  </head>`);
  return removePrerenderedContent(withMeta).replace('<div id="root"></div>', `${content}<div id="root"></div>`);
}
