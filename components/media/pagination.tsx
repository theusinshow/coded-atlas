import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const LINK = "inline-flex h-10 items-center gap-1.5 px-2 text-[13px] text-accent hover:text-accent-bright";

/** Paginação simples das grades de mídia ("Página anterior" / "Próxima página"). */
export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 border-t border-line pt-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={`${LINK} -ml-2`}>
          <ChevronLeft size={16} aria-hidden />
          Página anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-[12px] tabular-nums text-cbm-gray-400">
        {page} de {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={`${LINK} -mr-2`}>
          Próxima página
          <ChevronRight size={16} aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
