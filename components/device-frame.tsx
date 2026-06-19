interface Props {
  type: "desktop" | "mobile";
  children: React.ReactNode;
  className?: string;
}

export function DeviceFrame({ type, children, className = "" }: Props) {
  if (type === "desktop") {
    return (
      <div className={`border border-zinc-800 bg-zinc-900 overflow-hidden ${className}`}>
        {/* Browser chrome */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800 bg-zinc-950 shrink-0">
          <span className="w-2 h-2 rounded-full bg-zinc-700" />
          <span className="w-2 h-2 rounded-full bg-zinc-700" />
          <span className="w-2 h-2 rounded-full bg-zinc-700" />
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={`border border-zinc-800 bg-zinc-900 overflow-hidden ${className}`}>
      {/* Status bar */}
      <div className="h-2 bg-zinc-950" />
      {children}
      {/* Home indicator */}
      <div className="h-3 bg-zinc-950 flex items-center justify-center">
        <span className="w-10 h-px bg-zinc-700" />
      </div>
    </div>
  );
}
