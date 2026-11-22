import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Error inesperado en la interfaz.'
    };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught an error:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#0b1017] text-slate-100 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[#131b26] border border-rose-500/30 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-black text-white">Ocurrió un error en pantalla</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tus datos guardados están seguros. Recarga la vista para continuar trabajando normalmente.
              </p>
              {this.state.errorMessage && (
                <p className="text-[10.5px] font-mono text-rose-300/90 bg-rose-950/40 border border-rose-500/20 rounded-xl p-2 mt-2 break-words">
                  {this.state.errorMessage}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 transition"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Recargar Aplicación</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
