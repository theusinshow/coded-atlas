import type { Catalog } from "@/lib/types";

interface Props {
  catalog: Catalog;
}

export function AssetDownloads({ catalog }: Props) {
  const files = [
    { label: "Desktop — Viewport",   href: catalog.captures.desktop.screenshot, ext: "PNG" },
    { label: "Desktop — Full Page",  href: catalog.captures.desktop.fullpage,   ext: "PNG" },
    { label: "Mobile — Viewport",    href: catalog.captures.mobile.screenshot,  ext: "PNG" },
    { label: "Mobile — Full Page",   href: catalog.captures.mobile.fullpage,    ext: "PNG" },
    { label: "Thumbnail Principal",  href: catalog.thumbnails.main,             ext: "WEBP" },
    { label: "Thumbnail Mobile",     href: catalog.thumbnails.mobile,           ext: "WEBP" },
  ];

  return (
    <section aria-label="Downloads">
      <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">
        Downloads
      </h2>
      <ul className="divide-y divide-zinc-800 border border-zinc-800">
        {files.map(({ label, href, ext }) => (
          <li key={href}>
            <a
              href={href}
              download
              className="flex items-center justify-between px-4 py-3 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors group cursor-pointer"
            >
              <span className="text-sm">{label}</span>
              <span className="flex items-center gap-2 text-[10px] font-mono text-zinc-600 group-hover:text-zinc-400 transition-colors">
                <span>{ext}</span>
                <span>↓</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
