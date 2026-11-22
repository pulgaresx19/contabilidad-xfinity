import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export default function CompactSelect({ value, onChange, options, placeholder = 'Seleccionar...' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const selected = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full h-8.5 bg-[#16202c] border rounded-xl px-2.5 pr-7 text-xs text-slate-200 font-bold flex items-center justify-between text-left focus:outline-none transition cursor-pointer shadow-xs ${
          open ? 'border-cyan-400 ring-1 ring-cyan-400/30' : 'border-white/10 hover:border-white/20'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected ? selected.shortLabel || selected.label : placeholder}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-150 ${
            open ? 'rotate-180 text-cyan-400' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 bg-[#16202c] border border-cyan-500/40 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-white/5 max-h-56 overflow-y-auto animate-fade-in"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-2.5 py-2 text-[11px] flex items-center justify-between gap-1.5 transition cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-500/15 text-cyan-300 font-bold'
                    : 'text-slate-200 hover:bg-white/5 font-medium'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate leading-tight">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-[9.5px] text-slate-400 font-mono truncate leading-tight mt-0.5">
                      {opt.sublabel}
                    </div>
                  )}
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0 stroke-[2.5]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
