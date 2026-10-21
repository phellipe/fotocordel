# Fotocordel

Exposição estática de 17 fotopoesias de Marcello Tubarão, com **duas versões preservadas para comparação**.

| Versão | Endereço | Direção |
| --- | --- | --- |
| V1 — original | [Abrir V1](https://phellipe.eti.br/fotocordel/) | “Entre o sal e a palavra”: composição editorial, azul, papel claro e fotografia pendurada no varal. |
| V2 — cordel | [Abrir V2](https://phellipe.eti.br/fotocordel/v2/) | “O mar e o sertão. Na palma da sua mão.”: folheto com moldura dupla, Rye e xilogravura. |

[Repositório](https://github.com/phellipe/fotocordel). A V1 mantém a base visual e o comportamento da versão original (`0f21bf7`); a V2 continua disponível em `/v2/`.

## Executar e publicar

Na pasta do projeto, execute `python -m http.server 4173 --bind 127.0.0.1` e abra [V1 local](http://127.0.0.1:4173/) ou [V2 local](http://127.0.0.1:4173/v2/).

Não há instalação para visualizar, build ou backend. HTML, CSS, JavaScript, fontes, imagens e QR são locais. O GitHub Pages publica a raiz de `main` após commit e push; `.nojekyll` dispensa o Jekyll. O endereço `https://phellipe.github.io/fotocordel/` redireciona para o domínio público acima.

## Experiência das versões

- Ambas preservam fotografias e versos completos, filtros por mar, terra e afetos e leitor com transcrição, créditos, zoom e navegação anterior/próxima. As setas navegam; Escape fecha.
- **V1:** galeria original; som desligado inicialmente, ativado pelo visitante na seção sonora.
- **V2:** “Folhas grandes” e “Visão geral”; mar habilitado por padrão, com tentativa de autoplay e liberação na primeira interação válida quando o navegador bloquear. Há controle flutuante e controle dentro do leitor.
- Na V2, a escolha de silenciar é salva em `localStorage` (`fotocordel.sound.muted`). Paisagem e volume reiniciam em mar e 22%. As duas versões oferecem volume, vento e pausa em segundo plano. São ambientes sintetizados com Web Audio, não gravações dos locais.

## Arquivos e manutenção

| Arquivo | Função |
| --- | --- |
| `gallery-data.js` | Obras, títulos de navegação, descrições, transcrições e créditos. Os títulos editoriais não substituem os das imagens. |
| `index.html`, `styles.css`, `app.js`, `sound.js` | Página e comportamento da V1 original. |
| `v2/` | Página, estilos e comportamento da V2 de cordel; usa os recursos compartilhados da raiz. |
| `assets/photos/` | Miniaturas e versões completas em WebP; originais locais em `images/`, ignorados pelo Git. |
| `assets/art/` | Arte de abertura, original PNG e documentação de geração. |
| `assets/qr/` | `fotocordel-qr.png/.svg` abre a V1; `fotocordel-v2-qr.png/.svg` abre a V2. |
| `DESIGN.md` / `PRODUCT.md` | Sistema visual atual / escopo e conteúdo do produto. |

Para atualizar as imagens: instale Pillow (`python -m pip install Pillow`), execute `python scripts/prepare-images.py` e ajuste `gallery-data.js`. A galeria carrega miniaturas; o leitor busca a versão completa, e a obra em destaque já usa a versão completa. Revise transcrições com o autor.

Para recriar os QRs: `python -m pip install qrcode Pillow` e `python scripts/create-qr.py`. O padrão gera ambos; `--version v1`, `--version v2` ou `--version both` seleciona a saída.

- **QR original:** `fotocordel-qr.png/.svg` codifica `https://phellipe.github.io/fotocordel/`, que redireciona à V1. Seu destino foi preservado.
- **QR da V2:** `fotocordel-v2-qr.png/.svg` codifica `https://phellipe.eti.br/fotocordel/v2/`.

A referência azul de macramê é um estudo visual, não um código escaneável verificado; para a peça física, preserve módulos e margem da matriz funcional e teste a leitura.

## Arte, fontes e referências

A xilogravura da **V2** foi gerada com a ferramenta nativa `image_gen`; prompt e procedência em `assets/art/README.md`. É uma interpretação ilustrada, sem alterar as fotografias. A **V1** usa Fraunces, Cormorant e DM Sans; a **V2** usa Rye, DM Sans e Georgia do sistema. Licenças das fontes distribuídas em `assets/fonts/`.

Referências visuais consultadas na sessão autenticada do Skillry: [Allegorical Engraving Cover](https://skillry.dev/skills/bs-allegorical-engraving-cover), [Collage Creative Portfolio](https://skillry.dev/skills/bs-collage-creative-portfolio) e [Cut-Paper Collective](https://skillry.dev/skills/bs-cutpaper-collective-site). Também foi consultado o [guia público do Impeccable](https://impeccable.style/slop/). São referências de direção de arte; nenhum pacote dessas referências foi instalado ou incorporado.

Fotografias e poemas conservam os créditos presentes nas obras. O acervo não foi relicenciado.
