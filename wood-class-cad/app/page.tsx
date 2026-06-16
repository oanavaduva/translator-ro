'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ProductParams } from '@/lib/types';

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
  'Plintă 5cm, profil drept, wenge, 2m lungime',
  'Cornișă clasică 12cm x 10cm, nuc, 2.5m',
];

export default function Home() {
  const [description, setDescription] = useState('');
  const [params, setParams] = useState<ProductParams | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-bold text-sm">
            W
          </div>
          <div>
            <h1 className="font-semibold text-white text-sm">Wood Class · Text to CAD</h1>
            <p className="text-xs text-slate-400">Generare modele 3D din descriere text</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          Export: OBJ · DAE · STL
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Left panel */}
        <div className="lg:w-[420px] flex-shrink-0 flex flex-col border-r border-white/10 p-5 gap-5 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Descriere produs
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ex: Plintă 7cm înălțime, 1.2cm grosime, 2.4m lungime, profil clasic, finisaj stejar natural..."
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all"
            />
            <p className="text-xs text-slate-500 mt-1.5">Ctrl+Enter pentru a genera</p>
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
              'Generează model 3D'
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
                  Descrie un produs în câmpul din stânga și apasă &ldquo;Generează&rdquo;
                </p>
              </div>
            </div>
          )}
          <ThreeViewer params={params} />
        </div>
      </main>
    </div>
  );
}
