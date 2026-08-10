'use client';

import { useState, useCallback } from 'react';

const LANGUAGES = [
  { code: 'en', label: 'Engleză',  flag: '🇬🇧', native: 'English',  serif: false },
  { code: 'it', label: 'Italiană', flag: '🇮🇹', native: 'Italiano', serif: false },
  { code: 'el', label: 'Greacă',   flag: '🇬🇷', native: 'Ελληνικά', serif: true  },
  { code: 'de', label: 'Germană',  flag: '🇩🇪', native: 'Deutsch',  serif: false },
  { code: 'fr', label: 'Franceză', flag: '🇫🇷', native: 'Français', serif: false },
];

function downloadBlob(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

export default function TranslatorPage() {
  const [text, setText] = useState('');
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en', 'it', 'el', 'de', 'fr']);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const toggleLang = (code: string) => {
    setSelectedLangs(prev =>
      prev.includes(code) ? prev.filter(l => l !== code) : [...prev, code]
    );
  };

  const handleTranslate = useCallback(async () => {
    if (!text.trim() || selectedLangs.length === 0) return;
    setLoading(true);
    setError('');
    setTranslations({});
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), languages: selectedLangs }),
      });
      const data = await res.json();
      if (data.success) {
        setTranslations(data.translations);
      } else {
        setError(data.error ?? 'A apărut o eroare');
      }
    } catch {
      setError('Eroare de conexiune la server');
    } finally {
      setLoading(false);
    }
  }, [text, selectedLangs]);

  const copyToClipboard = async (code: string, t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(code);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* ignore */ }
  };

  const handleExportTXT = () => {
    const sep = '═'.repeat(58);
    const lines: string[] = [
      sep,
      'TRADUCERI — generat cu Traducător Română',
      `Data: ${new Date().toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      sep,
      '',
      'ORIGINAL (Română)',
      '─'.repeat(40),
      text,
      '',
    ];
    for (const lang of LANGUAGES.filter(l => translations[l.code])) {
      lines.push(sep);
      lines.push(`${lang.flag}  ${lang.label.toUpperCase()} — ${lang.native}`);
      lines.push('─'.repeat(40));
      lines.push(translations[lang.code]);
      lines.push('');
    }
    downloadBlob('traduceri.txt', lines.join('\n'), 'text/plain;charset=utf-8');
  };

  const handleExportPDF = () => {
    const date = new Date().toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' });

    const langCards = LANGUAGES.filter(l => translations[l.code]).map(lang => `
      <div class="card ${lang.serif ? 'greek' : ''}">
        <div class="card-head">
          <span class="flag">${lang.flag}</span>
          <span class="lang-ro">${lang.label}</span>
          <span class="lang-native">${lang.native}</span>
        </div>
        <div class="card-body">${escapeHtml(translations[lang.code])}</div>
      </div>`).join('');

    const html = `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<title>Traduceri — ${date}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { margin: 2cm; size: A4; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; background:#fff; font-size:12.5px; line-height:1.6; }

  .doc-header { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:2px solid #1a1a2e; padding-bottom:10px; margin-bottom:20px; }
  .doc-title { font-size:18px; font-weight:700; }
  .doc-sub { font-size:11px; color:#777; }
  .doc-date { font-size:11px; color:#777; text-align:right; }

  .original { background:#f7f7f5; border-left:3px solid #C4A35A; padding:12px 14px; margin-bottom:20px; border-radius:0 4px 4px 0; }
  .orig-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#9a7a3a; margin-bottom:6px; }
  .orig-text { font-size:12.5px; }

  .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .card { border:1px solid #d8d8d8; border-radius:6px; overflow:hidden; break-inside:avoid; }
  .card-head { background:#f0f0ef; padding:7px 11px; display:flex; align-items:center; gap:6px; border-bottom:1px solid #d8d8d8; }
  .flag { font-size:15px; }
  .lang-ro { font-weight:700; font-size:11.5px; }
  .lang-native { font-size:10.5px; color:#888; margin-left:3px; }
  .card-body { padding:11px; font-size:12px; }
  .greek .card-body { font-family:'Times New Roman', Georgia, serif; font-size:12.5px; }

  .footer { margin-top:22px; padding-top:8px; border-top:1px solid #e5e5e5; font-size:9.5px; color:#bbb; display:flex; justify-content:space-between; }
  @media print { body{-webkit-print-color-adjust:exact;print-color-adjust:exact} }
</style>
</head>
<body>
<div class="doc-header">
  <div>
    <div class="doc-title">Traduceri din Română</div>
    <div class="doc-sub">EN · IT · EL · DE · FR</div>
  </div>
  <div class="doc-date">${date}</div>
</div>
<div class="original">
  <div class="orig-label">Original — Română</div>
  <div class="orig-text">${escapeHtml(text)}</div>
</div>
<div class="grid">${langCards}</div>
<div class="footer">
  <span>Traducător Română — traducator.vercel.app</span>
  <span>Generat automat · verificați traducerile înainte de utilizare</span>
</div>
<script>setTimeout(()=>{ window.print(); }, 400);</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const hasTranslations = Object.keys(translations).length > 0;
  const orderedLangs = LANGUAGES.filter(l => translations[l.code]);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col">

      {/* ── Header ── */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-blue-600 flex items-center justify-center font-bold text-white text-base">
            RO
          </div>
          <div>
            <h1 className="font-bold text-white text-base">Traducător Română</h1>
            <p className="text-xs text-slate-400 mt-0.5">Română → Engleză · Italiană · Greacă · Germană · Franceză</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-white/5 px-3 py-1.5 rounded-lg border border-white/8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          AI · Claude
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ── Left panel ── */}
        <div className="lg:w-[400px] flex-shrink-0 flex flex-col border-r border-white/10 p-5 gap-4 overflow-y-auto">

          {/* Language toggles */}
          <div className="bg-white/3 rounded-xl p-4 border border-white/8">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-200">Limbi țintă</p>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setSelectedLangs(LANGUAGES.map(l => l.code))} className="text-slate-500 hover:text-slate-300 underline">Toate</button>
                <span className="text-slate-700">·</span>
                <button onClick={() => setSelectedLangs([])} className="text-slate-500 hover:text-slate-300 underline">Niciuna</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => toggleLang(lang.code)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selectedLangs.includes(lang.code)
                      ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                  {lang.code === 'el' && (
                    <span className={`text-[10px] ${selectedLangs.includes(lang.code) ? 'text-indigo-400/70' : 'text-slate-600'}`}>Αα</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Text input */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-200">Text în Română</label>
              {text.trim() && (
                <span className="text-xs text-slate-500">{wordCount} cuv. · {text.length} car.</span>
              )}
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleTranslate(); }}
              placeholder="Introduceți textul în română care trebuie tradus..."
              rows={9}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25 transition-all leading-relaxed"
            />
            <p className="text-xs text-slate-600">Ctrl+Enter pentru a traduce rapid</p>
          </div>

          {/* Translate button */}
          <button
            onClick={handleTranslate}
            disabled={loading || !text.trim() || selectedLangs.length === 0}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                </svg>
                Se traduce în {selectedLangs.length} {selectedLangs.length === 1 ? 'limbă' : 'limbi'}...
              </>
            ) : (
              `Traduce${selectedLangs.length > 0 ? ` (${selectedLangs.length} ${selectedLangs.length === 1 ? 'limbă' : 'limbi'})` : ''}`
            )}
          </button>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Export */}
          {hasTranslations && (
            <div className="bg-white/3 rounded-xl p-4 border border-white/8">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Export</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleExportTXT}
                  className="py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  TXT editabil
                </button>
                <button
                  onClick={handleExportPDF}
                  className="py-2.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  PDF
                </button>
              </div>
              <p className="text-[11px] text-slate-600 mt-2">
                PDF → se deschide tab nou → <span className="text-slate-500">Print → Save as PDF</span>
              </p>
            </div>
          )}

          {/* Tips */}
          <div className="bg-white/3 rounded-xl p-4 border border-white/8 mt-auto">
            <p className="text-xs font-semibold text-slate-400 mb-2.5">Informații</p>
            <ul className="text-[12px] text-slate-500 space-y-1.5">
              <li>• Textul tradus este editabil direct în caseta fiecărei limbi</li>
              <li>• Greaca folosește automat alfabetul grecesc (Ελληνικά)</li>
              <li>• TXT-ul exportat poate fi deschis în Word, Notepad etc.</li>
              <li>• Verificați traducerile înainte de utilizare oficială</li>
            </ul>
          </div>
        </div>

        {/* ── Right panel — results ── */}
        <div className="flex-1 p-5 overflow-y-auto">

          {/* Empty state */}
          {!hasTranslations && !loading && (
            <div className="h-full min-h-[400px] flex items-center justify-center text-center">
              <div>
                <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-4xl">
                  🌍
                </div>
                <p className="text-slate-300 font-semibold mb-2">Traducerile vor apărea aici</p>
                <p className="text-slate-600 text-sm max-w-[260px] leading-relaxed">
                  Introduceți un text în română, selectați limbile și apăsați &quot;Traduce&quot;
                </p>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="h-full min-h-[400px] flex items-center justify-center">
              <div className="text-center">
                <div className="relative w-14 h-14 mx-auto mb-5">
                  <div className="w-14 h-14 border-2 border-indigo-500/20 rounded-full absolute inset-0" />
                  <div className="w-14 h-14 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
                  <div className="absolute inset-0 flex items-center justify-center text-xl">🌐</div>
                </div>
                <p className="text-slate-200 font-semibold mb-1">Se generează traducerile</p>
                <p className="text-slate-500 text-sm">
                  {selectedLangs.length} {selectedLangs.length === 1 ? 'limbă' : 'limbi'} simultan...
                </p>
              </div>
            </div>
          )}

          {/* Translation cards */}
          {hasTranslations && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {orderedLangs.map(lang => {
                const t = translations[lang.code] ?? '';
                const wc = t.trim().split(/\s+/).filter(Boolean).length;
                return (
                  <div key={lang.code} className="bg-white/3 rounded-xl border border-white/8 flex flex-col overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-white/4 border-b border-white/8">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{lang.flag}</span>
                        <span className="text-sm font-bold text-slate-100">{lang.label}</span>
                        <span className="text-xs text-slate-500 font-normal">{lang.native}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(lang.code, t)}
                        className={`text-xs px-2.5 py-1 rounded-md border transition-all ${
                          copied === lang.code
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                        }`}
                      >
                        {copied === lang.code ? '✓ Copiat' : 'Copiază'}
                      </button>
                    </div>

                    {/* Editable textarea */}
                    <textarea
                      value={t}
                      onChange={e => setTranslations(prev => ({ ...prev, [lang.code]: e.target.value }))}
                      rows={7}
                      spellCheck={false}
                      className={`flex-1 w-full bg-transparent px-4 py-3 text-sm text-slate-200 resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all leading-relaxed min-h-[140px] ${
                        lang.serif ? 'font-serif text-[13.5px]' : ''
                      }`}
                    />

                    {/* Footer */}
                    <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[11px] text-slate-600">{wc} cuvinte</span>
                      {lang.code === 'el' && (
                        <span className="text-[11px] text-slate-700">Ελληνικά ·  serif</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
