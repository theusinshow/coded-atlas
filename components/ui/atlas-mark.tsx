/**
 * Símbolo do Coded Atlas (docs/BRAND.md): visor de captura — dois cantos em
 * off-white cortados pela diagonal do sinal, na gramática do símbolo da Coded by M.
 * Abaixo de 40px usa o traço grosso (legibilidade); os arquivos ficam em public/brand.
 */
export function AtlasMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  const stroke = size < 40 ? 18 : 12;
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none" aria-hidden="true" className={className}>
      <path d="M98 14H146V62" stroke="#F5F2ED" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 98V146H62" stroke="#F5F2ED" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 14L146 146" stroke="#FB3640" strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  );
}
