import React, { useState } from 'react';
import { 
  X, DollarSign, Calendar, Tag, FileText, Camera, 
  Upload, Fuel, Wrench, Car, Utensils, Smartphone, Shield, Package, Check 
} from 'lucide-react';
import { getLocalDateStr } from '../utils/dateUtils';

const CATEGORIES = [
  { id: 'Combustible', label: 'Gasolina / Combustible', icon: Fuel, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { id: 'Herramientas', label: 'Herramientas / Material', icon: Wrench, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  { id: 'Vehículo', label: 'Mantenimiento Van / Auto', icon: Car, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { id: 'Alimentación', label: 'Comida / Viáticos', icon: Utensils, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  { id: 'Telefonía', label: 'Teléfono / Internet', icon: Smartphone, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { id: 'Seguro', label: 'Seguros / Licencias', icon: Shield, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  { id: 'Otros', label: 'Otros Gastos', icon: Package, color: 'text-slate-400 bg-slate-500/10 border-slate-500/30' },
];

export default function AddExpenseModal({ isOpen, onClose, onExpenseAdded, initialDate }) {
  const [category, setCategory] = useState('Combustible');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(initialDate || getLocalDateStr());
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setReceiptPreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Ingresa un monto válido mayor a 0');
      return;
    }
    if (!description.trim()) {
      setError('Ingresa una breve descripción del gasto');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('expense_date', expenseDate);
      formData.append('category', category);
      formData.append('description', description.trim());
      formData.append('amount', numAmount);
      if (receiptFile) {
        formData.append('receipt_photo', receiptFile);
      }

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
      setReceiptFile(null);
      setReceiptPreview(null);
      if (onExpenseAdded) onExpenseAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = [20, 35, 50, 75, 100];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <DollarSign className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Registrar Gasto Mensual</h2>
              <p className="text-xs text-slate-400">Control de combustible, insumos y herramientas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Amount input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Monto del Gasto ($ USD) *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-2xl py-3 pl-10 pr-4 text-2xl font-black text-white placeholder-slate-600 outline-none transition"
              />
            </div>
            {/* Quick buttons */}
            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
              {quickAmounts.map((q) => (
                <button
                  type="button"
                  key={q}
                  onClick={() => setAmount(String(q))}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition shrink-0"
                >
                  +${q}
                </button>
              ))}
            </div>
          </div>

          {/* Category selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Categoría
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs transition ${
                      isSelected
                        ? 'border-rose-500 bg-rose-500/10 text-white font-bold ring-1 ring-rose-500/30'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-rose-400' : 'text-slate-400'}`} />
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Descripción o Motivo *
            </label>
            <input
              type="text"
              placeholder="Ej: Gasolina Van principal, Brocas 3/8, Aceite"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-slate-600 outline-none transition"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Fecha del Gasto
            </label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white outline-none transition"
              />
            </div>
          </div>

          {/* Optional Receipt Photo */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Comprobante o Ticket (Opcional)
            </label>
            {receiptPreview ? (
              <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 aspect-[16/9] flex items-center justify-center">
                <img src={receiptPreview} alt="Receipt preview" className="object-contain w-full h-full" />
                <button
                  type="button"
                  onClick={() => {
                    setReceiptFile(null);
                    setReceiptPreview(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 text-rose-400 hover:bg-slate-900 border border-rose-500/30"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-700 hover:border-slate-500 bg-slate-950/40 text-slate-300 hover:text-white cursor-pointer transition text-xs font-medium">
                  <Camera className="w-4 h-4 text-rose-400" />
                  <span>Tomar Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>
                <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-700 hover:border-slate-500 bg-slate-950/40 text-slate-300 hover:text-white cursor-pointer transition text-xs font-medium">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>Galería</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-600 hover:to-amber-700 text-white font-bold text-sm shadow-lg shadow-rose-950/40 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
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
