import React from "react";

// Shared glass-panel shell for every card-like surface in the app (Insights
// widgets, filter panels, table wrappers). Keeping this in one place is what
// lets the whole UI read as one system instead of ad-hoc Tailwind strings
// repeated across a dozen files.
export default function Card({
  title,
  subtitle,
  icon: Icon,
  actions,
  className = "",
  bodyClassName = "",
  children,
}) {
  return (
    <div
      className={`relative rounded-xl border border-subtle bg-surface2/70 backdrop-blur-xl shadow-card ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && (
              <span className="grid place-items-center w-6 h-6 rounded-md bg-surface3 text-accent-blue flex-shrink-0">
                <Icon size={13} strokeWidth={2.25} />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[10px] text-faint mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions}
        </div>
      )}
      <div className={bodyClassName || (title ? "px-4 pb-4" : "p-4")}>
        {children}
      </div>
    </div>
  );
}
