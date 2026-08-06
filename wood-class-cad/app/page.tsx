'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ProductParams, ProductType, ProfileStyle, RiflajType, MiterType } from '@/lib/types';

const ThreeViewer = dynamic(() => import('@/components/ThreeViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center rounded-xl border border-white/10 bg-[#1a1a2e] min-h-[300px]">
      <div className="text-slate-400 text-sm animate-pulse">Se încarcă vizualizatorul 3D...</div>
    </div>
  ),
});

const EXAMPLES = [
  'Plintă 7cm înălțime, 1.2cm grosime, 2.4m lungime, profil clasic, finisaj stejar natural',
  'Cornișă 10cm x 8cm, 3m, profil modern, culoare albă',
  'Pardoseală SPC 8mm grosime, 18cm lățime, stejar gri antichizat, 1.22m lungime',
  'Riflaj RM 12cm lățime, 18mm grosime, 2.4m lungime, stejar natur',
  'Plintă 5cm, profil drept, wenge, 2m lungime',
];

const SKETCH_ACCEPT = '.jpg,.jpeg,.png,.pdf,.cdr';
const TEXTURE_ACCEPT = 'image/*';
const TEXTURE_MAX_DIM = 1024;

// Decodes whatever raster format the browser supports and re-encodes it as a capped-size JPEG
// data URL — this is the "convert to the format needed for implementation" step: a single format
// (JPEG data URL) that THREE.TextureLoader and the OBJ/DAE exporters below can all consume directly,
// without round-tripping the (potentially huge) original photo through a server request.
async function normalizeTextureImage(file: File): Promise<string> {
  const rawDataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Nu s-a putut citi fișierul'));
    reader.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Format de imagine necunoscut'));
    image.src = rawDataUrl;
  });

  const scale = Math.min(1, TEXTURE_MAX_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponibil în acest browser');
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL('image/jpeg', 0.85);
}

const DEFAULT_PARAMS: ProductParams = {
  productType: 'plinta',
  height: 70,
  thickness: 12,
  length: 2400,
  profileStyle: 'classical',
  finish: 'polimer natur',
  color: '#C4A35A',
};

function defaultsForType(type: ProductType): Partial<ProductParams> {
  if (type === 'cornisa') return { height: 100, thickness: 80, length: 2400 };
  if (type === 'pardoseala_spc') return { width: 180, thickness: 8, length: 1220 };
  if (type === 'riflaj') return { width: 120, thickness: 18, length: 2400, height: 18, riflajType: 'RM' };
  return { height: 70, thickness: 12, length: 2400 };
}

export default function Home() {
  const [description, setDescription] = useState('');
  const [params, setParams] = useState<ProductParams | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [sketchName, setSketchName] = useState('');
  const [sketchSvg, setSketchSvg] = useState<string | null>(null);
  const [sketchLoading, setSketchLoading] = useState(false);
  const [sketchError, setSketchError] = useState('');

  const [textureName, setTextureName] = useState('');
  const [textureDataUrl, setTextureDataUrl] = useState<string | null>(null);
  const [textureLoading, setTextureLoading] = useState(false);
  const [textureError, setTextureError] = useState('');

  const [secondaryTextureName, setSecondaryTextureName] = useState('');
  const [secondaryTextureDataUrl, setSecondaryTextureDataUrl] = useState<string | null>(null);
  const [secondaryTextureLoading, setSecondaryTextureLoading] = useState(false);
  const [secondaryTextureError, setSecondaryTextureError] = useState('');

  const [miterType, setMiterType] = useState<MiterType>('none');

  const handleExtract = useCallback(async (text?: string) => {
    const input = text ?? description;
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/extract-params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: input }),
      });
      const data = await res.json();
      if (data.success) {
        setParams(data.params);
      } else {
        setError(data.error ?? 'A apărut o eroare');
      }
    } catch {
      setError('Eroare de conexiune la server');
    } finally {
      setLoading(false);
    }
  }, [description]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleExtract();
    }
  };

  const applyExample = (ex: string) => {
    setDescription(ex);
    handleExtract(ex);
  };

  const handleSketchUpload = useCallback(async (file: File) => {
    setSketchLoading(true);
    setSketchError('');
    setSketchName(file.name);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/convert-sketch', { method: 'POST', body });
      const data = await res.json();
      if (data.success) {
        setSketchSvg(data.svg);
        setParams(prev => prev ?? DEFAULT_PARAMS);
      } else {
        setSketchSvg(null);
        setSketchError(data.error ?? 'Nu s-a putut converti schița');
      }
    } catch {
      setSketchSvg(null);
      setSketchError('Eroare de conexiune la server');
    } finally {
      setSketchLoading(false);
    }
  }, []);

  const clearSketch = () => {
    setSketchName('');
    setSketchSvg(null);
    setSketchError('');
  };

  const handleTextureUpload = useCallback(async (file: File) => {
    setTextureLoading(true);
    setTextureError('');
    setTextureName(file.name);
    try {
      const dataUrl = await normalizeTextureImage(file);
      setTextureDataUrl(dataUrl);
      setParams(prev => prev ?? DEFAULT_PARAMS);
    } catch (err) {
      setTextureDataUrl(null);
      setTextureError(err instanceof Error ? err.message : 'Nu s-a putut încărca textura');
    } finally {
      setTextureLoading(false);
    }
  }, []);

  const clearTexture = () => {
    setTextureName('');
    setTextureDataUrl(null);
    setTextureError('');
  };

  const handleSecondaryTextureUpload = useCallback(async (file: File) => {
    setSecondaryTextureLoading(true);
    setSecondaryTextureError('');
    setSecondaryTextureName(file.name);
    try {
      const dataUrl = await normalizeTextureImage(file);
      setSecondaryTextureDataUrl(dataUrl);
    } catch (err) {
      setSecondaryTextureDataUrl(null);
      setSecondaryTextureError(err instanceof Error ? err.message : 'Nu s-a putut încărca textura');
    } finally {
      setSecondaryTextureLoading(false);
    }
  }, []);

  const clearSecondaryTexture = () => {
    setSecondaryTextureName('');
    setSecondaryTextureDataUrl(null);
    setSecondaryTextureError('');
  };

  const updateParams = (patch: Partial<ProductParams>) => {
    setParams(prev => ({ ...(prev ?? DEFAULT_PARAMS), ...patch }));
  };

  const activeType = params?.productType ?? DEFAULT_PARAMS.productType;

  const viewerParams: ProductParams | null = params
    ? {
        ...params,
        customProfileSvg: sketchSvg ?? undefined,
        textureDataUrl: textureDataUrl ?? undefined,
        secondaryTextureDataUrl: secondaryTextureDataUrl ?? undefined,
        miterType,
      }
    : null;

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-bold text-sm">
            W
          </div>
          <div>
            <h1 className="font-semibold text-white text-sm">Wood Class · Imagine to CAD</h1>
            <p className="text-xs text-slate-400">Generare schițe CAD și modele 3D din imagine (text opțional)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          Export: OBJ · DAE · STL · DXF
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Left panel */}
        <div className="lg:w-[420px] flex-shrink-0 flex flex-col border-r border-white/10 p-5 gap-5 overflow-y-auto">
          {/* Image / sketch upload — primary entry point */}
          <div className="bg-white/3 rounded-xl p-4 border border-amber-500/20">
            <label className="block text-sm font-medium text-slate-200 mb-1.5">
              Imagine profil
            </label>
            <p className="text-xs text-slate-500 mb-2.5">
              Încarcă o imagine sau schiță a secțiunii (JPG, PNG, PDF sau CDR) — schița CAD și modelul 3D se generează automat din formă. Ajustează dimensiunile mai jos.
            </p>
            <input
              type="file"
              accept={SKETCH_ACCEPT}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleSketchUpload(file);
                e.target.value = '';
              }}
              className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-amber-500/20 file:text-amber-400 file:text-xs file:font-medium hover:file:bg-amber-500/30 file:cursor-pointer cursor-pointer"
            />
            {sketchLoading && (
              <p className="text-xs text-amber-400 mt-2 animate-pulse">Se convertește imaginea...</p>
            )}
            {sketchError && (
              <p className="text-xs text-red-400 mt-2">{sketchError}</p>
            )}
            {sketchSvg && !sketchLoading && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-emerald-400">✓ {sketchName} — profil aplicat</span>
                <button onClick={clearSketch} className="text-xs text-slate-500 hover:text-slate-300 underline">
                  Elimină
                </button>
              </div>
            )}
          </div>

          {/* Manual dimensions — always editable, independent of text */}
          <div className="bg-white/3 rounded-xl p-4 border border-white/5">
            <label className="block text-sm font-medium text-slate-300 mb-2.5">
              Dimensiuni produs
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Tip produs</label>
                <select
                  value={activeType}
                  onChange={e => {
                    const productType = e.target.value as ProductType;
                    updateParams({ ...defaultsForType(productType), productType });
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                >
                  <option value="plinta">Plintă</option>
                  <option value="cornisa">Cornișă</option>
                  <option value="pardoseala_spc">Pardoseală SPC</option>
                  <option value="riflaj">Riflaj</option>
                </select>
              </div>

              {/* Riflaj subtype selector */}
              {activeType === 'riflaj' && (
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Tip riflaj</label>
                  <select
                    value={params?.riflajType ?? 'RM'}
                    onChange={e => updateParams({ riflajType: e.target.value as RiflajType })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="RM">RM — riflaj dreptunghiular standard</option>
                    <option value="RM-XL">RM-XL — riflaj dreptunghiular mare</option>
                    <option value="RS">RS — riflaj trapezoidal</option>
                    <option value="RX">RX — riflaj în trepte</option>
                  </select>
                </div>
              )}

              {/* Width: pardoseala_spc and riflaj; Height: plinta/cornisa */}
              {(activeType === 'pardoseala_spc' || activeType === 'riflaj') ? (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Lățime (mm)</label>
                  <input
                    type="number"
                    value={params?.width ?? (activeType === 'riflaj' ? 120 : 180)}
                    onChange={e => updateParams({ width: Number(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Înălțime (mm)</label>
                  <input
                    type="number"
                    value={params?.height ?? DEFAULT_PARAMS.height}
                    onChange={e => updateParams({ height: Number(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-500 mb-1">Grosime (mm)</label>
                <input
                  type="number"
                  value={params?.thickness ?? DEFAULT_PARAMS.thickness}
                  onChange={e => updateParams({ thickness: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Lungime (mm)</label>
                <input
                  type="number"
                  value={params?.length ?? DEFAULT_PARAMS.length}
                  onChange={e => updateParams({ length: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Tăiere capăt (45°)</label>
                <div className="flex gap-1.5">
                  {([
                    { value: 'none',     label: '| Drept',       title: 'Capăt drept (fără tăiere)' },
                    { value: 'interior', label: '◤ Interior',    title: 'Tăiere 45° — colț interior (concav)' },
                    { value: 'exterior', label: '◥ Exterior',    title: 'Tăiere 45° — colț exterior (convex)' },
                  ] as { value: MiterType; label: string; title: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      title={opt.title}
                      onClick={() => setMiterType(opt.value)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                        miterType === opt.value
                          ? 'bg-amber-500/30 border-amber-500/60 text-amber-300'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  {activeType === 'riflaj' ? 'Culoare 1 (bază)' : 'Culoare'}
                </label>
                <input
                  type="color"
                  value={params?.color ?? DEFAULT_PARAMS.color}
                  onChange={e => updateParams({ color: e.target.value })}
                  className="w-full h-[38px] bg-white/5 border border-white/10 rounded-lg cursor-pointer"
                />
              </div>

              {/* Secondary color + optional texture — only for riflaj (rib tops / folie decor) */}
              {activeType === 'riflaj' && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Culoare 2 (vârfuri riflaje)</label>
                  <input
                    type="color"
                    value={params?.secondaryColor ?? '#8B6914'}
                    onChange={e => updateParams({ secondaryColor: e.target.value })}
                    className="w-full h-[38px] bg-white/5 border border-white/10 rounded-lg cursor-pointer"
                  />
                </div>
              )}
              {activeType === 'riflaj' && (
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">
                    Textură folie decor (opțional — înlocuiește Culoare 2)
                  </label>
                  <input
                    type="file"
                    accept={TEXTURE_ACCEPT}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleSecondaryTextureUpload(file);
                      e.target.value = '';
                    }}
                    className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-500/20 file:text-amber-400 file:text-xs file:font-medium hover:file:bg-amber-500/30 file:cursor-pointer cursor-pointer"
                  />
                  {secondaryTextureLoading && (
                    <p className="text-xs text-amber-400 mt-1.5 animate-pulse">Se procesează folie...</p>
                  )}
                  {secondaryTextureError && (
                    <p className="text-xs text-red-400 mt-1.5">{secondaryTextureError}</p>
                  )}
                  {secondaryTextureDataUrl && !secondaryTextureLoading && (
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <span className="text-xs text-amber-400 flex items-center gap-2 truncate">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={secondaryTextureDataUrl} alt="" className="w-5 h-5 rounded object-cover border border-white/20 flex-shrink-0" />
                        <span className="truncate">✓ {secondaryTextureName}</span>
                      </span>
                      <button onClick={clearSecondaryTexture} className="text-xs text-slate-500 hover:text-slate-300 underline flex-shrink-0">
                        Elimină
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeType !== 'pardoseala_spc' && activeType !== 'riflaj' && (
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Profil (dacă nu ai încărcat o imagine)</label>
                  <select
                    value={params?.profileStyle ?? DEFAULT_PARAMS.profileStyle}
                    onChange={e => updateParams({ profileStyle: e.target.value as ProfileStyle })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="straight">Drept</option>
                    <option value="rounded">Rotund</option>
                    <option value="stepped">În trepte</option>
                    <option value="classical">Clasic</option>
                    <option value="modern">Modern</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Texture upload — applies to all product types; overrides solid color on model + exports */}
          <div className="bg-white/3 rounded-xl p-4 border border-white/5">
            <label className="block text-sm font-medium text-slate-200 mb-1.5">
              Textură (opțional)
            </label>
            <p className="text-xs text-slate-500 mb-2.5">
              Încarcă o poză cu textura reală (lemn, gri antichizat etc.) — se aplică pe model și în exporturi, în locul culorii solide.
            </p>
            <input
              type="file"
              accept={TEXTURE_ACCEPT}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleTextureUpload(file);
                e.target.value = '';
              }}
              className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-500/20 file:text-emerald-400 file:text-xs file:font-medium hover:file:bg-emerald-500/30 file:cursor-pointer cursor-pointer"
            />
            {textureLoading && (
              <p className="text-xs text-emerald-400 mt-2 animate-pulse">Se procesează textura...</p>
            )}
            {textureError && (
              <p className="text-xs text-red-400 mt-2">{textureError}</p>
            )}
            {textureDataUrl && !textureLoading && (
              <div className="flex items-center justify-between mt-2 gap-2">
                <span className="text-xs text-emerald-400 flex items-center gap-2 truncate">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={textureDataUrl} alt="" className="w-6 h-6 rounded object-cover border border-white/20 flex-shrink-0" />
                  <span className="truncate">✓ {textureName} — textură aplicată</span>
                </span>
                <button onClick={clearTexture} className="text-xs text-slate-500 hover:text-slate-300 underline flex-shrink-0">
                  Elimină
                </button>
              </div>
            )}
          </div>

          {/* Text description — optional */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Descriere text (opțional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ex: Plintă 7cm înălțime, 1.2cm grosime, 2.4m lungime, profil clasic, finisaj stejar natural..."
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all"
            />
            <p className="text-xs text-slate-500 mt-1.5">Ctrl+Enter pentru a extrage parametrii din text</p>
          </div>

          <button
            onClick={() => handleExtract()}
            disabled={loading || !description.trim()}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                </svg>
                Extrage parametrii...
              </>
            ) : (
              'Extrage parametri din descriere'
            )}
          </button>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-slate-400 mb-2.5 uppercase tracking-wider">Exemple rapide</p>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => applyExample(ex)}
                  className="text-left text-xs text-slate-400 hover:text-slate-200 bg-white/3 hover:bg-white/8 border border-white/5 hover:border-white/15 rounded-lg px-3 py-2.5 transition-all leading-relaxed"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Workflow guide */}
          <div className="mt-auto bg-white/3 rounded-xl p-4 border border-white/5">
            <p className="text-xs font-semibold text-slate-300 mb-3">Workflow recomandat</p>
            <ol className="text-xs text-slate-400 space-y-2 list-none">
              {[
                ['OBJ → Blender', 'Import OBJ, aplică textură din biblioteca noastră, render Cycles/EEVEE'],
                ['DAE → SketchUp', 'File → Import → DAE, apoi V-Ray sau Enscape pentru randări'],
                ['STL → CNC', 'Verificare profil, frezare sau imprimare 3D'],
                ['DXF → AutoCAD', 'Schiță 2D a secțiunii pentru documentație tehnică'],
              ].map(([title, desc], i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                  <span>
                    <span className="text-slate-300 font-medium">{title}</span>
                    <span className="text-slate-500"> — {desc}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Right panel – 3D viewer */}
        <div className="flex-1 p-5 flex flex-col min-h-[500px]">
          {!params && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center pointer-events-none">
              <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <svg className="w-10 h-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                </svg>
              </div>
              <div>
                <p className="text-slate-500 font-medium mb-1">Preview 3D</p>
                <p className="text-slate-600 text-sm max-w-[260px]">
                  Încarcă o imagine cu profilul sau ajustează dimensiunile din stânga pentru a genera modelul
                </p>
              </div>
            </div>
          )}
          <ThreeViewer params={viewerParams} />
        </div>
      </main>
    </div>
  );
}
