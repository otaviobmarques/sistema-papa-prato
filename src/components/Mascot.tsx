// Papa, a couve-flor mascote do Papa Prato — redesenhada em vetor a partir da arte original
// para poder ser animada (piscar, acenar, comemorar) e ficar nítida em qualquer tamanho.
export type Humor = 'feliz' | 'festa' | 'pensativo'

// Lobos da cabeça (nuvem). Desenhados duas vezes: primeiro com contorno, depois só o recheio,
// para que apareça apenas o contorno externo.
const LOBOS = (
  <>
    <circle cx="140" cy="58" r="42" /><circle cx="100" cy="62" r="30" /><circle cx="192" cy="62" r="28" />
    <circle cx="88" cy="100" r="50" /><circle cx="196" cy="98" r="50" />
    <ellipse cx="142" cy="130" rx="104" ry="62" />
  </>
)

export function Mascot({ size = 120, humor = 'feliz', animado = true, className = '' }: {
  size?: number; humor?: Humor; animado?: boolean; className?: string
}) {
  const festa = humor === 'festa'
  const pensativo = humor === 'pensativo'
  const olhoY = pensativo ? 108 : 114
  return (
    <svg
      viewBox="0 0 290 290" width={size} height={size}
      className={`mascote ${animado ? 'mascote--anim' : ''} mascote--${humor} ${className}`}
      role="img" aria-label="Papa, a couve-flor mascote"
    >
      <g className="mascote-corpo">
        {/* caule e pés */}
        <rect x="125" y="200" width="35" height="66" rx="4" fill="#BEF264" />
        <ellipse cx="122" cy="272" rx="20" ry="11" fill="#15803D" />
        <ellipse cx="162" cy="272" rx="20" ry="11" fill="#15803D" />

        {/* braço esquerdo + garfo */}
        <g className="mascote-braco-esq">
          <g stroke="#14532D" strokeWidth="5" strokeLinecap="round" fill="none">
            <path d="M20 146 V238" />
            <path d="M10 108 V138 Q20 152 30 138 V108 M20 108 V146" />
          </g>
          <path d="M98 186 Q60 200 22 182" stroke="#16A34A" strokeWidth="12" strokeLinecap="round" fill="none" />
          <circle cx="20" cy="182" r="12" fill="#16A34A" />
        </g>

        {/* braço direito (acena) */}
        <g className="mascote-braco-dir">
          <path d={pensativo ? 'M200 192 Q236 196 214 160' : 'M200 192 Q245 186 262 152'} stroke="#16A34A" strokeWidth="12" strokeLinecap="round" fill="none" />
          <circle cx={pensativo ? 212 : 263} cy={pensativo ? 156 : 150} r="12" fill="#16A34A" />
        </g>

        {/* cabeça */}
        <g className="mascote-cabeca">
          <g fill="#FFFBEA" stroke="#D9C38C" strokeWidth="6">{LOBOS}</g>
          <g fill="#FFFBEA">{LOBOS}</g>
          <g stroke="#E6D39B" strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d="M127 36 Q137 26 147 36" /><path d="M70 84 Q80 74 90 84" />
            <path d="M186 66 Q196 56 206 66" /><path d="M54 124 Q64 114 74 124" />
            <path d="M206 116 Q216 106 226 116" /><path d="M150 72 Q158 66 166 72" />
          </g>
          <g className="mascote-olhos">
            <ellipse cx="121" cy={olhoY} rx="11" ry="15" fill="#14532D" />
            <ellipse cx="165" cy={olhoY} rx="11" ry="15" fill="#14532D" />
            <circle cx="125" cy={olhoY - 7} r="3.6" fill="#fff" />
            <circle cx="169" cy={olhoY - 7} r="3.6" fill="#fff" />
          </g>
          <circle cx="97" cy="140" r="11" fill="#FDBA74" />
          <circle cx="189" cy="140" r="11" fill="#FDBA74" />
          {pensativo ? (
            <path d="M133 148 Q143 143 153 148" stroke="#14532D" strokeWidth="4" strokeLinecap="round" fill="none" />
          ) : (
            <>
              <path d={festa ? 'M122 139 H164 Q162 166 143 166 Q124 166 122 139 Z' : 'M125 141 H161 Q159 160 143 160 Q127 160 125 141 Z'} fill="#14532D" />
              <ellipse cx="143" cy={festa ? 160 : 155} rx="9" ry="4.5" fill="#F47A8A" />
            </>
          )}
        </g>

        {/* folhas (gola) */}
        <path d="M142 215 C95 210 50 185 35 147 C80 150 125 165 142 215 Z" fill="#16A34A" />
        <path d="M142 215 C189 210 234 185 249 147 C204 150 159 165 142 215 Z" fill="#16A34A" />
        <g stroke="#86EFAC" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M138 208 Q95 182 48 154" /><path d="M146 208 Q189 182 236 154" />
        </g>
      </g>
    </svg>
  )
}
