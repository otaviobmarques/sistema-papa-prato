// Assinatura "Um sistema da Domma Tecnologia" (marca redesenhada em vetor: onda + ponto).
export function LogoDomma({ altura = 22, escuro = false }: { altura?: number; escuro?: boolean }) {
  const tinta = escuro ? '#FFFFFF' : '#1B1035'
  return (
    <svg height={altura} viewBox="0 0 330 70" role="img" aria-label="Domma Tecnologia" style={{ display: 'block' }}>
      <path d="M9 50 C20 30 24 22 30 22 C38 22 44 62 52 62 C60 62 66 22 74 22 C80 22 84 30 95 50" stroke="#6C5CF6" strokeWidth="13" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="52" cy="11" r="9" fill={tinta} />
      <text x="112" y="44" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="44" fill={tinta} letterSpacing="-1">Domma</text>
      <text x="114" y="66" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="14.5" fill="#6C5CF6" letterSpacing="7.2">TECNOLOGIA</text>
    </svg>
  )
}

export function Assinatura({ escuro = false, centro = false }: { escuro?: boolean; centro?: boolean }) {
  return (
    <div className="assinatura" style={{ justifyContent: centro ? 'center' : 'flex-start', color: escuro ? '#CFE7DA' : 'var(--ink-3)' }} aria-label="Um sistema da Domma Tecnologia">
      <span>Um sistema da</span><LogoDomma escuro={escuro} />
    </div>
  )
}
