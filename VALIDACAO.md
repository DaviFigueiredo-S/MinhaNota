# Validação da revisão do MinhaNota

A base `dad3ef68b32f512d2a8e01df8e3667971ea4ae1a` estava em `main` no remoto `DaviFigueiredo-S/MinhaNota`. Os blobs do HTML, CSS, dois JavaScripts e mascote coincidiram com os bytes servidos pela produção na Vercel.

## Verificações locais

| Verificação | Cobertura |
| --- | --- |
| `node --check` e `node test-core.js` | Três modalidades, bônus limitado a 10, arredondamento, limites de 0 e 10, PI pendente, ATV vazia, meta de 7,38, primeira aprovação da tabela em 7,5 e 7,37 → 4,748 / 7,38 → 4,752. |
| Playwright com Chrome em 1440 × 900, 820 × 1180, 390 × 844 e 320 × 820 | Abertura em Como funciona, modalidade padrão, links com ícones, formulário acima do resultado, entrada decimal, casos pendentes e inviáveis, 21 linhas, abertura e fechamento da tabela por teclado ou toque em viewport móvel, foco visível e ausência de rolagem horizontal. |
| Playwright com a página servida localmente | Atualização da meta ao editar a ATV no formulário, remoção dos campos de hipóteses, restauração de cenários antigos pelo resumo por disciplina, persistência após recarregar, cópia e seleção manual se o navegador recusar a cópia. |

Os arquivos estáticos foram servidos diretamente durante o teste. O repositório não possui etapa de build. A validação de celular usou emulação de viewport e toque no Chrome.

## Precisão da P2

O site da FSA informa a média semestral mínima de 5,0. A consulta às fontes públicas não confirmou a quantidade de casas decimais aceita no lançamento oficial da P2. O formulário e as metas em centésimos descrevem a precisão da calculadora. [Sucesso do Aluno](https://www.fsa.br/sucesso-do-aluno/) · [Regulamento Acadêmico de Graduação de 2026](https://drive.google.com/file/d/1dUVY_w9bfP83WAVbATX0MFNaaaZSXEJO/view)
