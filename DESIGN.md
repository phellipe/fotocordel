# Sistema visual do Fotocordel

As duas versões permanecem disponíveis: **V1 original em `/fotocordel/`** e **V2 cordel em `/fotocordel/v2/`**. Os recursos em `assets/` são compartilhados; cada versão conserva seus estilos e comportamento.

## V1 — original preservada

Implementação da raiz (`index.html`, `styles.css`, `app.js`), com base em `0f21bf7`. Composição editorial com foto pendurada, cordão, papel claro, azul forte e detalhes de barro.

- Fontes: **Fraunces 700** para títulos, **Cormorant 400 itálico** para notas e versos de destaque, **DM Sans 400** para interface; base 15px / 1,65.
- Tokens: papel `#f1ebde`, tinta `#1c302e`, azul `#193b88`, barro `#a33e26`, secundário `#63665b`, linha `#b9b6a8`.
- Galeria original de três colunas no desktop, duas até 680px e uma até 360px; sem seletor de modo. Ajustes adicionais em 1000px e acima de 1600px.
- Som ativado pelo visitante na seção sonora. Não acrescentar à V1 os controles ou o autoplay da V2 ao fazer manutenção compartilhada.

## V2 — folheto de cordel

Implementação em `v2/`: papel quente, tinta escura, gravura de sertão e mar, fotografias apresentadas como folhas completas. Os tokens e detalhes abaixo se referem à V2.

### Cores

| Token | Valor | Uso |
| --- | --- | --- |
| `--paper` | `#ecdbaf` | Papel da página e capa. |
| `--leaf` | `#f6ecd3` | Folhas, leitor e texto claro. |
| `--ink` | `#24251d` | Texto, molduras, botões e fundo do varal. |
| `--blue` | `#284d64` | Área sonora e seleção de texto. |
| `--clay` | `#963f26` | Encerramento, foco e hover do botão principal. |
| `--muted` | `#625842` | Legendas secundárias em superfícies claras. |
| `--line` | `#a49777` | Divisórias e bordas secundárias. |

Folhas alternadas usam `#e7d5a9`; o fundo da imagem ampliada é `#e6dcc2`. Superfícies chapadas, cantos retos e sem gradientes. A sombra discreta do controle de som distingue um elemento flutuante.

### Tipografia

- **Rye 400**, local, para marca e títulos de seção. H1 em maiúsculas: `clamp(50px, 10.8vw, 120px)` no desktop; `10.5vw` no celular. H2 geral: `clamp(32px, 3.6vw, 54px)`.
- **DM Sans 400**, local, para corpo e controles. Base: 16px / 1,7. Navegação e botões: 12–15px, conforme viewport.
- **Georgia**, do sistema, para a frase de capa, títulos das obras e versos. Poemas no leitor: 21px / 1,6 no desktop; 20px / 1,65 no celular. Preservar as quebras das estrofes.

### Composição e imagens

A capa tem largura máxima de 1100px, borda externa de 3px e interna de 1px afastada 7px. A gravura 3:1 é exibida inteira, com `mix-blend-mode: multiply`. No celular, a moldura externa passa a 2px.

Seções usam 90px de espaço vertical e laterais de `max(5vw, 24px)`. A abertura contrapõe uma fotografia horizontal à apresentação. O varal usa fundo de tinta e folhas com cabeçalho, imagem, título e categoria. Nunca cortar poemas ou assinaturas das fotografias.

| Faixa | Folhas grandes | Visão geral | Ajustes |
| --- | --- | --- | --- |
| Acima de 1050px | 2 colunas | 3 colunas | Espaçamento amplo; seções em pares de colunas. |
| 741–1050px | 2 colunas | 3 colunas | Espaços e tipografia reduzidos. |
| Até 740px | 1 coluna | 2 colunas | Seções empilhadas; dock de som central inferior; leitor vertical. |
| Até 370px | 1 coluna | 2 colunas | Controles compactos e seletor de visão empilhado. |

Acima de 1600px, laterais limitam a área útil a aproximadamente 1400px. A galeria usa colunas CSS com `break-inside: avoid`; a ordem visual percorre cada coluna de cima para baixo.

### Interação e acessibilidade

Filtros e modos comunicam seleção por `aria-pressed`. Foco usa contorno de 3px em barro; há atalho para pular à galeria. O leitor é um `dialog` nativo de tela cheia com foco contido, devolução do foco, imagem inteira, zoom e versos em texto. O som pode ser silenciado no dock, na seção sonora ou dentro do leitor.

Movimento limitado a feedback de links e indicador sonoro. `prefers-reduced-motion` remove animações, transições e rolagem suave. A arte decorativa não substitui fotografias, poemas, créditos ou controles.

## Procedência e preservação

As duas versões mantêm o acervo sem recorte. A V1 não deve ser substituída pela V2; comparações e novos refinamentos devem conservar os dois endereços. `assets/qr/fotocordel-qr.*` permanece apontando à V1; `assets/qr/fotocordel-v2-qr.*` aponta diretamente à V2.

Gravura original gerada por `image_gen`: `assets/art/README.md`. Referências consultadas: [Allegorical Engraving Cover](https://skillry.dev/skills/bs-allegorical-engraving-cover), [Collage Creative Portfolio](https://skillry.dev/skills/bs-collage-creative-portfolio), [Cut-Paper Collective](https://skillry.dev/skills/bs-cutpaper-collective-site) e [Impeccable](https://impeccable.style/slop/). Não são dependências nem pacotes instalados.
