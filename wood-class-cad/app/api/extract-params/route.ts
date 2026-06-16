import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic();

const SYSTEM_PROMPT = `Ești un expert în produse de construcții și finisaje interioare din polimer.
Sarcina ta este să extragi parametrii tehnici din descrierea unui produs Wood Class România.
Returnează EXCLUSIV un JSON valid, fără text suplimentar, fără markdown, fără explicații.`;

const USER_PROMPT = (description: string) => `Descriere produs: "${description}"

Returnează exact acest JSON (înlocuiește valorile cu cele extrase):
{
  "productType": "plinta",
  "height": 70,
  "thickness": 12,
  "width": 180,
  "length": 2400,
  "profileStyle": "classical",
  "finish": "stejar natural",
  "color": "#C4A35A"
}

Reguli stricte:
- productType: "plinta" dacă e plintă/skirting/bordură podea | "cornisa" dacă e cornișă/tavan | "pardoseala_spc" dacă e pardoseală/SPC/LVT/vinil/PVC
- Dacă nu se poate determina → "plinta"
- Toate dimensiunile în milimetri (mm)
- Defaulturi: plintă height=70 thickness=12 length=2400 | cornișă height=100 thickness=80 length=2400 | pardoseală width=180 thickness=8 length=1220
- profileStyle: "straight" | "rounded" | "stepped" | "classical" | "modern"
- color hex: stejar=#C4A35A | stejar gri=#8B8B7A | stejar închis=#7A5C30 | wenge=#3D2B1F | alb=#F5F5F0 | gri=#9E9EA0 | nuc=#5C4033 | bambus=#D4C07A | antracit=#3A3A3C
- width este obligatoriu DOAR pentru pardoseala_spc`;

export async function POST(request: NextRequest) {
  try {
    const { description } = await request.json();

    if (!description || typeof description !== 'string') {
      return NextResponse.json({ success: false, error: 'Descrierea lipsește' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_PROMPT(description) }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ success: false, error: 'Nu s-a putut parsa răspunsul' }, { status: 400 });
    }

    const params = JSON.parse(jsonMatch[0]);

    // Validate and set sensible defaults
    if (!params.productType) params.productType = 'plinta';
    if (!params.height || params.height <= 0) params.height = params.productType === 'cornisa' ? 100 : 70;
    if (!params.thickness || params.thickness <= 0) params.thickness = 12;
    if (!params.length || params.length <= 0) params.length = 2400;
    if (!params.profileStyle) params.profileStyle = 'classical';
    if (!params.finish) params.finish = 'polimer natur';
    if (!params.color) params.color = '#C4A35A';
    if (params.productType === 'pardoseala_spc' && (!params.width || params.width <= 0)) {
      params.width = 180;
    }

    return NextResponse.json({ success: true, params });
  } catch (error) {
    console.error('extract-params error:', error);
    return NextResponse.json({ success: false, error: 'Eroare server' }, { status: 500 });
  }
}
