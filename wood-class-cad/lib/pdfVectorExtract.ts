// Extracts the real vector path data straight out of a PDF's content stream using pdfjs-dist
// (pure JS, no native deps) — this is what lets "schiță tehnică" PDFs (CAD/vector exports) work
// in serverless environments like Vercel, where system binaries such as pdftocairo aren't
// available. Scanned/raster PDFs have no vector paths and return null (caller should ask for an
// image upload instead).

interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number; }

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

// Composes "apply m, then n" — matches the PDF `cm` operator's CTM concatenation rule.
function concat(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.b * n.c,
    b: m.a * n.b + m.b * n.d,
    c: m.c * n.a + m.d * n.c,
    d: m.c * n.b + m.d * n.d,
    e: m.e * n.a + m.f * n.c + n.e,
    f: m.e * n.b + m.f * n.d + n.f,
  };
}

function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

export async function extractVectorSVGFromPDF(buffer: Buffer): Promise<string | null> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  const page = await doc.getPage(1);
  const [x0, y0, x1, y1] = page.view;
  const pageWidth = x1 - x0;
  const pageHeight = y1 - y0;

  const opList = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;

  let ctm = IDENTITY;
  const stack: Matrix[] = [];
  let cur = { x: 0, y: 0 };
  let subStart = { x: 0, y: 0 };
  let d = '';

  // Flip Y so coordinates match the standard SVG/raster convention (origin top-left, Y down) —
  // the same convention buildShapeFromSVG (client-side) already assumes for traced sketches.
  const toSvg = (p: { x: number; y: number }) => ({ x: p.x - x0, y: pageHeight - (p.y - y0) });
  const fmt = (n: number) => Number(n.toFixed(3));

  function runPathOp(op: number, coords: number[], i: number): number {
    if (op === OPS.moveTo) {
      const s = toSvg(apply(ctm, coords[i], coords[i + 1]));
      d += `M ${fmt(s.x)} ${fmt(s.y)} `;
      cur = s; subStart = s;
      return i + 2;
    }
    if (op === OPS.lineTo) {
      const s = toSvg(apply(ctm, coords[i], coords[i + 1]));
      d += `L ${fmt(s.x)} ${fmt(s.y)} `;
      cur = s;
      return i + 2;
    }
    if (op === OPS.curveTo) {
      const p1 = toSvg(apply(ctm, coords[i], coords[i + 1]));
      const p2 = toSvg(apply(ctm, coords[i + 2], coords[i + 3]));
      const p3 = toSvg(apply(ctm, coords[i + 4], coords[i + 5]));
      d += `C ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)} ${fmt(p3.x)} ${fmt(p3.y)} `;
      cur = p3;
      return i + 6;
    }
    if (op === OPS.curveTo2) {
      // 'v' operator: first control point is the current point.
      const p2 = toSvg(apply(ctm, coords[i], coords[i + 1]));
      const p3 = toSvg(apply(ctm, coords[i + 2], coords[i + 3]));
      d += `C ${fmt(cur.x)} ${fmt(cur.y)} ${fmt(p2.x)} ${fmt(p2.y)} ${fmt(p3.x)} ${fmt(p3.y)} `;
      cur = p3;
      return i + 4;
    }
    if (op === OPS.curveTo3) {
      // 'y' operator: second control point equals the endpoint.
      const p1 = toSvg(apply(ctm, coords[i], coords[i + 1]));
      const p3 = toSvg(apply(ctm, coords[i + 2], coords[i + 3]));
      d += `C ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p3.x)} ${fmt(p3.y)} ${fmt(p3.x)} ${fmt(p3.y)} `;
      cur = p3;
      return i + 4;
    }
    if (op === OPS.closePath) {
      d += 'Z ';
      cur = subStart;
      return i;
    }
    if (op === OPS.rectangle) {
      const [x, y, w, h] = [coords[i], coords[i + 1], coords[i + 2], coords[i + 3]];
      const p0 = toSvg(apply(ctm, x, y));
      const p1 = toSvg(apply(ctm, x + w, y));
      const p2 = toSvg(apply(ctm, x + w, y + h));
      const p3 = toSvg(apply(ctm, x, y + h));
      d += `M ${fmt(p0.x)} ${fmt(p0.y)} L ${fmt(p1.x)} ${fmt(p1.y)} L ${fmt(p2.x)} ${fmt(p2.y)} L ${fmt(p3.x)} ${fmt(p3.y)} Z `;
      cur = p0; subStart = p0;
      return i + 4;
    }
    return i;
  }

  const directPathOps = new Set([
    OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.curveTo2, OPS.curveTo3, OPS.closePath, OPS.rectangle,
  ]);

  for (let k = 0; k < opList.fnArray.length; k++) {
    const fn = opList.fnArray[k];
    const args = opList.argsArray[k] as number[];

    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (fn === OPS.transform) {
      const [a, b, c, dd, e, f] = args;
      ctm = concat({ a, b, c, d: dd, e, f }, ctm);
    } else if (fn === OPS.constructPath) {
      const [opsArr, coordsArr] = args as unknown as [number[], number[]];
      let ci = 0;
      for (const op of opsArr) ci = runPathOp(op, coordsArr, ci);
    } else if (directPathOps.has(fn)) {
      runPathOp(fn, args, 0);
    }
  }

  if (d.trim().length < 20) return null; // no meaningful vector path data — likely a scanned PDF

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}"><path d="${d.trim()}"/></svg>`;
}
