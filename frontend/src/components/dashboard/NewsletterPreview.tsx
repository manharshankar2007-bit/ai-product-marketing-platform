import { useState, useEffect, useRef } from 'react';
import {
  Eye,
  Code,
  Copy,
  Check,
  Download,
  FileCode,
  Mail,
  Palette,
  Pencil,
  Sparkles,
} from 'lucide-react';
import type { NewsletterJson } from '@/lib/api';
import { NewsletterEditForm } from './NewsletterEditForm';

interface NewsletterPreviewProps {
  htmlCode: string;
  markdownCode: string;
  /** When both are supplied, an "Edit" tab appears letting the user modify the structured content directly — omit for read-only previews (e.g. the combined digest, which has no single newsletter to edit). */
  newsletter?: NewsletterJson;
  onNewsletterChange?: (updated: NewsletterJson) => void;
}

type AccentTheme = 'pidge-violet' | 'forest-green' | 'royal-sapphire' | 'enterprise-slate';

const THEME_SPECS: Record<AccentTheme, {
  name: string;
  color: string;
  gradient: string;
  primaryHex: string;
}> = {
  'pidge-violet': {
    name: 'Pidge Violet',
    color: 'bg-violet-600',
    gradient: 'from-violet-600 to-indigo-600',
    primaryHex: '#6366f1'
  },
  'forest-green': {
    name: 'Forest Green',
    color: 'bg-emerald-600',
    gradient: 'from-emerald-600 to-teal-600',
    primaryHex: '#10b981'
  },
  'royal-sapphire': {
    name: 'Royal Sapphire',
    color: 'bg-blue-600',
    gradient: 'from-blue-600 to-indigo-600',
    primaryHex: '#3b82f6'
  },
  'enterprise-slate': {
    name: 'Enterprise Slate',
    color: 'bg-slate-700',
    gradient: 'from-slate-700 to-slate-900',
    primaryHex: '#475569'
  }
};

export default function NewsletterPreview({ htmlCode, markdownCode, newsletter, onNewsletterChange }: NewsletterPreviewProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'edit' | 'html' | 'markdown'>('preview');
  const canEdit = Boolean(newsletter && onNewsletterChange);
  const [selectedTheme, setSelectedTheme] = useState<AccentTheme>('pidge-violet');
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Apply selected theme colors dynamically into the generated HTML code
  const getThemedHtml = () => {
    let output = htmlCode;
    const theme = THEME_SPECS[selectedTheme];
    
    // Replace standard Pidge violet (#6366f1) or indigo (#4f46e5) with selected theme hexes
    output = output.replace(/#6366f1/g, theme.primaryHex);
    output = output.replace(/#4f46e5/g, theme.primaryHex);
    
    return output;
  };

  useEffect(() => {
    if (activeTab === 'preview' && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(getThemedHtml());
        doc.close();
      }
    }
  }, [htmlCode, selectedTheme, activeTab]);

  const handleCopy = async () => {
    try {
      const textToCopy = activeTab === 'markdown' ? markdownCode : getThemedHtml();

      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handleDownload = () => {
    const isHtml = activeTab !== 'markdown';
    const content = isHtml ? getThemedHtml() : markdownCode;
    const extension = isHtml ? 'html' : 'md';
    const mimeType = isHtml ? 'text/html' : 'text/markdown';
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pidge-newsletter-update.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white border-4 border-black overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border-b-4 border-black gap-3 text-black">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#7C3AED]/10 border-2 border-black rounded text-[#7C3AED]">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-black text-[#1A1A1A] uppercase text-lg tracking-tight flex items-center gap-1.5">
              Marketing Newsletter Output
              <Sparkles className="w-4 h-4 text-[#7C3AED]" />
            </h3>
            <p className="text-[11px] text-gray-600 font-bold uppercase">Review, customize brand parameters, and export your polished release</p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-white p-1 border-2 border-black self-start sm:self-auto shrink-0 font-mono text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-bold uppercase transition-all cursor-pointer ${
              activeTab === 'preview' ? 'bg-[#7C3AED] text-white border border-black' : 'text-gray-700 hover:text-black'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Interactive View</span>
          </button>
          {canEdit && (
            <button
              onClick={() => setActiveTab('edit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-bold uppercase transition-all cursor-pointer ${
                activeTab === 'edit' ? 'bg-[#7C3AED] text-white border border-black' : 'text-gray-700 hover:text-black'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('html')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-bold uppercase transition-all cursor-pointer ${
              activeTab === 'html' ? 'bg-[#7C3AED] text-white border border-black' : 'text-gray-700 hover:text-black'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>HTML Code</span>
          </button>
          <button
            onClick={() => setActiveTab('markdown')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-bold uppercase transition-all cursor-pointer ${
              activeTab === 'markdown' ? 'bg-[#7C3AED] text-white border border-black' : 'text-gray-700 hover:text-black'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Markdown</span>
          </button>
        </div>
      </div>

      {/* Customizer Sub-Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between px-5 py-3.5 bg-[#F3F4F6] border-b-2 border-black gap-4 text-black">
        {/* Brand palette selector */}
        <div className="flex items-center gap-3">
          <Palette className="w-4 h-4 text-black" />
          <span className="text-xs font-black uppercase text-black">Accent Palette:</span>
          <div className="flex items-center gap-2">
            {(Object.keys(THEME_SPECS) as AccentTheme[]).map((themeKey) => {
              const spec = THEME_SPECS[themeKey];
              const isSelected = selectedTheme === themeKey;
              return (
                <button
                  key={themeKey}
                  onClick={() => setSelectedTheme(themeKey)}
                  className={`group relative flex items-center justify-center p-1 rounded-full border transition-all ${
                    isSelected ? 'border-2 border-black scale-110 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'border-transparent hover:border-gray-500'
                  }`}
                  title={spec.name}
                >
                  <span className={`w-4 h-4 rounded-full ${spec.color} border border-black/30`} />
                  {isSelected && (
                    <span className="absolute -top-8 px-1.5 py-0.5 text-[10px] font-sans font-bold text-white bg-black whitespace-nowrap border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] scale-100 pointer-events-none uppercase">
                      {spec.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Copy/Download Action controls */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3.5 py-1.5 border-2 border-black bg-white text-black hover:bg-[#F3F4F6] transition-all text-xs font-black uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                <span className="text-emerald-600">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Content</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3.5 py-1.5 border-2 border-black bg-[#E0FF00] text-black hover:bg-[#d3f200] transition-all text-xs font-black uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .{activeTab === 'markdown' ? 'md' : 'html'}</span>
          </button>
        </div>
      </div>

      {/* Main Display Viewport */}
      <div className="flex flex-1 flex-col bg-gray-100 p-4 overflow-hidden relative min-h-[480px]">
        {activeTab === 'preview' ? (
          <div className="w-full flex-1 min-h-0 border-4 border-black bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col">
            {/* Mock Email Client Header */}
            <div className="px-4 py-2 bg-white border-b-2 border-black flex items-center justify-between text-xs text-black font-sans">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 border border-black" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 border border-black" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 border border-black" />
                <span className="ml-2 text-black font-black font-mono text-[10px] uppercase">TO: product-updates@pidge.co</span>
              </div>
              <span className="text-[10px] text-black font-black uppercase">✨ Generated Release Digest</span>
            </div>
            
            {/* The actual HTML Newsletter Iframe sandbox */}
            <iframe
              ref={iframeRef}
              title="Newsletter Sandbox Viewport"
              className="w-full flex-1 border-0 bg-white"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : activeTab === 'html' ? (
          <div className="relative w-full flex-1 min-h-0">
            <textarea
              readOnly
              value={getThemedHtml()}
              className="w-full h-full min-h-[440px] font-mono text-xs bg-white text-black p-4 border-4 border-black resize-none outline-none focus:border-[#7C3AED] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] select-all"
            />
            <span className="absolute bottom-3 right-3 text-[10px] font-mono font-black uppercase text-black bg-[#E0FF00] border-2 border-black px-2 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              HTML Format
            </span>
          </div>
        ) : activeTab === 'markdown' ? (
          <div className="relative w-full flex-1 min-h-0">
            <textarea
              readOnly
              value={markdownCode}
              className="w-full h-full min-h-[440px] font-mono text-xs bg-white text-black p-4 border-4 border-black resize-none outline-none focus:border-[#7C3AED] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] select-all"
            />
            <span className="absolute bottom-3 right-3 text-[10px] font-mono font-black uppercase text-black bg-[#E0FF00] border-2 border-black px-2 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              Markdown Format
            </span>
          </div>
        ) : activeTab === 'edit' && newsletter && onNewsletterChange ? (
          <NewsletterEditForm newsletter={newsletter} onChange={onNewsletterChange} />
        ) : null}
      </div>
    </div>
  );
}
