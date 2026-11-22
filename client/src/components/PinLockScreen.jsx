import React, { useState } from 'react';
import { Lock, Cable, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';
import { unlockAppWithPin } from '../utils/pinAuth';

export default function PinLockScreen({ onUnlocked }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handlePinChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPin(val);
    if (error) setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin.length < 6) {
      setError('Ingresa el código completo de 6 cifras.');
      return;
    }
    if (unlockAppWithPin(pin)) {
      if (onUnlocked) onUnlocked();
    } else {
      setError('Código PIN incorrecto. Verifica e intenta nuevamente.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0b1017] text-slate-100 flex flex-col items-center justify-center p-5 select-none">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-[#131b26] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5 animate-fade-in"
      >
        {/* Marca superior */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/25">
            <Cable className="h-6 w-6 stroke-[2.5]" />
          </div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-black text-white tracking-tight">Xfinity Tech</h1>
            <span className="text-[9.5px] font-black uppercase px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              PRO
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-[260px]">
            Ingresa el PIN de 6 cifras para autorizar este dispositivo por única vez.
          </p>
        </div>

        {/* Input de PIN */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-center gap-1.5">
            <Lock className="h-3 w-3 text-cyan-400" />
            <span>Código PIN de Acceso</span>
          </label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            placeholder="• • • • • •"
            value={pin}
            onChange={handlePinChange}
            className="w-full h-12 bg-[#0f1722] border border-white/15 focus:border-cyan-400 rounded-2xl px-4 text-center text-xl font-mono font-black tracking-[0.45em] text-cyan-300 placeholder-slate-600 focus:outline-none shadow-inner transition"
          />

          {error && (
            <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 animate-fade-in">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Botón Desbloquear */}
        <button
          type="submit"
          disabled={pin.length < 6}
          className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-98 transition cursor-pointer"
        >
          <span>Autorizar Dispositivo</span>
          <ArrowRight className="h-4 w-4 stroke-[2.5]" />
        </button>

        <div className="pt-1 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-medium">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" />
          <span>Verificación cifrada SHA-256 · Solo se solicita la 1.ª vez</span>
        </div>
      </form>
    </div>
  );
}
