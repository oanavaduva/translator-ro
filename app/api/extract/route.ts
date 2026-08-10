import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

const client = new Anthropic();

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
      const base64 = buffer.toString('base64');
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            {
              type: 'text',
              text: 'Extrage tot textul din acest document PDF. Returnează DOAR textul extras, fără explicații, fără formatare markdown, exact cum apare în document.',
            },
          ],
        }],
      });
      const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
      return NextResponse.json({ success: true, text });
    }

    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer });
      return NextResponse.json({ success: true, text: result.value.trim() });
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
