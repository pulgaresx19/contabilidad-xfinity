import React, { useState, useEffect } from 'react';
import { X, Settings, Save, Check, Calendar, DollarSign, ShieldCheck, HelpCircle } from 'lucide-react';

const CLOSING_DAY_OPTIONS = [
  {
    id: '0',
    dayName: 'Domingo',
    period: 'Lunes a Domingo',
    tag: 'Estándar General',
    desc: 'Cierre domingo a medianoche. Semana laboral de lunes a domingo.'
  },
  {
    id: '5',
    dayName: 'Viernes',
    period: 'Sábado a Viernes',
    tag: 'Frecuente en Comcast',
    desc: 'Cierre los viernes al final del día. Semana de sábado a viernes.'
  },
  {
    id: '4',
    dayName: 'Jueves',
    period: 'Viernes a Jueves',
    tag: 'Corte Jueves',
    desc: 'Cierre los jueves. Semana laboral de viernes a jueves.'
  },
  {
    id: '6',
    dayName: 'Sábado',
    period: 'Domingo a Sábado',
    tag: 'Fin de Semana',
    desc: 'Cierre los sábados. Semana laboral de domingo a sábado.'
  },
  {
    id: '3',
    dayName: 'Miércoles',
    period: 'Jueves a Miércoles',
    tag: 'Mitad de Semana',
    desc: 'Cierre los miércoles. Semana de jueves a miércoles.'
  }
];

export default function SettingsModal({ isOpen, onClose, onSettingsSaved }) {
  const [settings, setSettings] = useState({
    tech_default: 'Javier (P0G1)',
    base_rate: '100.00',
    bore_dw_bonus: '30.00',
    cutoff_day: '0'
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/settings')
        .then((res) => res.json())
        .then((data) => {
          if (data && Object.keys(data).length > 0) {
            // Normalize cutoff_day to string id
            let cutoffVal = data.cutoff_day;
            if (cutoffVal === 'Sunday') cutoffVal = '0';
            else if (cutoffVal === 'Friday') cutoffVal = '5';
            else if (cutoffVal === 'Thursday') cutoffVal = '4';
            else if (cutoffVal === 'Saturday') cutoffVal = '6';
            else if (cutoffVal === 'Wednesday') cutoffVal = '3';
            else if (!cutoffVal) cutoffVal = '0';

            setSettings({
              tech_default: data.tech_default || 'Javier (P0G1)',
              base_rate: data.base_rate || '100.00',
              bore_dw_bonus: data.bore_dw_bonus || '30.00',
              cutoff_day: String(cutoffVal)
            });
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentOption = CLOSING_DAY_OPTIONS.find(o => o.id === String(settings.cutoff_day)) || CLOSING_DAY_OPTIONS[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tech_default: settings.tech_default,
          base_rate: settings.base_rate,
          bore_dw_bonus: settings.bore_dw_bonus,
          cutoff_day: settings.cutoff_day
        })
      });

      if (res.ok) {
        setSaved(true);
        if (onSettingsSaved) onSettingsSaved(settings);
        setTimeout(() => {
          setSaved(false);
          onClose();
        }, 1200);
      }
    } catch (err) {
      alert('Error guardando configuración: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header con botón Cruz */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Ajustes & Cierres de Semana</h3>
              <p className="text-[11px] text-slate-400">Configura tus tarifas y el ciclo de tu contratista</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition active:scale-95"
            title="Cerrar ajustes"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form con scroll */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* 1. TECNICO */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Nombre de Técnico / Identificador</span>
            </label>
            <input
              type="text"
              required
              value={settings.tech_default || ''}
              onChange={(e) => setSettings({ ...settings, tech_default: e.target.value })}
              placeholder="ej. Javier (P0G1)"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-cyan-500 transition"
            />
          </div>

          {/* 2. TARIFAS DE PAGO (SOLO 2: BASE Y BORE DRIVEWAY) */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="h-4 w-4" />
                <span>Tarifas por Trabajo</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">2 Conceptos</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Tarifa Base */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Tarifa Base por Trabajo
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    step="1"
                    required
                    value={settings.base_rate || ''}
                    onChange={(e) => setSettings({ ...settings, base_rate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-6 pr-3 py-2 text-xs sm:text-sm text-emerald-400 font-black font-mono focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
                <span className="text-[10px] text-slate-500 block leading-tight">Por cada orden completada</span>
              </div>

              {/* Bono Driveway Bore */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Bono Driveway Bore (DW)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">+$</span>
                  <input
                    type="number"
                    step="1"
                    required
                    value={settings.bore_dw_bonus || ''}
                    onChange={(e) => setSettings({ ...settings, bore_dw_bonus: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-7 pr-3 py-2 text-xs sm:text-sm text-cyan-400 font-black font-mono focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
                <span className="text-[10px] text-slate-500 block leading-tight">Extra si requiere perforación</span>
              </div>
            </div>
          </div>

          {/* 3. DÍA / CICLO DE CIERRE SEMANAL (CONFIGURACIÓN FLEXIBLE) */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span>Día de Cierre de Semana</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Corte de nómina</span>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              Elige qué día cierra la semana tu compañía contratista para agrupar automáticamente tus órdenes de trabajo:
            </p>

            {/* Selector de opciones */}
            <div className="space-y-2">
              {CLOSING_DAY_OPTIONS.map((opt) => {
                const isSelected = String(settings.cutoff_day) === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSettings({ ...settings, cutoff_day: opt.id })}
                    className={`p-3 rounded-2xl border cursor-pointer transition select-none flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-md shadow-amber-500/10'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                          Cierre: {opt.dayName}
                        </span>
                        <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold ${
                          isSelected ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {opt.period}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">{opt.desc}</p>
                    </div>

                    <div className={`h-5 w-5 rounded-full flex items-center justify-center border transition flex-shrink-0 ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400 text-slate-950'
                        : 'border-slate-700 bg-slate-950 text-transparent'
                    }`}>
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recuadro informativo del ciclo activo */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Ciclo Seleccionado Actualmente:
              </span>
              <p className="text-amber-300 font-bold font-mono text-xs">
                Cierre los {currentOption.dayName}s ({currentOption.period})
              </p>
              <p className="text-[10px] text-slate-400">
                Al guardar, la lista de cierres semanales y comprobantes se recalculará automáticamente con este período.
              </p>
            </div>
          </div>

          {saved && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2 text-emerald-400 text-xs font-semibold animate-fade-in">
              <Check className="h-4 w-4 stroke-[3]" />
              <span>¡Configuración y ciclo de cierre actualizados con éxito!</span>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition"
            >
              <Save className="h-4 w-4 stroke-[2.5]" />
              <span>{loading ? 'Guardando...' : 'Guardar Ajustes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
