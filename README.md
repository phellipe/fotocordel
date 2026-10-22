# Fotocordel

Exposição estática de 17 fotopoesias de Marcello Tubarão. **A V1 foi aprovada e é a única versão apresentada ao público.**

| Versão | Endereço | Direção |
| --- | --- | --- |
| V1 — aprovada | [Domínio próprio](https://fotocordel.com.br/) | “Entre o sal e a palavra”: composição editorial, azul, papel claro e fotografia pendurada no varal. |
| V2 — arquivada | Fontes preservadas em `v2/` | Estudo de folheto com xilogravura, oculto da navegação e marcado `noindex, nofollow`. |

[Repositório](https://github.com/phellipe/fotocordel). A V1 mantém a base visual e o comportamento da versão original (`0f21bf7`). A V2 não foi apagada e sua URL direta ainda pode abrir; ocultação e `noindex` não são controle de acesso. Não divulgar a versão arquivada nem seu QR.

**Domínio próprio:** `fotocordel.com.br` está registrado e configurado no `CNAME` do GitHub Pages. Metadados e novo QR da V1 apontam a esse endereço. A transição de DNS e a validação de HTTPS ainda precisam ser concluídas antes de considerar a migração pronta. Somente a V1 aprovada será apresentada; os retornos do pagamento e as origens da API devem acompanhar o domínio.

## Executar e publicar

Na pasta do projeto, execute `python scripts/serve-preview.py` e abra [a prévia local aprovada](http://127.0.0.1:4173/). A pasta `v2/` permanece disponível apenas como referência de manutenção.

As galerias não exigem instalação, build ou backend para visualização. HTML, CSS, JavaScript, fontes, imagens e QR são locais. A compra opcional usa o serviço separado descrito abaixo. O GitHub Pages publica a raiz de `main` após commit e push; `.nojekyll` dispensa o Jekyll. O redirecionamento do antigo endereço `https://phellipe.github.io/fotocordel/` deve ser conferido após a propagação do novo domínio, inclusive para QR codes já distribuídos.

## Experiência aprovada e estudo preservado

- Ambas preservam fotografias e versos completos, filtros por mar, terra e afetos e leitor com transcrição, créditos, zoom e navegação anterior/próxima. As setas navegam; Escape fecha.
- **V1:** galeria original; som desligado inicialmente, ativado pelo visitante na seção sonora.
- **V2 arquivada:** “Folhas grandes” e “Visão geral”; mar habilitado por padrão, com tentativa de autoplay e liberação na primeira interação válida quando o navegador bloquear. Há controle flutuante e controle dentro do leitor.
- Na V2, a escolha de silenciar é salva em `localStorage` (`fotocordel.sound.muted`). Paisagem e volume reiniciam em mar e 22%. As duas versões oferecem volume, vento e pausa em segundo plano. São ambientes sintetizados com Web Audio, não gravações dos locais.

## Arquivos e manutenção

| Arquivo | Função |
| --- | --- |
| `gallery-data.js` | Obras, títulos de navegação, descrições, transcrições e créditos. Os títulos editoriais não substituem os das imagens. |
| `index.html`, `styles.css`, `app.js`, `sound.js` | Página e comportamento da V1 original. |
| `v2/` | Estudo de cordel preservado, oculto da navegação, com compras desabilitadas nessa edição. |
| `assets/photos/` | Miniaturas e versões completas em WebP; originais locais em `images/`, ignorados pelo Git. |
| `assets/art/` | Arte de abertura, original PNG e documentação de geração. |
| `assets/qr/` | `fotocordel-qr.png/.svg` abre a V1 aprovada; o QR da V2 é arquivo histórico, sem divulgação. |
| `DESIGN.md` / `PRODUCT.md` | Sistema visual atual / escopo e conteúdo do produto. |

Para atualizar as imagens: instale Pillow (`python -m pip install Pillow`), execute `python scripts/prepare-images.py` e ajuste `gallery-data.js`. A galeria carrega miniaturas; o leitor busca a versão completa, e a obra em destaque já usa a versão completa. Revise transcrições com o autor.

Para recriar os QRs: `python -m pip install qrcode Pillow` e `python scripts/create-qr.py`. O padrão gera ambos; `--version v1`, `--version v2` ou `--version both` seleciona a saída.

- **QR atual da V1:** `fotocordel-qr.png/.svg` codifica `https://fotocordel.com.br/`. A troca deliberada do endereço usa `python scripts/create-qr.py --version v1 --replace-v1`; reproduções seguintes dispensam a opção de substituição.
- **QR histórico da V2:** `fotocordel-v2-qr.png/.svg` conserva o destino antigo em `/v2/`; não distribuir.

A referência azul de macramê é um estudo visual, não um código escaneável verificado; para a peça física, preserve módulos e margem da matriz funcional e teste a leitura.

## Arte, fontes e referências

A xilogravura da **V2** foi gerada com a ferramenta nativa `image_gen`; prompt e procedência em `assets/art/README.md`. É uma interpretação ilustrada, sem alterar as fotografias. A **V1** usa Fraunces, Cormorant e DM Sans; a **V2** usa Rye, DM Sans e Georgia do sistema. Licenças das fontes distribuídas em `assets/fonts/`.

Referências visuais consultadas na sessão autenticada do Skillry: [Allegorical Engraving Cover](https://skillry.dev/skills/bs-allegorical-engraving-cover), [Collage Creative Portfolio](https://skillry.dev/skills/bs-collage-creative-portfolio) e [Cut-Paper Collective](https://skillry.dev/skills/bs-cutpaper-collective-site). Também foi consultado o [guia público do Impeccable](https://impeccable.style/slop/). São referências de direção de arte; nenhum pacote dessas referências foi instalado ou incorporado.

Fotografias e poemas conservam os créditos presentes nas obras. O acervo não foi relicenciado.

## Compra de arquivos digitais (integração preparada)

A V1 tem um módulo de compra por **R$ 9,99**, com uso pessoal e comercial. A V2 arquivada não apresenta novas compras; recibos de pedidos antigos dessa edição continuam consultáveis, sempre com retorno ao varal da V1. O backend em `commerce/` usa Stripe Checkout, Cloudflare Workers, D1 e R2 privado; não exige VPS. `shop-config.js` está preparado com `enabled: true` para a API exclusiva de sandbox `https://fotocordel-commerce-test.fotocordel-commerce.workers.dev`. O checkout público depende também da liberação de vendas no backend; essa preparação não ativa pagamentos reais.

Os 17 produtos e preços foram criados na área de teste da Stripe. Isso não ativa vendas reais. A conta consultada ainda exige ativação para pagamentos de produção; os arquivos atuais não constituem um acervo separado em alta resolução. Nenhum segredo ou original pago deve ser publicado no GitHub Pages.

Consulte [a documentação de comércio](commerce/README.md) para executar, validar e publicar o serviço. Para prévias locais, use `scripts/serve-preview.py`, que bloqueia acesso aos originais, credenciais e arquivos do backend.
