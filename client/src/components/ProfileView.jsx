import React, { useState, useRef, useEffect } from 'react';
import { 
  ShieldCheck, Clock, DollarSign, CheckCircle2, Ruler, Briefcase, Calendar, 
  FileSpreadsheet, Download, Upload, Trash2, Smartphone, Check, AlertCircle,
  Sun, Moon, Settings, SlidersHorizontal, ChevronRight
} from 'lucide-react';
import { exportOrdersToExcel } from '../services/excelExport';
import { exportAllData, importAllData, clearAllData } from '../services/localDb';
import { useTheme } from '../context/ThemeContext';
import { normalizeRateCard } from '../utils/rateUtils';

const CUTOFF_LABELS = {
  '0': 'Domingo (Lunes a Domingo)',
  '1': 'Lunes (Martes a Lunes)',
  '2': 'Martes (Miércoles a Martes)',
  '3': 'Miércoles (Jueves a Miércoles)',
  '4': 'Jueves (Viernes a Jueves)',
  '5': 'Viernes (Sábado a Viernes)',
  '6': 'Sábado (Domingo a Sábado)',
};

export default function ProfileView({ techName, summaryData, onRefresh, onOpenSettings }) {
  const { actualTheme, toggleTheme } = useTheme();

  const [settings, setSettings] = useState({
    tech_default: techName || 'Javier (P0G1)',
    base_rate: '100.00',
    bore_dw_bonus: '30.00',
    footage_base: '300',
    footage_extra_rate: '25.00',
    cutoff_day: '0'
  });

  const loadActiveSettings = () => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Object.keys(data).length > 0) {
          setSettings((prev) => ({
            ...prev,
            ...data
          }));
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadActiveSettings();
    const handleUpdated = (e) => {
      if (e?.detail) {
        setSettings((prev) => ({ ...prev, ...e.detail }));
      } else {
        loadActiveSettings();
      }
    };
    window.addEventListener('xfinity-settings-updated', handleUpdated);
    return () => window.removeEventListener('xfinity-settings-updated', handleUpdated);
  }, [techName, summaryData]);

  const fileInputRef = useRef(null);
  const [feedback, setFeedback] = useState({ message: '', type: '' });
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [processing, setProcessing] = useState(false);

  const showNotification = (msg, type = 'success') => {
    setFeedback({ message: msg, type });
    setTimeout(() => setFeedback({ message: '', type: '' }), 4000);
  };

  const handleExportExcel = async () => {
    try {
      setProcessing(true);
      await exportOrdersToExcel();
      showNotification('¡Archivo Excel generado y descargado!');
    } catch (err) {
      console.error(err);
      showNotification('Error al exportar a Excel: ' + err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      setProcessing(true);
      let jsonStr = '';

      try {
        const res = await fetch('/api/backup/export');
        if (res.ok) {
          jsonStr = await res.text();
        }
      } catch (err) {
        console.warn('Backend backup export failed, falling back to localDb:', err);
      }

      if (!jsonStr) {
        jsonStr = await exportAllData();
      }

      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `Respaldo_Contabilidad_Xfinity_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification('¡Respaldo JSON descargado con éxito!');
    } catch (err) {
      console.error(err);
      showNotification('Error al generar respaldo: ' + err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setProcessing(true);
      const text = await file.text();
      const parsed = JSON.parse(text);

      let importedCount = 0;
      let restoreHandled = false;

      // /api/backup/restore sincroniza automáticamente IndexedDB (localDb) y SQLite (server.js)
      try {
        const res = await fetch('/api/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });
        if (res.ok) {
          const result = await res.json();
          importedCount = result.count || 0;
          restoreHandled = true;
        }
      } catch (err) {
        console.warn('Restore via API adapter failed, falling back to direct localDb:', err);
      }

      if (!restoreHandled) {
        const localRes = await importAllData(parsed);
        importedCount = localRes.count || 0;
      }

      loadActiveSettings();
      showNotification(`¡Respaldo restaurado! Se importaron ${importedCount} trabajos.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      showNotification('Error al restaurar archivo: formato no válido', 'error');
    } finally {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearData = async () => {
    try {
      setProcessing(true);
      let clearHandled = false;
      try {
        const res = await fetch('/api/backup/clear', { method: 'POST' });
        if (res.ok) clearHandled = true;
      } catch (err) {}
      if (!clearHandled) {
        await clearAllData();
      }
      setShowConfirmClear(false);
      loadActiveSettings();
      showNotification('Datos reiniciados. La aplicación está lista en blanco.', 'success');
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      showNotification('Error al reiniciar: ' + err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const displayTechName = techName || settings.tech_default || 'Javier (P0G1)';
  const techInitial = displayTechName.trim().charAt(0).toUpperCase() || 'J';
  const activeCutoffId = String(summaryData?.cutoffDay ?? summaryData?.summary?.cutoffDay ?? settings.cutoff_day ?? '0');

  return (
    <div className="space-y-4 max-w-md sm:max-w-lg mx-auto w-full pb-20">
      {/* NOTIFICATION TOAST */}
      {feedback.message && (
        <div
          className={`flex items-center gap-2.5 p-3.5 rounded-2xl text-xs font-semibold shadow-xl border animate-in fade-in slide-in-from-top-2 ${
            feedback.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
              : 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          ) : (
            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 1. TECH PROFILE HEADER (COCKPIT DARK STYLE) */}
      <div className="bg-[#0f1722]/95 border border-white/10 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-13 w-13 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-cyan-500/25 shrink-0 font-mono">
              {techInitial}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black text-white truncate">{displayTechName}</h2>
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              </div>
              <p className="text-xs text-cyan-400 font-mono font-semibold truncate">Técnico Instalador Xfinity</p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full border border-emerald-500/30 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Activo</span>
          </div>
        </div>

        {/* Tarifario Oficial de Códigos & Ajustes */}
        <div 
          onClick={() => onOpenSettings && onOpenSettings()}
          className="flex items-center justify-between bg-[#131b26] hover:bg-[#182332] p-3 rounded-2xl border border-white/8 hover:border-cyan-500/35 text-xs transition cursor-pointer group active:scale-[0.99]"
          title="Toca para abrir Ajustes del Tarifario Oficial de Códigos"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded-xl shrink-0">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-100 block">Tarifario de Códigos</span>
              <span className="text-[10.5px] text-slate-400 font-mono font-medium truncate block mt-0.5">
                Tabla oficial de precios y pagos por trabajo
              </span>
            </div>
          </div>

          <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition shrink-0" />
        </div>

        {/* Active Cutoff Day Card + Quick Open Settings */}
        <div 
          onClick={() => onOpenSettings && onOpenSettings()}
          className="flex items-center justify-between bg-[#131b26] hover:bg-[#182332] p-3 rounded-2xl border border-white/8 hover:border-cyan-500/35 text-xs transition cursor-pointer group active:scale-[0.99]"
          title="Toca para abrir Ajustes de Tarifas y Semanario"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-xl shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-100 block">Día de Cierre de Semana</span>
              <span className="text-[10.5px] text-slate-400 font-mono font-medium truncate block mt-0.5">
                {CUTOFF_LABELS[activeCutoffId] || 'Domingo (Lunes a Domingo)'}
              </span>
            </div>
          </div>

          <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-amber-400 group-hover:translate-x-0.5 transition shrink-0" />
        </div>

        {/* Theme Action */}
        <div className="flex items-center justify-between p-2.5 px-3 bg-[#131b26] rounded-2xl border border-white/8 text-xs font-bold">
          <div className="flex items-center gap-2.5 text-slate-200">
            <div className="p-1.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {actualTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </div>
            <span className="text-xs">Tema de Pantalla</span>
          </div>
          <button
            onClick={toggleTheme}
            className="py-1.5 px-3 bg-[#182332] hover:bg-[#223042] text-slate-100 border border-white/10 rounded-xl font-bold text-[11px] transition shadow-xs active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            {actualTheme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>Modo Oscuro</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-cyan-400" />
                <span>Modo Claro</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. ALMACENAMIENTO LOCAL Y RESPALDOS (COCKPIT DARK STYLE) */}
      <div className="bg-[#0f1722]/95 border border-white/10 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <div className="p-1.5 bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded-xl">
              <Smartphone className="h-4 w-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider">
              Datos en este Dispositivo
            </span>
          </div>
          <span className="text-[10px] bg-[#131b26] text-cyan-400 border border-cyan-500/30 px-2.5 py-0.5 rounded-full font-bold font-mono">
            Local-First
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Toda la información, fotos, recibos y cierres se guardan en la memoria privada de este dispositivo y puedes exportarlos en cualquier momento.
        </p>

        {/* ACTION BUTTONS */}
        <div className="space-y-2 pt-1">
          {/* Export to Excel */}
          <button
            onClick={handleExportExcel}
            disabled={processing}
            className="w-full flex items-center justify-between p-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-2xl transition font-bold text-xs active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              <span>Exportar Reporte Completo a Excel (.xlsx)</span>
            </div>
            <Download className="h-3.5 w-3.5 text-emerald-400" />
          </button>

          {/* Export JSON Backup */}
          <button
            onClick={handleExportBackup}
            disabled={processing}
            className="w-full flex items-center justify-between p-3.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-2xl transition font-bold text-xs active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Download className="h-4 w-4 text-cyan-400" />
              <span>Descargar Copia de Seguridad (.json)</span>
            </div>
            <span className="text-[10px] font-mono text-cyan-400">Todo incluido</span>
          </button>

          {/* Import JSON Backup */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
            className="w-full flex items-center justify-between p-3.5 bg-[#131b26] hover:bg-[#182332] border border-white/10 text-slate-200 rounded-2xl transition font-bold text-xs active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Upload className="h-4 w-4 text-cyan-400" />
              <span>Restaurar Copia de Seguridad (.json)</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Cargar</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />

          {/* Clear Data Button (For coworkers starting fresh) */}
          <div className="pt-2 space-y-1">
            {!showConfirmClear ? (
              <button
                onClick={() => setShowConfirmClear(true)}
                className="w-full flex items-center justify-center gap-1.5 p-2 text-slate-400 hover:text-rose-400 text-[11px] font-medium transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Reiniciar datos y empezar en blanco</span>
              </button>
            ) : (
              <div className="p-3.5 bg-rose-950/40 border border-rose-500/35 rounded-2xl space-y-2.5">
                <p className="text-[11px] text-rose-200 text-center font-medium">
                  ¿Estás seguro? Se borrarán todos los trabajos de este dispositivo para empezar desde cero.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="flex-1 py-2 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-200 rounded-xl text-xs font-bold border border-white/10 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleClearData}
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Sí, reiniciar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
