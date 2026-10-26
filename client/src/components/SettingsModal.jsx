import React, { useState, useEffect } from 'react';
import { X, Settings, Save, Check, AlertCircle } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, onSettingsSaved }) {
  const [settings, setSettings] = useState({
    tech_default: 'Javier (P0G1)',
    base_rate: '65.00',
    rg11_bonus: '20.00',
    bore_dw_bonus: '45.00',
    bore_sw_bonus: '25.00',
    holdback_weeks: '3'
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/settings')
        .then((res) => res.json())
        .then((data) => {
          if (data && Object.keys(data).length > 0) {
            setSettings((prev) => ({ ...prev, ...data }));
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setSaved(true);
        onSettingsSaved(settings);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-cyan-400" />
            <h3 className="font-bold text-white text-base">Configuración & Tarifas</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nombre de Técnico / Identificador Oficial
            </label>
            <input
              type="text"
              required
              value={settings.tech_default || ''}
              onChange={(e) => setSettings({ ...settings, tech_default: e.target.value })}
              placeholder="ej. Javier (P0G1)"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">Este identificador se usará por defecto en los reportes y órdenes.</p>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3">
              Tarifas Estimadas para Pegado Automático ($)
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Tarifa Base por Trabajo</label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.base_rate || ''}
                  onChange={(e) => setSettings({ ...settings, base_rate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-emerald-400 font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Bono Cable RG-11</label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.rg11_bonus || ''}
                  onChange={(e) => setSettings({ ...settings, rg11_bonus: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-purple-400 font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Bono Bore Driveway (DW)</label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.bore_dw_bonus || ''}
                  onChange={(e) => setSettings({ ...settings, bore_dw_bonus: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-cyan-400 font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Bono Bore Sidewalk (SW)</label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.bore_sw_bonus || ''}
                  onChange={(e) => setSettings({ ...settings, bore_sw_bonus: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-cyan-400 font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <label className="block text-xs text-slate-300 mb-1">Semanas de Retención en Fondo</label>
            <input
              type="number"
              min="1"
              max="8"
              value={settings.holdback_weeks || '3'}
              onChange={(e) => setSettings({ ...settings, holdback_weeks: e.target.value })}
              className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <span className="text-xs text-slate-400 ml-2">semanas (estándar de contratista: 3 semanas)</span>
          </div>

          {saved && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-400 text-xs">
              <Check className="h-4 w-4" />
              <span>Configuración guardada exitosamente.</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-md shadow-cyan-600/20"
            >
              <Save className="h-4 w-4" />
              <span>{loading ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
