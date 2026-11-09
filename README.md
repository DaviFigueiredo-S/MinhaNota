# MinhaNota

Calculadora acadêmica para ver a média semestral, descobrir a meta da P2 e salvar cenários por disciplina. Funciona com HTML, CSS e JavaScript estáticos.

## Abrir a calculadora

Abra `index.html` em um navegador atualizado, mantendo `style.css`, `calculator-core.js`, `script.js` e a pasta `assets` no mesmo diretório. A calculadora também pode ser servida diretamente por um servidor estático. A página sempre começa em **Como funciona**. A área **Minhas notas** reúne o resultado, a tabela recolhível de 21 cenários, a simulação livre e a comparação de ATV.

## Cálculo

| Modalidade | Média bruta |
| --- | --- |
| Com Prova Integrada | `0,4 × (P1 + P2) + 0,1 × (PI + ATV)` |
| Com bônus de apresentação (+0,5) | `0,4 × P1 + 0,4 × mín(10, P2 + 0,5) + 0,2 × ATV` |
| Não tenho nenhumas dessas alternativas | `0,4 × (P1 + P2) + 0,2 × ATV` |

O bônus é somado uma vez e a P2 efetiva fica limitada a 10. Na calculadora, frações abaixo de 0,25 ficam no inteiro, a partir de 0,25 sobem para meio ponto e a partir de 0,75 sobem para o próximo inteiro. O corte de 5,0 após o arredondamento corresponde a **4,750 de média bruta**. A média bruta é exibida com três casas decimais. A decisão usa o valor calculado antes da formatação.

A meta encontra a menor P2 entre 0 e 10 na escala do formulário, que aceita até duas casas decimais para novas entradas de P2. A tabela usa passos de 0,5. A primeira aprovação da tabela pode ficar acima da meta. A documentação pública consultada informa o corte, mas não especifica a precisão do lançamento de P2. [Orientações da FSA](https://www.fsa.br/sucesso-do-aluno/) · [Regulamento Acadêmico de Graduação de 2026](https://drive.google.com/file/d/1dUVY_w9bfP83WAVbATX0MFNaaaZSXEJO/view)

### Notas pendentes e hipóteses

- Com a P2 pendente, informe a P1 para calcular a meta. Com a P2 informada e a P1 pendente, o resultado usa P1 igual a zero como projeção explícita.
- Uma ATV vazia vale zero somente na projeção. Uma PI vazia produz uma faixa usando PI de 0 a 10. Quando a PI pode mudar o resultado, a calculadora distingue a meta garantida da meta no melhor caso.
- A P2 hipotética e a ATV hipotética têm campos próprios. A simulação livre usa a ATV hipotética quando preenchida, e o resultado principal e a tabela usam as notas informadas. O resumo copiado distingue as hipóteses.

### Cenários salvos

A chave `media-certa-state-v1` é compartilhada com a versão anterior. O resumo mostra o cenário mais recente por disciplina, inclusive o mais recente sem disciplina. Os demais registros continuam armazenados no navegador. As notas dependem da mesma origem do site para acesso entre versões.

## Verificações

```sh
node --check calculator-core.js
node --check script.js
node --check test-browser.js
node test-core.js
```

O projeto é estático e não tem etapa de build. Para os testes de interface, instale Playwright em um ambiente Node.js e execute `npx playwright install chromium` e `node test-browser.js`. O teste serve os arquivos do projeto em uma porta local. Se usar um Chrome já instalado, defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE` com o caminho do executável.
