import React, { useState } from 'react';
import { 
  X, DollarSign, Calendar, Tag, FileText, Camera, 
  Upload, Fuel, Wrench, Car, Utensils, Smartphone, Shield, Package, Check,
  AlertCircle
} from 'lucide-react';
import { getLocalDateStr } from '../utils/dateUtils';

const CATEGORIES = [
  { id: 'Combustible', label: 'Gasolina / Combustible', icon: Fuel, color: 'text-amber-400' },
  { id: 'Herramientas', label: 'Herramientas / Material', icon: Wrench, color: 'text-cyan-400' },
  { id: 'Vehículo', label: 'Mantenimiento Van / Auto', icon: Car, color: 'text-blue-400' },
  { id: 'Alimentación', label: 'Comida / Viáticos', icon: Utensils, color: 'text-orange-400' },
  { id: 'Telefonía', label: 'Teléfono / Internet', icon: Smartphone, color: 'text-emerald-400' },
  { id: 'Seguro', label: 'Seguros / Licencias', icon: Shield, color: 'text-purple-400' },
  { id: 'Otros', label: 'Otros Gastos', icon: Package, color: 'text-slate-400' },
];

export default function AddExpenseModal({ isOpen, onClose, onExpenseAdded, initialDate }) {
  const [category, setCategory] = useState('Combustible');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(initialDate || getLocalDateStr());
  const [receiptFiles, setReceiptFiles] = useState([]);
  const [receiptPreviews, setReceiptPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setReceiptFiles((prev) => [...prev, ...files]);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setReceiptPreviews((prev) => [...prev, ev.target.result]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleRemoveReceiptPhoto = (idx) => {
    setReceiptFiles((prev) => prev.filter((_, i) => i !== idx));
    setReceiptPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanAmount = String(amount).replace(/[^0-9.]/g, '');
    const numAmount = parseFloat(cleanAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Por favor ingresa un monto numérico válido mayor a $0.00 (ej. 45.00)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('expense_date', expenseDate);
      formData.append('category', category);
      formData.append('description', description.trim() || category);
      formData.append('amount', numAmount);
      receiptFiles.forEach((file) => {
        formData.append('receipt_photos', file);
      });

      const res = await fetch('/api/expenses', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar el gasto');
      }

      // Reset & notify
      setAmount('');
      setDescription('');
      setReceiptFiles([]);
      setReceiptPreviews([]);
      if (onExpenseAdded) onExpenseAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = [20, 35, 50, 75, 100];
  const numParsed = parseFloat(String(amount).replace(/[^0-9.]/g, ''));
  const displayAmount = !isNaN(numParsed) && numParsed > 0 ? `$${numParsed.toFixed(2)}` : '$0.00';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe">
      <div 
        className="bg-[#101722] border border-white/10 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[78dvh] sm:max-h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Cockpit */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-500/20 text-white font-bold shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono truncate">
                Registrar Gasto
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                Deducciones operativas e insumos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0 ml-2"
            title="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-box KPI bar */}
        <div className="grid grid-cols-3 gap-2 px-4 py-2.5 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
          <div className="bg-[#16202c] border border-white/5 rounded-xl py-1.5 px-1">
            <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Monto USD</span>
            <span className="text-xs sm:text-sm font-black font-mono text-rose-400 leading-none">
              {displayAmount}
            </span>
          </div>
          <div className="bg-[#16202c] border border-white/5 rounded-xl py-1.5 px-1">
            <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Categoría</span>
            <span className="text-xs sm:text-sm font-black text-amber-300 font-mono leading-none truncate block">
              {category}
            </span>
          </div>
          <div className="bg-[#16202c] border border-white/5 rounded-xl py-1.5 px-1">
            <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Tickets</span>
            <span className="text-xs sm:text-sm font-black text-cyan-400 font-mono leading-none">
              {receiptFiles.length} {receiptFiles.length === 1 ? 'adjunto' : 'adjuntos'}
            </span>
          </div>
        </div>

        {/* Form Body con Scroll */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 overflow-y-auto space-y-3.5 flex-1 min-h-0">
            
            {/* Mensaje de error si ocurre */}
            {error && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Input de Monto */}
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">
                Monto del Gasto ($ USD) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-black text-rose-400 font-mono">
                  $
                </span>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  autoFocus
                  required
                  className="w-full bg-[#16202c] border border-white/10 focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/40 rounded-2xl py-2.5 pl-8 pr-3 text-xl font-black text-white font-mono placeholder-slate-600 outline-none transition"
                />
              </div>

              {/* Botones de Montos Rápidos */}
              <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 no-scrollbar">
                {quickAmounts.map((q) => (
                  <button
                    type="button"
                    key={q}
                    onClick={() => setAmount(String(q))}
                    className="px-2.5 py-1 rounded-xl text-xs font-black font-mono bg-[#16202c] hover:bg-[#1f2d3d] text-slate-300 hover:text-white border border-white/10 transition active:scale-95 shrink-0"
                  >
                    +${q}
                  </button>
                ))}
              </div>
            </div>

            {/* Selección de Categoría */}
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">
                Categoría
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.id;
                  return (
                    <button
                      type="button"
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-left text-xs transition ${
                        isSelected
                          ? 'border-rose-500/60 bg-rose-500/15 text-white font-bold ring-1 ring-rose-500/30'
                          : 'border-white/5 bg-[#16202c] text-slate-400 hover:text-slate-200 hover:bg-[#1f2d3d]'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-rose-400' : cat.color}`} />
                      <span className="truncate text-[11px]">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Descripción (Opcional) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Descripción (Opcional)
                </label>
                <span className="text-[10px] text-slate-500 font-mono">
                  Por defecto: {category}
                </span>
              </div>
              <input
                type="text"
                placeholder={`Ej: ${category === 'Combustible' ? 'Gasolina Van de trabajo' : category === 'Herramientas' ? 'Brocas 3/8, Conectores' : 'Detalle opcional...'}`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#16202c] border border-white/10 focus:border-rose-500/50 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-600 outline-none transition"
              />
            </div>

            {/* Fecha del Gasto */}
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">
                Fecha del Gasto
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full bg-[#16202c] border border-white/10 focus:border-rose-500/50 rounded-xl py-2 pl-9 pr-3 text-xs text-white outline-none transition font-mono"
                />
              </div>
            </div>

            {/* Comprobantes o Tickets Adjuntos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Comprobante o Ticket (Opcional)
                </label>
                {receiptPreviews.length > 0 && (
                  <span className="text-[10px] font-bold text-rose-400 font-mono">
                    {receiptPreviews.length} {receiptPreviews.length === 1 ? 'ticket adjunto' : 'tickets adjuntos'}
                  </span>
                )}
              </div>

              {/* Botones de Acción Estilizados */}
              <div className="grid grid-cols-2 gap-2">
                <label className="py-2.5 px-3 bg-[#16202c] hover:bg-[#1f2d3d] border border-white/10 hover:border-cyan-500/40 rounded-xl text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs text-center">
                  <Camera className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>+ Cámara</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>

                <label className="py-2.5 px-3 bg-[#16202c] hover:bg-[#1f2d3d] border border-white/10 hover:border-cyan-500/40 rounded-xl text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs text-center">
                  <Upload className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>+ Galería</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Tira Horizontal de Tickets */}
              {receiptPreviews.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar">
                  {receiptPreviews.map((src, idx) => (
                    <div
                      key={idx}
                      className="relative w-20 h-16 flex-shrink-0 rounded-xl overflow-hidden border border-white/10 bg-[#0d141e] shadow-sm"
                    >
                      <img src={src} alt={`Ticket ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveReceiptPhoto(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow active:scale-90 transition"
                        title="Quitar ticket"
                      >
                        <X className="w-2.5 h-2.5 stroke-[2.5]" />
                      </button>
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.2 rounded bg-black/75 text-[9px] font-mono text-white/90">
                        #{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Nota Informativa */}
            <div className="bg-[#16202c] border border-white/5 p-2.5 rounded-2xl text-[10px] text-slate-400 flex items-start gap-2">
              <span className="text-amber-400 shrink-0 font-bold">ℹ️</span>
              <p className="leading-tight">
                <strong className="text-slate-300">Nota:</strong> Este gasto se deduce de tus ingresos brutos para el cálculo del balance neto.
              </p>
            </div>
          </div>

          {/* Footer Estandarizado Cockpit */}
          <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition active:scale-95 border border-white/10"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading}
              className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-400 hover:to-amber-500 text-white font-black text-xs shadow-lg shadow-rose-500/25 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Guardar Gasto</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
