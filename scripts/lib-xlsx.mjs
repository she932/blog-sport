// ============================================================
//  Lecteur XLSX minimal, sans dépendance.
//  Lit une feuille d'un classeur .xlsx (ZIP + XML) et renvoie ses
//  lignes sous forme de tableaux de chaînes. Suffisant pour importer
//  un feed produit (valeurs texte / nombres, y compris valeurs de
//  formules mises en cache par Excel).
//
//  Limitations assumées : pas de dates sérialisées converties, pas de
//  styles. Pour un feed d'import (texte, nombres, ASIN), c'est adapté.
// ============================================================
import fs from 'node:fs';
import zlib from 'node:zlib';

// --- Décompression ZIP via le répertoire central (robuste aux data
//     descriptors) ---------------------------------------------------
function unzip(buf) {
  const files = new Map();
  // End Of Central Directory : signature 0x06054b50, cherchée depuis la fin.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('XLSX : archive ZIP invalide (EOCD introuvable).');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    // En-tête local : recalculer le début des données (les longueurs
    // filename/extra du header local peuvent différer du central).
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    let content;
    if (method === 0) content = Buffer.from(raw);
    else if (method === 8) content = zlib.inflateRawSync(raw);
    else throw new Error(`XLSX : méthode de compression non gérée (${method}).`);
    files.set(name, content);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');

// Concatène tous les <t>…</t> d'un fragment (gère le texte enrichi et les
// préfixes de namespace type <x:t>).
function collectText(fragment) {
  let out = '';
  const re = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g;
  let m;
  while ((m = re.exec(fragment))) out += m[1];
  return unescapeXml(out);
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const arr = [];
  const re = /<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g;
  let m;
  while ((m = re.exec(xml))) arr.push(collectText(m[1]));
  return arr;
}

// Lettre(s) de colonne -> index 0-based (A->0, Z->25, AA->26).
function colIndex(ref) {
  const letters = (ref.match(/^[A-Z]+/) || ['A'])[0];
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml, shared) {
  const rows = [];
  const rowRe = /<(?:\w+:)?row[^>]*?>([\s\S]*?)<\/(?:\w+:)?row>|<(?:\w+:)?row[^>]*?\/>/g;
  const vRe = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const inner = rm[1] || '';
    const cells = [];
    const cellRe = /<(?:\w+:)?c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
    let cm;
    while ((cm = cellRe.exec(inner))) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1] || '';
      const type = (attrs.match(/t="([^"]+)"/) || [])[1] || 'n';
      let val = '';
      if (type === 's') {
        const idx = parseInt((body.match(vRe) || [])[1] || '0', 10);
        val = shared[idx] ?? '';
      } else if (type === 'inlineStr') {
        val = collectText(body);
      } else {
        // number, booléen, ou chaîne de formule mise en cache (t="str")
        val = unescapeXml((body.match(vRe) || [])[1] || '');
      }
      const ci = ref ? colIndex(ref) : cells.length;
      cells[ci] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    rows.push(cells);
  }
  return rows;
}

/**
 * Lit une feuille d'un .xlsx par son nom d'onglet. Renvoie un tableau de
 * lignes (tableaux de chaînes). Lève une erreur si l'onglet est absent.
 */
export function readXlsxSheet(filePath, sheetName) {
  const files = unzip(fs.readFileSync(filePath));
  const get = (n) => {
    const b = files.get(n);
    return b ? b.toString('utf8') : '';
  };
  const shared = parseSharedStrings(get('xl/sharedStrings.xml'));

  // Résout le nom d'onglet -> fichier worksheet via workbook.xml + rels.
  // Attributs extraits indépendamment de leur ordre, préfixes de namespace
  // (<x:sheet>) tolérés.
  const workbook = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] || '';
  const sheets = [...workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*\/?>/g)].map((m) => ({
    name: unescapeXml(attr(m[0], 'name')),
    rid: attr(m[0], 'r:id'),
  }));
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target').replace(/^\/?xl\//, '').replace(/^\//, '');
    if (id) relMap[id] = target;
  }
  const wanted = sheets.find((s) => s.name.toLowerCase() === String(sheetName).toLowerCase());
  let target;
  if (wanted && relMap[wanted.rid]) target = 'xl/' + relMap[wanted.rid].replace(/^xl\//, '');
  if (!target || !files.has(target)) {
    const names = sheets.map((s) => s.name).join(', ');
    throw new Error(`XLSX : onglet « ${sheetName} » introuvable. Onglets : ${names}`);
  }
  return parseSheet(get(target), shared);
}

/** Liste les noms d'onglets d'un classeur. */
export function listXlsxSheets(filePath) {
  const files = unzip(fs.readFileSync(filePath));
  const workbook = files.get('xl/workbook.xml')?.toString('utf8') || '';
  return [...workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*name="([^"]*)"/g)].map((m) =>
    unescapeXml(m[1])
  );
}
