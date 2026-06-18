import { NextRequest, NextResponse } from 'next/server';
import { trace } from 'potrace';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const EXEC_OPTS = { encoding: 'utf-8' as const, maxBuffer: 1024 * 1024 * 20 };

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.pdf', '.cdr'];

function tracePotrace(image: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    trace(image, { turdSize: 4, optTolerance: 0.3 }, (err, svg) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
}

// Heuristic: does this SVG carry real vector path data, or is it just a wrapped raster image?
function hasVectorPaths(svg: string): boolean {
  const matches = svg.match(/<path[^>]*\sd="[^"]+"/g) ?? [];
  const totalLen = matches.reduce((sum, m) => sum + m.length, 0);
  return totalLen > 80;
}

export async function POST(request: NextRequest) {
  let workDir: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Fișierul lipsește' }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { success: false, error: 'Format neacceptat. Folosește JPG, PNG, PDF sau CDR.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let svg: string;

    if (ext === '.pdf' || ext === '.cdr') {
      workDir = await mkdtemp(path.join(tmpdir(), 'sketch-'));
      const inputPath = path.join(workDir, `input${ext}`);
      await writeFile(inputPath, buffer);
      const outputBase = path.join(workDir, 'output');

      if (ext === '.pdf') {
        await execFileAsync('pdftocairo', ['-svg', '-f', '1', '-l', '1', inputPath, `${outputBase}.svg`], EXEC_OPTS);
        svg = await readFile(`${outputBase}.svg`, 'utf-8');

        if (!hasVectorPaths(svg)) {
          // Scanned/raster PDF — no vector paths to extract. Rasterize the page and trace it instead.
          await execFileAsync('pdftoppm', ['-png', '-r', '200', '-singlefile', '-f', '1', inputPath, outputBase], EXEC_OPTS);
          const png = await readFile(`${outputBase}.png`);
          svg = await tracePotrace(png);
        }
      } else {
        try {
          const { stdout } = await execFileAsync('cdr2xhtml', [inputPath], EXEC_OPTS);
          svg = stdout;
        } catch {
          return NextResponse.json(
            { success: false, error: 'Fișierul CDR nu a putut fi citit (format nesuportat, versiune veche sau criptat)' },
            { status: 400 }
          );
        }

        if (!hasVectorPaths(svg)) {
          return NextResponse.json(
            { success: false, error: 'Nu s-au putut extrage curbe vectoriale din fișierul CDR' },
            { status: 400 }
          );
        }
      }
    } else {
      svg = await tracePotrace(buffer);
    }

    return NextResponse.json({ success: true, svg });
  } catch (error) {
    console.error('convert-sketch error:', error);
    return NextResponse.json({ success: false, error: 'Eroare la conversia fișierului' }, { status: 500 });
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
