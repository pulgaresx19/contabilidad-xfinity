import React from 'react';

export default function EmptyStateCard({
  icon: Icon,
  title,
  description,
  action = null,
  iconColor = 'cyan',
  className = ''
}) {
  const colorMap = {
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
    slate: 'bg-slate-500/10 border-slate-500/20 text-slate-400'
  };

  const badgeClass = colorMap[iconColor] || colorMap.cyan;

  return (
    <div className={`bg-[#0f1722]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center shadow-lg flex flex-col items-center justify-center space-y-3 my-4 select-none ${className}`}>
      {Icon && (
        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${badgeClass}`}>
          <Icon className="h-6 w-6 stroke-[2]" />
        </div>
      )}
      <div className="space-y-1 max-w-xs mx-auto">
        {title && <h4 className="text-sm font-black text-white">{title}</h4>}
        {description && (
          <p className="text-xs text-slate-400 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="pt-1">
          {action}
        </div>
      )}
    </div>
  );
}
