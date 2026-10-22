# Fotocordel

Exposição estática de 17 fotopoesias de Marcello Tubarão. **A V1 foi aprovada e é a única versão apresentada ao público.**

| Versão | Endereço | Direção |
| --- | --- | --- |
| V1 — aprovada | [Domínio próprio](https://fotocordel.com.br/) | “Entre o sal e a palavra”: composição editorial, azul, papel claro e fotografia pendurada no varal. |
| V1 — teste temporário | [Preview público](https://fotocordel-preview.fotocordel-commerce.workers.dev/) | Mesma V1 aprovada; publicado e compra simulada validada em 22/10/2026. |
| V2 — arquivada | Fontes preservadas em `v2/` | Estudo de folheto com xilogravura, oculto da navegação e marcado `noindex, nofollow`. |

[Repositório](https://github.com/phellipe/fotocordel). A V1 mantém a base visual e o comportamento da versão original (`0f21bf7`). A V2 não foi apagada e sua URL direta ainda pode abrir; ocultação e `noindex` não são controle de acesso. Não divulgar a versão arquivada nem seu QR.

**Domínio próprio:** `fotocordel.com.br` está registrado e configurado no `CNAME` do GitHub Pages. As entradas DNS foram salvas no Registro.br e aguardam publicação/propagação; DNS e HTTPS ainda precisam ser validados antes de considerar a migração pronta. Metadados e novo QR da V1 apontam a esse endereço. O preview temporário permite testar a V1 enquanto isso; o Checkout iniciado nele deve retornar ao próprio preview para conservar o acesso à compra na sessão do navegador.

## Executar e publicar

Na pasta do projeto, execute `python scripts/serve-preview.py` e abra [a prévia local aprovada](http://127.0.0.1:4173/). A V2 permanece acessível por URL direta em `/v2/`, sem divulgação na navegação, para preservar a consulta de pedidos dessa edição.

As galerias não exigem instalação, build ou backend para visualização. HTML, CSS, JavaScript, fontes, imagens e QR são locais. A compra opcional usa o serviço separado descrito abaixo. O GitHub Pages publica a raiz de `main` após commit e push; `.nojekyll` dispensa o Jekyll. O redirecionamento do antigo endereço `https://phellipe.github.io/fotocordel/` deve ser conferido após a propagação do novo domínio, inclusive para QR codes já distribuídos.

Para preparar e publicar o preview estático no Cloudflare Workers, execute na raiz, com as dependências de `commerce/` instaladas e autenticação Cloudflare disponível:

```sh
npm ci --prefix commerce
node scripts/prepare-public-preview.mjs
node commerce/node_modules/wrangler/bin/wrangler.js deploy --dry-run --config commerce/wrangler.preview.jsonc
node commerce/node_modules/wrangler/bin/wrangler.js deploy --config commerce/wrangler.preview.jsonc
```

O preparo copia uma lista de 64 arquivos públicos permitidos para `.commerce-local/preview`, ignorada pelo Git. A V1 é a entrada apresentada ao público; os arquivos da V2 também estão disponíveis por URL direta para manter os retornos de pedidos, sem links de navegação, com `noindex` e sem novas compras pela interface dessa edição. JPEGs originais, credenciais e backend ficam fora dessa lista. Execute o preparo novamente após mudanças no site. A configuração `commerce/wrangler.preview.jsonc` publica somente esses arquivos no Worker `fotocordel-preview`; a API de compras é publicada separadamente. O domínio canônico e o QR continuam apontando para `https://fotocordel.com.br/`.

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
| `compra.html`, `v2/compra.html` | Recibos próprios da V1 e da V2, com visual, marca e retorno ao varal da respectiva edição. |
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

A V1 tem um módulo de compra por **R$ 9,99**, com uso pessoal e comercial. A V2 arquivada não apresenta novas compras. Os recibos ficam em `compra.html` para a V1 e `v2/compra.html` para a V2, cada um com seu visual, logo e “Voltar ao varal” da respectiva edição. Retornos antigos à página da raiz continuam compatíveis: após autenticar a consulta do pedido com o token do comprador, a página encaminha para o recibo da edição registrada, mantendo a origem do site.

O backend em `commerce/` usa Stripe Checkout, Cloudflare Workers e D1; não exige VPS. O sandbox publicado entrega os JPEGs de teste por Static Assets privados, atrás da autorização do Worker; não foi provisionado nem é necessário ativar um bucket R2 para esse ensaio. O caminho previsto para produção usa R2 privado.

`shop-config.js` está configurado com `enabled: true` para a API exclusiva de sandbox `https://fotocordel-commerce-test.fotocordel-commerce.workers.dev`, habilitada somente para compras simuladas. O preview foi publicado e validado em 22/10/2026: compra concluída no navegador em modo de teste, retorno à mesma origem, pedido `paid`, webhook `checkout.session.completed` processado em D1 e download JPEG com SHA-256 igual ao original. A interface identifica o teste e informa o cartão fictício; não há cobrança real pela Stripe nesse modo. Isso não é promessa de hospedagem gratuita: os serviços Cloudflare têm planos e cotas, conforme [a documentação de comércio](commerce/README.md).

Os 17 produtos e preços foram criados na área de teste da Stripe. Isso não ativa vendas reais. A conta consultada ainda exige ativação para pagamentos de produção; os arquivos atuais não constituem um acervo separado em alta resolução. Nenhum segredo ou original pago deve ser publicado no GitHub Pages.

Consulte [a documentação de comércio](commerce/README.md) para executar, validar e publicar o serviço. Para prévias locais, use `scripts/serve-preview.py`, que bloqueia acesso aos originais, credenciais e arquivos do backend.
