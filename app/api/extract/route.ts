import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Niciun fișier primit' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'Fișierul depășește limita de 12 MB' }, { status: 413 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    if (ext === 'pdf') {
      const { extractText } = await import('unpdf');
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
      const trimmed = text.trim();
      if (!trimmed) {
        return NextResponse.json(
          { success: false, error: 'PDF-ul nu conține text selectabil (poate fi scanat). Copiați textul manual.' },
          { status: 422 }
        );
      }
      return NextResponse.json({ success: true, text: trimmed });
    }

    if (ext === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();
      if (!text) {
        return NextResponse.json({ success: false, error: 'Documentul DOCX pare gol.' }, { status: 422 });
      }
      return NextResponse.json({ success: true, text });
    }

    return NextResponse.json(
      { success: false, error: 'Format nesuportat. Acceptăm PDF și DOCX.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('extract error:', error);
    return NextResponse.json({ success: false, error: 'Eroare la procesarea fișierului' }, { status: 500 });
  }
}
