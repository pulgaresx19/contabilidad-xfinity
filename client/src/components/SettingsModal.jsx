import React, { useState, useEffect } from 'react';
import { X, Settings, Save, Check, Calendar, DollarSign, ShieldCheck, Sun, Moon, Monitor, Sparkles, Wifi, MessageSquare, RotateCcw, ChevronRight, ChevronDown, Lock } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { getAuraCoreUrl, setAuraCoreUrl, resetAuraCoreUrl, checkAuraCoreHealth } from '../services/auraService';
import { DEFAULT_SMS_TEMPLATE } from '../utils/smsUtils';
import { DEFAULT_RATE_CARD, normalizeRateCard } from '../utils/rateUtils';
import { isAuraPinAuthorized, authorizeAuraWithPin } from '../utils/pinAuth';
import AiDeductionGuideModal from './AiDeductionGuideModal';

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
    cutoff_day: '0',
    sms_template: DEFAULT_SMS_TEMPLATE,
    rate_card: DEFAULT_RATE_CARD
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [auraUrl, setAuraUrl] = useState(() => getAuraCoreUrl());
  const [auraPin, setAuraPin] = useState(() => (isAuraPinAuthorized() ? '••••••' : ''));
  const [auraPinAuthorized, setAuraPinAuthorized] = useState(() => isAuraPinAuthorized());
  const [auraPinEdited, setAuraPinEdited] = useState(false);
  const [auraHealth, setAuraHealth] = useState(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [showTiers, setShowTiers] = useState(false);

  const testAuraConnection = async (customUrl, isInitialOpen = false) => {
    if (!isInitialOpen && (auraPinEdited || !auraPinAuthorized)) {
      const cleanAttempt = String(auraPin || '').replace(/•/g, '').trim();
      if (!authorizeAuraWithPin(cleanAttempt)) {
        setAuraPinAuthorized(false);
        setAuraHealth({
          checking: false,
          ok: false,
          error: 'Código PIN incorrecto. Ingresa el PIN válido de 6 cifras abajo para conectar la IA.'
        });
        return;
      }
      setAuraPinAuthorized(true);
      setAuraPin('••••••');
      setAuraPinEdited(false);
    } else if (isInitialOpen && !isAuraPinAuthorized()) {
      setAuraHealth({
        checking: false,
        ok: false,
        error: 'Ingresa el código PIN de 6 cifras abajo y presiona Probar para activar la IA.'
      });
      return;
    }

    if (customUrl !== undefined) setAuraCoreUrl(customUrl);
    setAuraHealth({ checking: true });
    const res = await checkAuraCoreHealth();
    setAuraHealth({ checking: false, ...res });
  };

  useEffect(() => {
    if (isOpen) {
      const alreadyAuth = isAuraPinAuthorized();
      setAuraPinAuthorized(alreadyAuth);
      setAuraPin(alreadyAuth ? '••••••' : '');
      setAuraPinEdited(false);
      setAuraUrl(getAuraCoreUrl());
      testAuraConnection(undefined, true);
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

            const card = normalizeRateCard(data.rate_card);

            setSettings({
              tech_default: data.tech_default || 'Javier (P0G1)',
              base_rate: data.base_rate || (card.B003?.price != null ? String(card.B003.price) : '100.00'),
              bore_dw_bonus: data.bore_dw_bonus || (card.D20?.price != null ? String(card.D20.price) : '30.00'),
              footage_base: data.footage_base || '300',
              footage_extra_rate: data.footage_extra_rate || '25.00',
              cutoff_day: String(cutoffVal),
              sms_template: data.sms_template && String(data.sms_template).trim() ? data.sms_template : DEFAULT_SMS_TEMPLATE,
              rate_card: card
            });
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentOption = WEEK_DAYS.find(o => o.id === String(settings.cutoff_day)) || WEEK_DAYS[6]; // default Domingo (id: '0')
  const currentCard = normalizeRateCard(settings.rate_card);

  const updateRatePrice = (code, val) => {
    const num = parseFloat(val) || 0;
    setSettings((prev) => {
      const card = { ...normalizeRateCard(prev.rate_card) };
      if (card[code]) {
        card[code] = { ...card[code], price: num };
      }
      return {
        ...prev,
        rate_card: card,
        base_rate: code === 'B003' ? String(num) : prev.base_rate,
        bore_dw_bonus: code === 'D20' ? String(num) : prev.bore_dw_bonus
      };
    });
  };

  const updateTierPrice = (idx, val) => {
    const num = parseFloat(val) || 0;
    setSettings((prev) => {
      const card = { ...normalizeRateCard(prev.rate_card) };
      const tiers = [...(card.tiers || DEFAULT_RATE_CARD.tiers)];
      if (tiers[idx]) {
        tiers[idx] = { ...tiers[idx], price: num };
      }
      card.tiers = tiers;
      return { ...prev, rate_card: card };
    });
  };

  const handleResetRateCard = async () => {
    if (!window.confirm('¿Deseas restablecer el tarifario a los valores oficiales de fábrica de Empire Cable ($100 base, $30 extra driveway, $2.50 road bore, etc.)?')) {
      return;
    }
    try {
      const res = await fetch('/api/settings/reset-rate-card', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({
          ...prev,
          rate_card: data.rate_card || DEFAULT_RATE_CARD,
          base_rate: '100.00',
          bore_dw_bonus: '30.00'
        }));
      }
    } catch (err) {
      console.error('Error restableciendo tarifas:', err);
    }
  };

  const updateSmsTemplate = (newVal) => {
    setSettings((prev) => {
      const next = { ...prev, sms_template: newVal };
      try {
        const cached = JSON.parse(localStorage.getItem('xfinity_cached_settings') || '{}');
        localStorage.setItem(
          'xfinity_cached_settings',
          JSON.stringify({ ...cached, ...next, sms_template: newVal || DEFAULT_SMS_TEMPLATE })
        );
      } catch (_) {}
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sms_template: newVal && String(newVal).trim() ? String(newVal).trim() : DEFAULT_SMS_TEMPLATE })
      }).catch(() => {});
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (auraPinEdited) {
      const cleanAttempt = String(auraPin || '').replace(/•/g, '').trim();
      if (!authorizeAuraWithPin(cleanAttempt)) {
        setAuraPinAuthorized(false);
        setAuraHealth({
          checking: false,
          ok: false,
          error: 'Código PIN de IA incorrecto. Ingresa el PIN correcto de 6 cifras abajo antes de guardar.'
        });
        return;
      }
      setAuraPinAuthorized(true);
      setAuraPin('••••••');
      setAuraPinEdited(false);
    }
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
          cutoff_day: settings.cutoff_day,
          sms_template: settings.sms_template && String(settings.sms_template).trim() ? settings.sms_template.trim() : DEFAULT_SMS_TEMPLATE,
          rate_card: settings.rate_card
        })
      });

      if (res.ok) {
        setSaved(true);
        if (onSettingsSaved) onSettingsSaved(settings);
        try {
          window.dispatchEvent(new CustomEvent('xfinity-settings-updated', { detail: settings }));
        } catch (_) {}
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 24px, 1.75rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 24px, 1.75rem)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form 
        onSubmit={handleSubmit}
        className="bg-[#101722] border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md h-[80dvh] sm:h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Unificado (Estilo Cockpit Dark uniforme) */}
        <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shrink-0 shadow-md shadow-cyan-500/20">
              <Settings className="h-4 w-4 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">
                Ajustes & Semanario
              </h3>
              <p className="text-[10.5px] text-slate-400 font-semibold truncate">
                Tarifas y día de corte semanal de tu compañía
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Cerrar ajustes"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cuerpo Scrolleable con Opciones */}
        <div className="p-3.5 sm:p-4 space-y-3 overflow-y-auto flex-1 min-h-0 scrollbar-none">
          {/* 1. TECNICO / IDENTIFICADOR (ARRIBA DE TODO) */}
          <div className="bg-[#16202c]/90 border border-white/10 rounded-2xl p-3.5 space-y-1.5 shadow-sm">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Nombre de Técnico / Identificador</span>
            </label>
            <input
              type="text"
              required
              value={settings.tech_default || ''}
              onChange={(e) => setSettings({ ...settings, tech_default: e.target.value })}
              placeholder="ej. Javier (P0G1)"
              className="w-full bg-[#0f1722] border border-white/10 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-cyan-500 transition shadow-inner"
            />
          </div>

          {/* 2. APARIENCIA / TEMA DE LA APLICACIÓN */}
          <div className="bg-[#16202c]/90 border border-white/10 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sun className="h-4 w-4 text-amber-400" />
                <span>Tema de la Aplicación</span>
              </span>
              <span className="text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/40">
                {themeMode === 'light' ? 'Claro' : themeMode === 'dark' ? 'Oscuro' : 'Automático'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setThemeMode('light')}
                className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1.5 border text-xs font-bold transition select-none cursor-pointer ${
                  themeMode === 'light'
                    ? 'bg-amber-400/20 text-amber-300 border-amber-500/40 shadow-sm'
                    : 'bg-[#0f1722] border-white/10 text-slate-400 hover:text-white hover:border-white/20'
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
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                    : 'bg-[#0f1722] border-white/10 text-slate-400 hover:text-white hover:border-white/20'
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
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm'
                    : 'bg-[#0f1722] border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
                <span>Auto</span>
              </button>
            </div>
          </div>

          {/* 3. TARIFARIO OFICIAL DE CÓDIGOS DE PAGO (EMPIRE CABLE / XFINITY) */}
          <div className="bg-[#16202c]/95 border border-white/10 rounded-2xl p-3 sm:p-4 space-y-3.5 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div>
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4" />
                  <span>Tarifario Oficial de Códigos de Pago</span>
                </span>
                <p className="text-[10.5px] text-slate-300 mt-0.5">
                  Estructura oficial del comprobante de nómina de Empire Cable (100% editable)
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetRateCard}
                title="Restablecer tarifas de fábrica"
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10.5px] font-semibold rounded-lg border border-white/10 transition active:scale-95 shadow-sm cursor-pointer"
              >
                <RotateCcw className="h-3 w-3 text-cyan-400" />
                <span>Restablecer</span>
              </button>
            </div>

            {/* TABLA PRINCIPAL: TRABAJOS BASE Y CRUCES */}
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c131d]">
              {/* Encabezado de Columnas (Estilo Hoja de Liquidación) */}
              <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-[#131d2a] text-[9.5px] font-black uppercase tracking-wider text-slate-400 border-b border-white/10">
                <span className="col-span-3 sm:col-span-2">CÓDIGO</span>
                <span className="col-span-6 sm:col-span-7">TRABAJO / DESCRIPCIÓN OFICIAL</span>
                <span className="col-span-3 text-right">PRECIO ($)</span>
              </div>

              {/* Filas Lineales */}
              <div className="divide-y divide-white/5 text-xs">
                {/* B003 */}
                <div className="grid grid-cols-12 gap-1 px-3 py-2.5 items-center hover:bg-white/[0.02] transition">
                  <div className="col-span-3 sm:col-span-2 flex items-center">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-black bg-blue-900/60 text-blue-300 border border-blue-700/60">
                      B003
                    </span>
                  </div>
                  <div className="col-span-6 sm:col-span-7 pr-2">
                    <span className="text-[11.5px] font-bold text-slate-100 block leading-tight">
                      Drop Bury In Conduit up to 300'
                    </span>
                    <span className="text-[9.5px] text-slate-400 block leading-tight mt-0.5">
                      Sidewalk and Driveway Included (Tarifa base estándar de trabajo)
                    </span>
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <div className="relative w-22 sm:w-24">
                      <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        step="1"
                        required
                        value={currentCard.B003?.price ?? 100}
                        onChange={(e) => updateRatePrice('B003', e.target.value)}
                        className="w-full bg-[#16202c] border border-white/10 rounded-lg pl-6 pr-2 py-1 text-xs text-emerald-400 font-black font-mono text-right focus:outline-none focus:border-cyan-500 shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                {/* 873 */}
                <div className="grid grid-cols-12 gap-1 px-3 py-2.5 items-center hover:bg-white/[0.02] transition">
                  <div className="col-span-3 sm:col-span-2 flex items-center">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-black bg-slate-800 text-slate-300 border border-slate-700">
                      873
                    </span>
                  </div>
                  <div className="col-span-6 sm:col-span-7 pr-2">
                    <span className="text-[11.5px] font-bold text-slate-100 block leading-tight">
                      Drop Direct Bury Coax or Fiber
                    </span>
                    <span className="text-[9.5px] text-slate-400 block leading-tight mt-0.5">
                      Entierro directo en tierra (sin conduit/tubería)
                    </span>
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <div className="relative w-22 sm:w-24">
                      <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        step="1"
                        required
                        value={currentCard['873']?.price ?? 45}
                        onChange={(e) => updateRatePrice('873', e.target.value)}
                        className="w-full bg-[#16202c] border border-white/10 rounded-lg pl-6 pr-2 py-1 text-xs text-emerald-400 font-black font-mono text-right focus:outline-none focus:border-cyan-500 shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                {/* D20 */}
                <div className="grid grid-cols-12 gap-1 px-3 py-2.5 items-center hover:bg-white/[0.02] transition">
                  <div className="col-span-3 sm:col-span-2 flex items-center">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-black bg-cyan-950 text-cyan-300 border border-cyan-700">
                      D20
                    </span>
                  </div>
                  <div className="col-span-6 sm:col-span-7 pr-2">
                    <span className="text-[11.5px] font-bold text-slate-100 block leading-tight">
                      Extra Driveways up to two
                    </span>
                    <span className="text-[9.5px] text-slate-400 block leading-tight mt-0.5">
                      Bono cruce adicional de entrada vehicular (Driveway bore)
                    </span>
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <div className="relative w-22 sm:w-24">
                      <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">+$</span>
                      <input
                        type="number"
                        step="1"
                        required
                        value={currentCard.D20?.price ?? 30}
                        onChange={(e) => updateRatePrice('D20', e.target.value)}
                        className="w-full bg-[#16202c] border border-white/10 rounded-lg pl-7 pr-2 py-1 text-xs text-cyan-400 font-black font-mono text-right focus:outline-none focus:border-cyan-500 shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                {/* B002 */}
                <div className="grid grid-cols-12 gap-1 px-3 py-2.5 items-center hover:bg-white/[0.02] transition">
                  <div className="col-span-3 sm:col-span-2 flex items-center">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-black bg-purple-950 text-purple-300 border border-purple-700">
                      B002
                    </span>
                  </div>
                  <div className="col-span-6 sm:col-span-7 pr-2">
                    <span className="text-[11.5px] font-bold text-slate-100 block leading-tight">
                      Road Bore conduit
                    </span>
                    <span className="text-[9.5px] text-slate-400 block leading-tight mt-0.5">
                      Perforación bajo calle / carretera (tarifa por pie lineal)
                    </span>
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <div className="relative w-22 sm:w-24">
                      <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        step="0.25"
                        required
                        value={currentCard.B002?.price ?? 2.50}
                        onChange={(e) => updateRatePrice('B002', e.target.value)}
                        className="w-full bg-[#16202c] border border-white/10 rounded-lg pl-6 pr-2 py-1 text-xs text-purple-400 font-black font-mono text-right focus:outline-none focus:border-cyan-500 shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                {/* B005 */}
                <div className="grid grid-cols-12 gap-1 px-3 py-2.5 items-center hover:bg-white/[0.02] transition">
                  <div className="col-span-3 sm:col-span-2 flex items-center">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-black bg-amber-950 text-amber-300 border border-amber-700">
                      B005
                    </span>
                  </div>
                  <div className="col-span-6 sm:col-span-7 pr-2">
                    <span className="text-[11.5px] font-bold text-slate-100 block leading-tight">
                      Asphalt Cut 50ft max
                    </span>
                    <span className="text-[9.5px] text-slate-400 block leading-tight mt-0.5">
                      Corte en pavimento de asfalto
                    </span>
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <div className="relative w-22 sm:w-24">
                      <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">+$</span>
                      <input
                        type="number"
                        step="1"
                        required
                        value={currentCard.B005?.price ?? 10}
                        onChange={(e) => updateRatePrice('B005', e.target.value)}
                        className="w-full bg-[#16202c] border border-white/10 rounded-lg pl-7 pr-2 py-1 text-xs text-amber-300 font-black font-mono text-right focus:outline-none focus:border-cyan-500 shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                {/* B006 */}
                <div className="grid grid-cols-12 gap-1 px-3 py-2.5 items-center hover:bg-white/[0.02] transition">
                  <div className="col-span-3 sm:col-span-2 flex items-center">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-black bg-amber-950 text-amber-300 border border-amber-700">
                      B006
                    </span>
                  </div>
                  <div className="col-span-6 sm:col-span-7 pr-2">
                    <span className="text-[11.5px] font-bold text-slate-100 block leading-tight">
                      Concrete Cut 50ft max
                    </span>
                    <span className="text-[9.5px] text-slate-400 block leading-tight mt-0.5">
                      Corte en pavimento de concreto
                    </span>
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <div className="relative w-22 sm:w-24">
                      <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">+$</span>
                      <input
                        type="number"
                        step="1"
                        required
                        value={currentCard.B006?.price ?? 11}
                        onChange={(e) => updateRatePrice('B006', e.target.value)}
                        className="w-full bg-[#16202c] border border-white/10 rounded-lg pl-7 pr-2 py-1 text-xs text-amber-300 font-black font-mono text-right focus:outline-none focus:border-cyan-500 shadow-inner"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* TABLA DE METRAJES LARGOS EPON (TIERS B003.1 AL B003.9) */}
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c131d]">
              <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-[#131d2a] text-[9.5px] font-black uppercase tracking-wider text-slate-400 border-b border-white/10">
                <span className="col-span-3 sm:col-span-2">CÓDIGO</span>
                <span className="col-span-6 sm:col-span-7">ESCALA EPON FIBER (CONDUIT INCLUIDO)</span>
                <span className="col-span-3 text-right">PRECIO ($)</span>
              </div>

              <div className="divide-y divide-white/5 text-xs">
                {(currentCard.tiers || DEFAULT_RATE_CARD.tiers).map((tier, idx) => (
                  <div key={tier.code} className="grid grid-cols-12 gap-1 px-3 py-2.5 items-center hover:bg-white/[0.02] transition">
                    <div className="col-span-3 sm:col-span-2 flex items-center">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-black bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                        {tier.code}
                      </span>
                    </div>
                    <div className="col-span-6 sm:col-span-7 pr-2">
                      <span className="text-[11.5px] font-bold text-slate-100 block leading-tight">
                        {tier.fullDesc || tier.name || `EPON FIBER Drop Bury (${tier.minFt}' – ${tier.maxFt}')`}
                      </span>
                      <span className="text-[9.5px] text-slate-400 block leading-tight mt-0.5">
                        Tramo de {tier.minFt}' a {tier.maxFt}' • Sidewalk and Driveway Included
                      </span>
                    </div>
                    <div className="col-span-3 flex justify-end">
                      <div className="relative w-22 sm:w-24">
                        <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">$</span>
                        <input
                          type="number"
                          step="5"
                          required
                          value={tier.price}
                          onChange={(e) => updateTierPrice(idx, e.target.value)}
                          className="w-full bg-[#16202c] border border-white/10 rounded-lg pl-6 pr-2 py-1 text-xs text-emerald-400 font-black font-mono text-right focus:outline-none focus:border-cyan-500 shadow-inner"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-snug px-1 italic">
              * Todos los códigos y textos son idénticos a los del comprobante oficial de Empire Cable. Cualquier cambio que guardes se sincronizará automáticamente con el escáner y la auditoría con IA.
            </p>
          </div>

          {/* 4. DÍA DE CIERRE SEMANAL (SEMANARIO LINEAL) */}
          <div className="bg-[#16202c]/90 border border-white/10 rounded-2xl p-3.5 space-y-3 shadow-sm">
            <div>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span>Semanario & Día de Cierre</span>
              </span>
              <p className="text-[11px] text-slate-300 mt-1 leading-snug">
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
                        : 'bg-[#0f1722] border-white/10 text-slate-400 hover:text-white hover:border-white/20 active:scale-95'
                    }`}
                  >
                    <span>{d.short}</span>
                    <span className={`text-[8px] font-bold uppercase ${isSelected ? 'text-slate-950/90' : 'text-slate-500'}`}>
                      {isSelected ? 'Cierre' : 'Día'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Previsualización del Ciclo Seleccionado */}
            <div className="p-3 bg-[#0f1722] border border-white/10 rounded-xl text-xs flex items-center justify-between shadow-xs">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Cierre de Semana Configurado:
                </span>
                <p className="text-sm font-black text-amber-300 font-mono">
                  {currentOption.full}
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  Período: {currentOption.cycle}
                </p>
              </div>

              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <Check className="h-4 w-4 stroke-[3]" />
              </div>
            </div>
          </div>

          {/* 5. MENSAJE AUTOMÁTICO (SMS) */}
          <div className="bg-[#16202c]/90 border border-white/10 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span>Mensaje automático (SMS)</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 whitespace-nowrap">
                Auto-Envío
              </span>
            </div>

            <p className="text-[11px] text-slate-300 leading-snug">
              Este es el mensaje preescrito que se abre al tocar el ícono de SMS en cada trabajo. Usa <strong className="text-cyan-300 font-mono">(Dirección)</strong> para la casa del cliente y <strong className="text-emerald-300 font-mono">(Operador)</strong> para tu nombre:
            </p>

            {/* Botones rápidos en una sola fila lineal */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => updateSmsTemplate(`${settings.sms_template || ''} (Dirección)`.trim())}
                className="py-1.5 px-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[9.5px] sm:text-[10px] font-mono font-bold flex items-center justify-center whitespace-nowrap transition cursor-pointer active:scale-95"
                title="Insertar marcador de dirección del cliente"
              >
                + (Dirección)
              </button>

              <button
                type="button"
                onClick={() => updateSmsTemplate(`${settings.sms_template || ''} (Operador)`.trim())}
                className="py-1.5 px-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[9.5px] sm:text-[10px] font-mono font-bold flex items-center justify-center whitespace-nowrap transition cursor-pointer active:scale-95"
                title="Insertar marcador de nombre del operador"
              >
                + (Operador)
              </button>

              <button
                type="button"
                onClick={() => updateSmsTemplate(DEFAULT_SMS_TEMPLATE)}
                className="py-1.5 px-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-[9.5px] sm:text-[10px] font-semibold flex items-center justify-center gap-1 whitespace-nowrap transition cursor-pointer active:scale-95"
                title="Restaurar mensaje predeterminado"
              >
                <RotateCcw className="h-2.5 w-2.5 shrink-0" />
                <span>Restaurar original</span>
              </button>
            </div>

            <textarea
              rows={5}
              value={settings.sms_template || ''}
              onChange={(e) => updateSmsTemplate(e.target.value)}
              placeholder={DEFAULT_SMS_TEMPLATE}
              className="w-full bg-[#0f1722] border border-white/10 rounded-xl p-3 text-xs text-white font-sans leading-relaxed focus:outline-none focus:border-cyan-500 transition shadow-inner resize-y"
            />

            {/* Traducción Base en Español */}
            <div className="p-2.5 bg-[#0f1722] border border-white/10 rounded-xl">
              <p className="text-[10.5px] text-slate-300 leading-relaxed">
                <strong className="text-emerald-400">Traducción base:</strong> Aviso de Xfinity / Comcast para (Dirección): Hola, le habla (Operador), su técnico de soterrado de cable (Drop Bury). Estaré trabajando afuera en breve para enterrar su línea de cable exterior. No necesita estar en casa ni salir; este es solo un aviso de cortesía. Por favor escríbame por texto ÚNICAMENTE si tiene algún portón con llave, mascotas en el patio o sistemas privados de riego/cercas invisibles para perros. ¡Gracias!
              </p>
            </div>
          </div>

          {/* 6. SERVIDOR AURACORE IA (DE ÚLTIMO) */}
          <div className="bg-[#16202c]/90 border border-white/10 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                <span>Auracore IA</span>
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

            <div className="flex gap-1.5">
              <input
                type="url"
                placeholder="https://tu-auracore.vercel.app o Auto"
                value={auraUrl}
                onChange={(e) => setAuraUrl(e.target.value)}
                className="flex-1 min-w-0 bg-[#0f1722] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 shadow-inner"
              />
              <button
                type="button"
                onClick={() => testAuraConnection(auraUrl)}
                className="px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition cursor-pointer shrink-0"
              >
                Probar
              </button>
              <button
                type="button"
                onClick={() => {
                  const auto = resetAuraCoreUrl();
                  setAuraUrl(auto);
                  testAuraConnection(auto);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold transition cursor-pointer shrink-0"
                title="Restaurar URL automática hacia esta PC"
              >
                Auto
              </button>
            </div>

            {/* Campo de PIN de Autorización IA justo debajo de la URL */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Lock className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="PIN de 6 cifras para autorizar IA"
                  value={auraPin}
                  onFocus={() => {
                    if (auraPin === '••••••') {
                      setAuraPin('');
                    }
                  }}
                  onBlur={() => {
                    if (!auraPinEdited && auraPinAuthorized && !auraPin) {
                      setAuraPin('••••••');
                    }
                  }}
                  onChange={(e) => {
                    const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setAuraPin(cleanVal);
                    setAuraPinEdited(true);
                  }}
                  className="w-full bg-[#0f1722] border border-white/10 focus:border-cyan-500 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-cyan-300 font-mono font-bold tracking-widest placeholder:tracking-normal placeholder:font-normal placeholder-slate-500 focus:outline-none shadow-inner"
                />
              </div>
              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border shrink-0 flex items-center gap-1 ${
                  auraPinAuthorized && !auraPinEdited
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                <span>{auraPinAuthorized && !auraPinEdited ? 'PIN Validado' : 'Requiere PIN'}</span>
              </span>
            </div>
            {auraHealth && !auraHealth.checking && !auraHealth.ok && auraHealth.error && (
              <p className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1 leading-snug">
                {auraHealth.error}
              </p>
            )}
            <p className="text-[10px] text-slate-400 leading-tight">
              Toca <strong className="text-amber-300">Auto</strong> para probar directo con la IA de tu computadora por el túnel QR, o pega tu enlace HTTPS de Vercel cuando esté activo.
            </p>

            {/* Botón para abrir la Guía Completa de Deducciones de la IA */}
            <div className="pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsGuideOpen(true)}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-500/10 hover:from-cyan-500/20 to-blue-500/10 hover:to-blue-500/20 border border-cyan-500/30 hover:border-cyan-400/60 text-cyan-300 text-xs font-bold flex items-center justify-between transition cursor-pointer group shadow-xs active:scale-98"
                title="Ver guía completa de todo lo que deduce la IA"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="block text-[11px] font-black text-white truncate">
                      Guía de Deducciones de la IA
                    </span>
                    <span className="block text-[9.5px] text-slate-400 font-medium truncate">
                      Remarks, accesos, cruces DW/SW, fibra EPON y alertas
                    </span>
                  </div>
                </div>
                <div className="w-6 h-6 rounded-lg bg-white/5 group-hover:bg-cyan-500/20 flex items-center justify-center text-slate-400 group-hover:text-cyan-300 transition shrink-0 ml-2">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>

          {saved && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-fade-in shadow-xs">
              <Check className="h-4 w-4 stroke-[3]" />
              <span>¡Configuración y ciclo de cierre actualizados con éxito!</span>
            </div>
          )}
        </div>

        {/* Footer Fijo con Botones Cancelar y Guardar Ajustes */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/90 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-[#16202c] hover:bg-[#1e2a3a] border border-white/10 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition cursor-pointer active:scale-95 text-center"
          >
            Cancelar
          </button>

          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/25 active:scale-95 transition cursor-pointer disabled:opacity-50"
          >
            <Save className="h-4 w-4 stroke-[2.5]" />
            <span>{loading ? 'Guardando...' : 'Guardar Ajustes'}</span>
          </button>
        </div>
      </form>

      {/* Modal Guía Completa de Deducciones de la IA */}
      <AiDeductionGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />
    </div>
  );
}