import React, { useState, useEffect } from 'react';
import { X, Settings, Save, Check, Calendar, DollarSign, ShieldCheck, Sun, Moon, Monitor, Sparkles, Wifi } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { getAuraCoreUrl, setAuraCoreUrl, checkAuraCoreHealth } from '../services/auraService';

const WEEK_DAYS = [
  { id: '1', short: 'Lun', full: 'Lunes', cycle: 'Martes a Lunes' },
  { id: '2', short: 'Mar', full: 'Martes', cycle: 'Miércoles a Martes' },
  { id: '3', short: 'Mié', full: 'Miércoles', cycle: 'Jueves a Miércoles' },
  { id: '4', short: 'Jue', full: 'Jueves', cycle: 'Viernes a Jueves' },
  { id: '5', short: 'Vie', full: 'Viernes', cycle: 'Sábado a Viernes' },
  { id: '6', short: 'Sáb', full: 'Sábado', cycle: 'Domingo a Sábado' },
  { id: '0', short: 'Dom', full: 'Domingo', cycle: 'Lunes a Domingo' },
];

export default function SettingsModal({ isOpen, onClose, onSettingsSaved }) {
  const { themeMode, setThemeMode } = useTheme();
  const [settings, setSettings] = useState({
    tech_default: 'Javier (P0G1)',
    base_rate: '100.00',
    bore_dw_bonus: '30.00',
    footage_base: '300',
    footage_extra_rate: '25.00',
    cutoff_day: '0'
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [auraUrl, setAuraUrl] = useState(() => getAuraCoreUrl());
  const [auraHealth, setAuraHealth] = useState(null);

  const testAuraConnection = async (customUrl) => {
    if (customUrl !== undefined) setAuraCoreUrl(customUrl);
    setAuraHealth({ checking: true });
    const res = await checkAuraCoreHealth();
    setAuraHealth({ checking: false, ...res });
  };

  useEffect(() => {
    if (isOpen) {
      setAuraUrl(getAuraCoreUrl());
      testAuraConnection();
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
            else if (cutoffVal === 'Tuesday') cutoffVal = '2';
            else if (cutoffVal === 'Monday') cutoffVal = '1';
            else if (!cutoffVal) cutoffVal = '0';

            setSettings({
              tech_default: data.tech_default || 'Javier (P0G1)',
              base_rate: data.base_rate || '100.00',
              bore_dw_bonus: data.bore_dw_bonus || '30.00',
              footage_base: data.footage_base || '300',
              footage_extra_rate: data.footage_extra_rate || '25.00',
              cutoff_day: String(cutoffVal)
            });
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentOption = WEEK_DAYS.find(o => o.id === String(settings.cutoff_day)) || WEEK_DAYS[6]; // default Domingo (id: '0')

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setAuraCoreUrl(auraUrl);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tech_default: settings.tech_default,
          base_rate: settings.base_rate,
          bore_dw_bonus: settings.bore_dw_bonus,
          footage_base: settings.footage_base,
          footage_extra_rate: settings.footage_extra_rate,
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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[#101722] border border-white/10 w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[78dvh] sm:max-h-[82dvh] modal-sheet-compact text-white transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Unificado (Estilo Cockpit idéntico a Evidencias y Compartir) */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shrink-0 shadow-md shadow-cyan-500/20">
              <Settings className="h-4 w-4 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                Ajustes & Semanario
              </h3>
              <p className="text-[10.5px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                Tarifas y día de corte semanal de tu compañía
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Cerrar ajustes"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form con scroll suave y altura compacta */}
        <form onSubmit={handleSubmit} className="p-3.5 sm:p-4 space-y-3 overflow-y-auto flex-1 scrollbar-none">
          {/* APARIENCIA / MODO CLARO Y OSCURO */}
          <div className="bg-[#16202c]/90 border border-white/10 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Sun className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                <span>Tema de la Aplicación</span>
              </span>
              <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800/40">
                {themeMode === 'light' ? 'Claro' : themeMode === 'dark' ? 'Oscuro' : 'Automático'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setThemeMode('light')}
                className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1.5 border text-xs font-bold transition select-none cursor-pointer ${
                  themeMode === 'light'
                    ? 'bg-amber-400/20 text-amber-600 dark:text-amber-400 border-amber-500/40 shadow-sm'
                    : 'bg-[#0f1722] border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                <span>Claro</span>
              </button>

              <button
                type="button"
                onClick={() => setThemeMode('dark')}
                className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1.5 border text-xs font-bold transition select-none cursor-pointer ${
                  themeMode === 'dark'
                    ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/40 shadow-sm'
                    : 'bg-[#0f1722] border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                <span>Oscuro</span>
              </button>

              <button
                type="button"
                onClick={() => setThemeMode('system')}
                className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1.5 border text-xs font-bold transition select-none cursor-pointer ${
                  themeMode === 'system'
                    ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/40 shadow-sm'
                    : 'bg-[#0f1722] border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
                <span>Auto</span>
              </button>
            </div>
          </div>

          {/* 1. TECNICO */}
          <div className="bg-[#16202c]/90 border border-white/10 rounded-2xl p-3.5 space-y-1.5 shadow-sm">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
              <span>Nombre de Técnico / Identificador</span>
            </label>
            <input
              type="text"
              required
              value={settings.tech_default || ''}
              onChange={(e) => setSettings({ ...settings, tech_default: e.target.value })}
              placeholder="ej. Javier (P0G1)"
              className="w-full bg-[#0f1722] border border-white/10 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-cyan-500 transition shadow-inner"
            />
          </div>

          {/* 2. TARIFAS DE PAGO (SOLO 2: BASE Y BORE DRIVEWAY) */}
          <div className="bg-[#16202c]/90 border border-white/10 rounded-2xl p-3.5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="h-4 w-4" />
                <span>Tarifas por Trabajo</span>
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">2 Conceptos</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Tarifa Base */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Tarifa Base por Trabajo
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400 dark:text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    step="1"
                    required
                    value={settings.base_rate || ''}
                    onChange={(e) => setSettings({ ...settings, base_rate: e.target.value })}
                    className="w-full bg-[#0f1722] border border-white/10 rounded-xl pl-6 pr-3 py-1.5 sm:py-2 text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 font-black font-mono focus:outline-none focus:border-cyan-500 transition shadow-inner"
                  />
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">Por cada orden completada</span>
              </div>

              {/* Bono Driveway Bore */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Bono Driveway Bore (DW)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400 dark:text-slate-500 font-mono">+$</span>
                  <input
                    type="number"
                    step="1"
                    required
                    value={settings.bore_dw_bonus || ''}
                    onChange={(e) => setSettings({ ...settings, bore_dw_bonus: e.target.value })}
                    className="w-full bg-[#0f1722] border border-white/10 rounded-xl pl-7 pr-3 py-1.5 sm:py-2 text-xs sm:text-sm text-cyan-600 dark:text-cyan-400 font-black font-mono focus:outline-none focus:border-cyan-500 transition shadow-inner"
                  />
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">Extra si requiere perforación</span>
              </div>
            </div>

            {/* Bono por Metraje Largo (>300 ft) */}
            <div className="pt-2.5 border-t border-slate-200 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  Bono por metraje largo
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 font-bold whitespace-nowrap shrink-0">
                  +${settings.footage_extra_rate || '25'} cada 100 ft
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">Metraje Base Incluido:</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="50"
                      required
                      value={settings.footage_base || '300'}
                      onChange={(e) => setSettings({ ...settings, footage_base: e.target.value })}
                      className="w-full bg-[#0f1722] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-amber-600 dark:text-amber-300 font-bold font-mono focus:outline-none focus:border-cyan-500 shadow-inner"
                    />
                    <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-400 dark:text-slate-500">ft</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">Bono cada 100 ft Extra:</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-mono">+$</span>
                    <input
                      type="number"
                      step="5"
                      required
                      value={settings.footage_extra_rate || '25.00'}
                      onChange={(e) => setSettings({ ...settings, footage_extra_rate: e.target.value })}
                      className="w-full bg-[#0f1722] border border-white/10 rounded-xl pl-6 pr-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold font-mono focus:outline-none focus:border-cyan-500 shadow-inner"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Al pasar de {settings.footage_base || '300'} ft, se pagan +${settings.footage_extra_rate || '25'} automáticamente por cada 100 ft extra.
              </p>
            </div>
          </div>

          {/* 2B. SERVIDOR AURACORE IA */}
          <div className="bg-[#16202c]/90 border border-white/10 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                <span>AuraCore IA (Foto y Voz)</span>
              </span>
              {auraHealth && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  auraHealth.checking
                    ? 'bg-slate-800 border-white/10 text-slate-300'
                    : auraHealth.ok
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                }`}>
                  <Wifi className="w-2.5 h-2.5" />
                  <span>
                    {auraHealth.checking
                      ? 'Probando...'
                      : auraHealth.ok
                      ? `En línea · ${auraHealth.model || 'Gemini'}`
                      : 'Sin conexión'}
                  </span>
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                placeholder="http://localhost:3100 o https://tu-auracore.onrender.com"
                value={auraUrl}
                onChange={(e) => setAuraUrl(e.target.value)}
                className="flex-1 bg-[#0f1722] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 shadow-inner"
              />
              <button
                type="button"
                onClick={() => testAuraConnection(auraUrl)}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition cursor-pointer shrink-0"
              >
                Probar
              </button>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Usa <code className="text-cyan-300">http://localhost:3100</code> en esta PC o pega tu URL HTTPS en la nube (Render/Railway) para usar la IA 24/7 sin tener la computadora encendida.
            </p>
          </div>

          {/* 3. DÍA DE CIERRE SEMANAL (SEMANARIO LINEAL) */}
          <div className="bg-[#16202c]/90 border border-white/10 rounded-2xl p-3.5 space-y-3 shadow-sm">
            <div>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span>Semanario & Día de Cierre</span>
              </span>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                Selecciona el día de la semana en que corta tu compañía. Ese día se tomará lógicamente como el fin de cada cierre semanal:
              </p>
            </div>

            {/* Selector Lineal Horizontal de 7 Días */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 pt-0.5">
              {WEEK_DAYS.map((d) => {
                const isSelected = String(settings.cutoff_day) === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSettings({ ...settings, cutoff_day: d.id })}
                    className={`py-2.5 px-1 rounded-xl text-xs font-black transition flex flex-col items-center justify-center gap-0.5 border select-none cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/25 scale-105 z-10'
                        : 'bg-[#0f1722] border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 active:scale-95'
                    }`}
                  >
                    <span>{d.short}</span>
                    <span className={`text-[8px] font-bold uppercase ${isSelected ? 'text-slate-950/90' : 'text-slate-400 dark:text-slate-500'}`}>
                      {isSelected ? 'Cierre' : 'Día'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Previsualización del Ciclo Seleccionado */}
            <div className="p-3 bg-[#0f1722] border border-white/10 rounded-xl text-xs flex items-center justify-between shadow-xs">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                  Cierre de Semana Configurado:
                </span>
                <p className="text-sm font-black text-amber-600 dark:text-amber-300 font-mono">
                  {currentOption.full}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  Período: {currentOption.cycle}
                </p>
              </div>

              <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/20">
                <Check className="h-4 w-4 stroke-[3]" />
              </div>
            </div>
          </div>

          {saved && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-fade-in shadow-xs">
              <Check className="h-4 w-4 stroke-[3]" />
              <span>¡Configuración y ciclo de cierre actualizados con éxito!</span>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-[#16202c] hover:bg-[#1e2a3a] border border-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold rounded-xl transition cursor-pointer active:scale-95"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/25 active:scale-95 transition cursor-pointer"
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