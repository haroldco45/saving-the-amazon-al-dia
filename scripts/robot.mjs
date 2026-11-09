// Robot de Saving The Amazon al Día — Vibras Positivas HM
// Corre en GitHub Actions cada 30 minutos: trae noticias reales (Google News RSS)
// y el contador de árboles de savingtheamazon.org. Escribe noticias.json.
import { readFile, writeFile } from 'node:fs/promises';

const ARCHIVO = 'noticias.json';
const QUERIES = [
  { q: '"Saving The Amazon"', hl: 'es-419', gl: 'CO', ceid: 'CO:es-419', tag: 'sta', lang: 'es' },
  { q: '"Saving The Amazon" Colombia', hl: 'en-US', gl: 'US', ceid: 'US:en', tag: 'sta', lang: 'en' },
  { q: 'savingtheamazon', hl: 'es-419', gl: 'CO', ceid: 'CO:es-419', tag: 'sta', lang: 'es' },
  { q: '"Ley 2173" árboles', hl: 'es-419', gl: 'CO', ceid: 'CO:es-419', tag: 'ley', lang: 'es' },
  { q: '"Ley del Árbol" Colombia empresas', hl: 'es-419', gl: 'CO', ceid: 'CO:es-419', tag: 'ley', lang: 'es' }
];
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; SavingTheAmazonAlDia/1.0)' };

const limpiar = s => (s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? limpiar(m[1]) : ''; };

async function rss(m) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(m.q)}&hl=${m.hl}&gl=${m.gl}&ceid=${m.ceid}`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${m.q}`);
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const titulo = tag(it, 'title');
    const fuente = tag(it, 'source') || titulo.split(' - ').pop();
    return {
      titulo: titulo.replace(/\s+-\s+[^-]+$/, ''),
      link: tag(it, 'link'),
      fuente,
      fecha: new Date(tag(it, 'pubDate') || Date.now()).toISOString(),
      lang: m.lang,
      tag: m.tag
    };
  });
}

async function contador(anterior) {
  try {
    const r = await fetch('https://www.savingtheamazon.org/', { headers: UA });
    const html = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const num = re => { const m = html.match(re); return m ? Number(m[1].replace(/[.,]/g, '')) : null; };
    const arboles = num(/\+?\s*([\d.,]{6,})\s*(?:Árboles sembrados|Trees planted)/i);
    const co2 = num(/\+?\s*([\d.,]{6,})\s*(?:toneladas|tons)/i);
    const familias = num(/([\d.,]{2,6})\s*(?:Familias|Families)/i);
    const comunidades = num(/([\d.,]{1,4})\s*(?:Comunidades|Communities)/i);
    const nuevo = { ...anterior };
    // Solo se acepta si es razonable y no retrocede
    if (arboles && arboles >= (anterior.arboles || 0) && arboles < 5e6) nuevo.arboles = arboles;
    if (co2 && co2 >= (anterior.co2 || 0) && co2 < 1e8) nuevo.co2 = co2;
    if (familias && familias >= (anterior.familias || 0) && familias < 1e5) nuevo.familias = familias;
    if (comunidades && comunidades >= (anterior.comunidades || 0) && comunidades < 5000) nuevo.comunidades = comunidades;
    if (JSON.stringify(nuevo) !== JSON.stringify(anterior)) nuevo.fecha = new Date().toISOString();
    return nuevo;
  } catch (e) {
    console.log('Contador no disponible:', e.message);
    return anterior;
  }
}

const previo = JSON.parse(await readFile(ARCHIVO, 'utf8').catch(() => '{}'));
const mapa = new Map((previo.noticias || []).map(n => [n.link, n]));
const titulos = new Set([...mapa.values()].map(n => n.titulo.toLowerCase()));

for (const m of QUERIES) {
  try {
    for (const n of await rss(m)) {
      if (!n.link || !n.titulo) continue;
      const k = n.titulo.toLowerCase();
      if (mapa.has(n.link) || titulos.has(k)) continue;
      mapa.set(n.link, n); titulos.add(k);
    }
  } catch (e) { console.log('RSS falló:', e.message); }
}

const noticias = [...mapa.values()]
  .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  .slice(0, 150);

const cifras = await contador(previo.cifras || {
  arboles: 914273, mangles: 10000, co2: 987414, familias: 895, comunidades: 54, paises: 3,
  fecha: '2026-11-09T09:00:00-05:00'
});

await writeFile(ARCHIVO, JSON.stringify({ actualizado: new Date().toISOString(), cifras, noticias }, null, 1));
console.log(`Listo: ${noticias.length} noticias · árboles ${cifras.arboles}`);
