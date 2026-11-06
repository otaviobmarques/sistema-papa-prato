# Papa Prato

Dietas e programas alimentares com comida brasileira de verdade, com a couve-flor **Papa** de mascote.

Versão 0.1: app web instalável no celular (PWA), que funciona sem servidor. Os dados da pessoa ficam no aparelho.

## Rodar

```bash
npm install
npm run dev          # desenvolvimento em http://localhost:5173
npm run build        # versão de produção em dist/
```

Painel administrativo: abra o app com `#/admin` no fim do endereço, ou vá em Perfil → Painel administrativo.

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

## Próximos passos (fase 2)

1. Contas e sincronização (ex.: Supabase), com os dados de saúde protegidos por linha (RLS).
2. Leitura de código de barras com Open Food Facts (consulta produto a produto, licença ODbL).
3. Foto do prato e conversa com o Papa por IA, só com consentimento.
4. Assinaturas, suporte e papéis no painel.
5. Revisão das metas e do cardápio por nutricionista; termos de uso e política de privacidade (LGPD) revisados juridicamente.

> As metas e os cardápios são estimativas educativas e não substituem a orientação de um(a) nutricionista.
