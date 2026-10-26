import React, { useState, useRef } from 'react';
import { X, Upload, Trash2, Camera, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';

export default function PhotoModal({ order, isOpen, onClose, onPhotoUpdated }) {
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('Pedestal/Tap');
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen || !order) return null;

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('category', category);
    for (let i = 0; i < files.length; i++) {
      formData.append('photos', files[i]);
    }

    try {
      const res = await fetch(`/api/orders/${order.id}/photos`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        onPhotoUpdated();
      } else {
        setError(data.error || 'Error al subir fotos');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!confirm('¿Eliminar esta foto de evidencia?')) return;
    try {
      const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
      if (res.ok) {
        onPhotoUpdated();
      }
    } catch (err) {
      alert('Error eliminando foto: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-cyan-400" />
              <h3 className="font-bold text-white text-lg">Evidencias Fotográficas</h3>
              <span className="text-xs bg-cyan-950 text-cyan-400 border border-cyan-800/80 px-2 py-0.5 rounded font-mono">
                Job #{order.job_id}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{order.address}, {order.city}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Upload Controls */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Subir Nueva Foto (Desde Móvil o PC)
            </h4>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-sm rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="Pedestal/Tap">Pedestal / Tap</option>
                <option value="Casa/Ground Block">Casa / Ground Block</option>
                <option value="Ruta del Cable">Ruta del Cable / Zanja</option>
                <option value="Bore/Cruce">Cruce / Driveway Bore</option>
                <option value="General">General</option>
              </select>

              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-sm rounded-lg cursor-pointer transition shadow-md shadow-cyan-600/20">
                <Upload className="h-4 w-4" />
                <span>{uploading ? 'Subiendo...' : 'Seleccionar Fotos o Abrir Cámara'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-xs mt-3">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Photo Gallery */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Fotos Adjuntas ({order.photos ? order.photos.length : 0})
              </h4>
            </div>

            {(!order.photos || order.photos.length === 0) ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-xl">
                <ImageIcon className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400 font-medium">Aún no hay fotos registradas para este trabajo.</p>
                <p className="text-xs text-slate-500 mt-1">Usa el botón de arriba para subir evidencias de la instalación.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {order.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative bg-slate-800/80 border border-slate-700/60 rounded-xl overflow-hidden aspect-video shadow-md hover:border-slate-500 transition"
                  >
                    <img
                      src={`/uploads/${photo.filename}`}
                      alt={photo.category}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-90 group-hover:opacity-100 transition flex flex-col justify-between p-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] bg-slate-900/90 text-cyan-300 border border-slate-700 px-1.5 py-0.5 rounded">
                          {photo.category}
                        </span>
                        <button
                          onClick={() => handleDeletePhoto(photo.id)}
                          title="Eliminar foto"
                          className="p-1 bg-rose-600/90 hover:bg-rose-500 text-white rounded opacity-0 group-hover:opacity-100 transition shadow"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <a
                        href={`/uploads/${photo.filename}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-slate-200 truncate hover:underline"
                      >
                        Ver a tamaño completo ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
