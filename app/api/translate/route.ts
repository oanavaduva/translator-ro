import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic();

const LANG_LABELS: Record<string, string> = {
  en: 'English',
  it: 'Italiană',
  el: 'Greacă — OBLIGATORIU cu alfabet grecesc (Ελληνικά), NU transliterare latină',
  de: 'Germană',
  fr: 'Franceză',
};

export async function POST(request: NextRequest) {
  try {
    const { text, languages } = await request.json();

    if (!text?.trim()) {
      return NextResponse.json({ success: false, error: 'Textul lipsește' }, { status: 400 });
    }
    if (!Array.isArray(languages) || languages.length === 0) {
      return NextResponse.json({ success: false, error: 'Nicio limbă selectată' }, { status: 400 });
    }

    const targets = (languages as string[]).filter(l => LANG_LABELS[l]);
    if (targets.length === 0) {
      return NextResponse.json({ success: false, error: 'Limbă invalidă' }, { status: 400 });
    }

    const langList = targets
      .map(l => `  "${l}": "<traducerea completă în ${LANG_LABELS[l]}>"`)
      .join(',\n');

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `Ești un traducător profesionist expert. Sarcina ta: traduce textul următor din ROMÂNĂ în toate limbile solicitate.

REGULI STRICTE:
1. Returnează EXCLUSIV un JSON valid — fără markdown, fără explicații, fără text în afara JSON-ului.
2. Greaca TREBUIE scrisă cu caractere grecești Unicode (α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω). NU folosi transliterare latină.
3. Respectă tonul, stilul și structura originalului.
4. Traducere completă — nu omite nimic.

TEXT SURSĂ (Română):
"""
${text}
"""

Returnează EXACT acest JSON (completează valorile cu traducerile reale):
{
${langList}
}`,
      }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ success: false, error: 'Eroare la procesarea răspunsului AI' }, { status: 500 });
    }

    const translations = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, translations });
  } catch (error) {
    console.error('translate error:', error);
    return NextResponse.json({ success: false, error: 'Eroare server' }, { status: 500 });
  }
}
