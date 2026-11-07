# Papa Prato

Dietas e programas alimentares com comida brasileira de verdade, com a couve-flor **Papa** de mascote.

App web instalável no celular (PWA), "local primeiro": tudo funciona no aparelho, e quem cria conta
tem o diário sincronizado na nuvem.

- Produção: https://papa-prato.vercel.app (deploy automático a cada push na `main`)
- Banco e contas: Supabase, projeto `papa-prato` (São Paulo, sa-east-1)

## Rodar

```bash
npm install
npm run dev          # desenvolvimento em http://localhost:5173
npm run build        # versão de produção em dist/
```

Painel administrativo: abra o app com `#admin` no fim do endereço, ou vá em Perfil → Painel administrativo.
Com o servidor ligado, ele pede login de alguém da equipe.

## O que já funciona

**App (pessoa usuária)**
- Cadastro em 9 etapas com o mascote: privacidade e consentimentos, objetivo, dados opcionais, gostos e dieta
  (de tudo, vegetariana, vegana), alergias, região e rotina. A meta diária é estimada pela equação de Mifflin-St Jeor.
- Início: anel de calorias, macros, água com atalhos de 150/250/500 mL e desfazer, próxima refeição do plano, dica do Papa.
- Busca em **18.245 alimentos** (TACO, TBCA, IBGE/POF, USDA, CoFID), com medidas caseiras, sinônimos regionais
  (aipim/macaxeira → mandioca), aviso de alérgenos e citação da fonte.
- Diário por dia e refeição: editar, remover com desfazer, salvar e repetir refeições favoritas.
- Cardápio semanal ajustado à meta, respeitando dieta, alergias, "não como", região e tempo de preparo. Inclui
  trocar refeição, "comi isso" e lista de compras somada da semana, com compartilhamento.
- 7 receitas brasileiras com valores calculados pela base.
- 10 conquistas com comemoração animada do mascote, sem cobrança.
- Acessibilidade: letras maiores, alto contraste, menos animações, tema claro/escuro/automático.
- Privacidade: baixar meus dados (JSON) e apagar tudo.
- Funciona offline depois da primeira visita (service worker).

**Painel administrativo** (módulos do projeto original)
- A01 Painel com indicadores locais e a base por fonte.
- A03 Alimentos: consulta da base oficial (somente leitura) e cadastro de alimentos próprios com rascunho e publicação.
- A05 Cardápios: verificação automática dos modelos (alerta se algum código de alimento sumir numa atualização).
- A06 Conteúdo do mascote: saudações e dicas editáveis, com pré-visualização dos humores.
- Os demais módulos (usuários, assinaturas, suporte, LGPD, IA, profissionais, observabilidade, configuração)
  dependem de servidor e ficam para a fase 2.

## Base de alimentos

`public/data/alimentos.json` é gerado a partir do repositório
[fontes-ref](https://github.com/otaviobmarques/fontes-ref) (pasta `unificado/`):

```bash
python3 scripts/gerar-alimentos.py ../fontes-ref
```

- Os números vêm exatamente da fonte. Itens marcados como `incompleto` ou `inconsistente` ficam de fora.
- A citação de cada fonte aparece na tela do alimento e em Perfil → Fontes (para a TACO, é condição do NEPA/UNICAMP).
- **Alérgenos e dieta vegetariana/vegana são estimados pelo nome do alimento** (`src/lib/alergias.ts`), porque as
  bases não trazem essa informação. O app avisa para conferir o rótulo.

## Estrutura

```
src/components/Mascot.tsx   Papa em SVG (humores: feliz, festa, pensativo; pisca e acena)
src/lib/alimentos.ts        carga da base, busca e cálculo de nutrientes
src/lib/alergias.ts         estimativa de alérgenos e de origem animal
src/lib/metas.ts            metas de energia, macros e água
src/lib/plano.ts            cardápio semanal e lista de compras
src/lib/conquistas.ts       regras das conquistas
src/lib/store.ts            estado local (localStorage)
src/data/cardapio.ts        modelos de refeição e receitas (apontam para códigos da base)
src/screens/                telas do app
src/admin/Admin.tsx         painel administrativo
```

## Fase 2 (contas, código de barras, IA)

- **Contas sem senha**: link de acesso por e-mail (Supabase Auth). Sem conta, o app continua funcionando só no aparelho.
- **Sincronização** (`src/lib/sync.ts`): perfil num documento JSON (`perfis`) e um registro por dia (`dias`);
  em conflito vence o que foi alterado por último. Envia mudanças 2 s depois de acontecerem e sincroniza ao voltar ao app.
- **Privacidade (LGPD)**: RLS em todas as tabelas (cada pessoa só vê o que é seu; a equipe não vê diários),
  histórico de consentimentos (`consentimentos`) e exclusão da conta com todos os dados (`apagar_minha_conta`).
- **Código de barras**: câmera (BarcodeDetector ou zxing no iPhone) ou digitado; dados e alérgenos do rótulo pelo
  Open Food Facts (ODbL), consultados produto a produto.
- **Foto do prato** (`api/analisar-prato.ts`): função da Vercel que chama o Gemini. Exige conta e consentimento,
  limita 20 fotos/hora por pessoa e não guarda a foto. A IA só identifica os alimentos e estima gramas; os valores
  nutricionais vêm da TACO/TBCA e a pessoa revisa antes de salvar.
- **Painel da equipe**: exige login de alguém com papel em `papeis`. E-mails em `convites_equipe` recebem o papel
  ao criar a conta. Alimentos da equipe e textos do mascote ficam no banco e valem para todos.

### Configuração

| Onde | Variável | O quê |
|---|---|---|
| `.env.production` (no repositório) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Valores públicos; a proteção vem das regras RLS |
| Vercel | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Usadas pela função para validar o login |
| Vercel (secreta) | `GOOGLE_SERVICE_ACCOUNT_JSON` | **Preferida**: conta de serviço com papel "Usuário da Vertex AI" |
| Vercel (secreta) | `GEMINI_API_KEY` | Alternativa: chave do Google AI Studio |
| Vercel | `GEMINI_MODEL`, `GOOGLE_CLOUD_LOCATION` | Modelo (padrão `gemini-3.8-flash`) e região do Vertex (padrão `global`) |

No Supabase, em Authentication → URL Configuration: Site URL `https://papa-prato.vercel.app` e Redirect URLs
`https://papa-prato.vercel.app/**` e `http://localhost:5173/**`.

O esquema do banco está em `supabase/migrations/`.

## Próximos passos

1. E-mail próprio para os links de acesso (SMTP, ex.: Resend) e domínio definitivo.
2. Assinaturas, suporte e demais módulos do painel.
3. Conversa com o Papa por IA.
4. Revisão das metas e do cardápio por nutricionista; termos de uso e política de privacidade revisados juridicamente.

> As metas e os cardápios são estimativas educativas e não substituem a orientação de um(a) nutricionista.
