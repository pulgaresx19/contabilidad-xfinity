import React, { useState, useRef } from 'react';
import { 
  ShieldCheck, Clock, DollarSign, CheckCircle2, Ruler, Briefcase, Calendar, 
  FileSpreadsheet, Download, Upload, Trash2, Smartphone, Check, AlertCircle,
  Settings, Sun, Moon, ChevronRight
} from 'lucide-react';
import { exportOrdersToExcel } from '../services/excelExport';
import { exportAllData, importAllData, clearAllData } from '../services/localDb';
import { useTheme } from '../context/ThemeContext';

const CUTOFF_LABELS = {
  '0': 'Domingos (Lunes a Domingo)',
  '5': 'Viernes (Sábado a Viernes)',
  '4': 'Jueves (Viernes a Jueves)',
  '6': 'Sábados (Domingo a Sábado)',
  '3': 'Miércoles (Jueves a Miércoles)'
};

export default function ProfileView({ techName, summaryData, onRefresh, onOpenSettings }) {
  const { actualTheme, toggleTheme } = useTheme();
  const summary = summaryData?.summary || {
    totalAllEarnings: 0,
    totalPending: 0,
    totalPaid: 0,
    totalFeetAll: 0,
    totalOrdersCount: 0,
    totalCompletedCount: 0
  };

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
      const jsonStr = await exportAllData();
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
      const res = await importAllData(text);
      showNotification(`¡Respaldo restaurado! Se importaron ${res.count} trabajos.`);
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
      await clearAllData();
      setShowConfirmClear(false);
      showNotification('Datos reiniciados. La aplicación está lista en blanco.', 'success');
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      showNotification('Error al reiniciar: ' + err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };


  return (
    <div className="space-y-4 max-w-md mx-auto pb-10">
      {/* NOTIFICATION TOAST */}
      {feedback.message && (
        <div
          className={`flex items-center gap-2.5 p-3.5 rounded-2xl text-xs font-semibold shadow-xl border animate-in fade-in slide-in-from-top-2 ${
            feedback.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800'
              : 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-800'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          ) : (
            <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 1. TECH PROFILE HEADER */}
      <div className="bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-cyan-500/25">
              J
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black text-slate-900 dark:text-white">{techName || 'Javier (P0G1)'}</h2>
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-xs text-cyan-700 dark:text-cyan-400 font-mono font-semibold">Técnico Instalador Xfinity</p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/40">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Activo</span>
          </div>
        </div>

        {/* Active Rates Chips */}
        <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950/70 p-3 rounded-2xl border border-slate-200 dark:border-slate-800/80 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Tarifa Base por Trabajo:</span>
            <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 font-mono">$100.00</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Bono Driveway Bore (DW):</span>
            <span className="text-sm font-black text-cyan-700 dark:text-cyan-400 font-mono">+$30.00</span>
          </div>
        </div>

        {/* Active Cutoff Day Card */}
        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800/80 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 rounded-xl">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Día de Cierre de Semana:</span>
              <span className="font-bold text-amber-800 dark:text-amber-300 font-mono text-[11px]">
                {CUTOFF_LABELS[String(summary.cutoffDay ?? '0')] || 'Domingos (Lunes a Domingo)'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Settings & Theme Actions */}
        <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800/80">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/70 dark:hover:bg-slate-950 rounded-2xl transition border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <Settings className="h-4 w-4" />
              </div>
              <div className="text-left">
                <p className="leading-tight">Ajustes de Tarifas y Cierres</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">Modificar precios base, bonos y día de corte</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>

          <div className="flex items-center justify-between p-2.5 px-3 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
            <div className="flex items-center gap-2.5 text-slate-800 dark:text-slate-200">
              <div className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {actualTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </div>
              <span className="text-xs">Tema de Pantalla</span>
            </div>
            <button
              onClick={toggleTheme}
              className="py-1 px-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-[11px] transition shadow-xs active:scale-95 flex items-center gap-1.5"
            >
              {actualTheme === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-400" />
                  <span>Modo Oscuro</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Modo Claro</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. FINANCIAL BALANCE: PENDIENTE VS COBRADO */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-3.5 shadow-lg">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Balance de Contabilidad
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Liquidación Semanal</span>
        </div>

        {/* 2 Big Cards: Pendiente por Cobrar & Total Cobrado */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Pendiente por Cobrar */}
          <div className="bg-amber-50/70 dark:bg-slate-950/90 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-3.5 space-y-1.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Pendiente</span>
              <Clock className="h-4 w-4" />
            </div>
            <div className="text-2xl font-black text-amber-800 dark:text-amber-300 font-mono leading-none pt-0.5">
              ${(summary.totalPending || 0).toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              Aún no cobrado por confirmar
            </p>
          </div>

          {/* Total Cobrado */}
          <div className="bg-emerald-50/70 dark:bg-slate-950/90 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl p-3.5 space-y-1.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Cobrado</span>
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="text-2xl font-black text-emerald-800 dark:text-emerald-400 font-mono leading-none pt-0.5">
              ${(summary.totalPaid || 0).toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              Pago recibido y confirmado
            </p>
          </div>
        </div>

        {/* Producción Histórica y Metraje */}
        <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <div className="p-1.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400 rounded-lg">
                <DollarSign className="h-4 w-4" />
              </div>
              <span className="font-semibold">Producción Total Histórica</span>
            </div>
            <span className="font-black text-slate-900 dark:text-white font-mono text-sm">
              ${(summary.totalAllEarnings || 0).toFixed(2)}
            </span>
          </div>

          <div className="h-px bg-slate-200 dark:bg-slate-800/80" />

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <div className="p-1.5 bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 rounded-lg">
                <Ruler className="h-4 w-4" />
              </div>
              <span className="font-semibold">Metraje Total Instalado</span>
            </div>
            <span className="font-black text-amber-800 dark:text-amber-300 font-mono text-sm">
              {(summary.totalFeetAll || 0).toLocaleString()} ft
            </span>
          </div>

          <div className="h-px bg-slate-200 dark:bg-slate-800/80" />

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <div className="p-1.5 bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 rounded-lg">
                <Briefcase className="h-4 w-4" />
              </div>
              <span className="font-semibold">Trabajos Completados</span>
            </div>
            <span className="font-black text-slate-900 dark:text-slate-200 font-mono text-sm">
              {summary.totalCompletedCount || 0} de {summary.totalOrdersCount || 0}
            </span>
          </div>
        </div>
      </div>

      {/* 3. ALMACENAMIENTO LOCAL Y RESPALDOS */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <div className="p-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 rounded-xl">
              <Smartphone className="h-4 w-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">
              Datos en este Dispositivo
            </span>
          </div>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-0.5 rounded-full font-medium">
            Local-First
          </span>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Toda la información y fotos se guardan en la memoria interna privada de este teléfono o tablet. Nadie más tiene acceso a tus trabajos ni a tus tarifas.
        </p>

        {/* ACTION BUTTONS */}
        <div className="space-y-2 pt-1">
          {/* Export to Excel */}
          <button
            onClick={handleExportExcel}
            disabled={processing}
            className="w-full flex items-center justify-between p-3.5 bg-emerald-50 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-300 rounded-2xl transition font-semibold text-xs active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Exportar Reporte a Excel (.xlsx)</span>
            </div>
            <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </button>

          {/* Export JSON Backup */}
          <button
            onClick={handleExportBackup}
            disabled={processing}
            className="w-full flex items-center justify-between p-3.5 bg-cyan-50 hover:bg-cyan-100/80 dark:bg-cyan-950/40 dark:hover:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/60 text-cyan-900 dark:text-cyan-300 rounded-2xl transition font-semibold text-xs active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <Download className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <span>Descargar Copia de Seguridad (.json)</span>
            </div>
            <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400">Todo incluido</span>
          </button>

          {/* Import JSON Backup */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
            className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/70 dark:hover:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 rounded-2xl transition font-semibold text-xs active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <Upload className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <span>Restaurar Copia de Seguridad (.json)</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">Cargar</span>
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
              <>
                <button
                  onClick={() => setShowConfirmClear(true)}
                  className="w-full flex items-center justify-center gap-1.5 p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-[11px] font-medium transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Reiniciar datos y empezar en blanco</span>
                </button>
              </>
            ) : (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl space-y-2">
                <p className="text-[11px] text-rose-800 dark:text-rose-300 text-center font-medium">
                  ¿Estás seguro? Se borrarán todos los trabajos de este dispositivo para empezar desde cero.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="flex-1 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleClearData}
                    className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition"
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
