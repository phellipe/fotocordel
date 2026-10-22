# Loja Fotocordel

Backend de venda e entrega de arquivos digitais por Stripe Checkout, Cloudflare Workers, D1 e R2 privado. As duas galerias continuam estáticas no GitHub Pages; não é necessária uma VPS.

## Estado da entrega

- Preço definido: **R$ 9,99 por obra**, pagamento único, licença de uso pessoal e comercial.
- O catálogo contém 17 produtos/preços **de teste** já criados na Stripe. Os IDs de preço não são segredos.
- `catalog.json` mantém `livePriceId: null` e `readyForLive: false` em todas as obras. O cadastro Stripe consultado ainda não estava habilitado para cobranças reais (`charges_enabled: false`).
- Nenhum Worker, banco D1 ou bucket R2 remoto foi provisionado nesta entrega. Os IDs de banco em `wrangler.jsonc` são placeholders.
- A configuração pública da loja começa desabilitada e sem endereço de API. O código preparado não significa que a loja esteja recebendo pagamentos.

Os JPEGs fornecidos são composições com versos. Em 16 das 17 obras, o WebP já publicado tem a mesma resolução em pixels do JPEG disponível. Apenas Kite possui um original local maior. Esses arquivos servem para ensaiar a entrega, mas **não devem ser anunciados como novos masters exclusivos de alta resolução**. Miniaturas, imagens de leitura e QR codes já publicados continuam públicos; criar armazenamento privado não desfaz essa publicação anterior.

## Hospedagem e limites

É preciso ter uma conta Cloudflare e habilitar os serviços utilizados. Workers e D1 possuem planos gratuitos sujeitos a cotas; o funcionamento gratuito depende do consumo. No Workers Free, o limite documentado é 100 mil requisições/dia e 10 ms de CPU por invocação. No D1 Free, são 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 5 GB totais. Ao atingir cotas do plano gratuito, operações podem falhar. Confira [Workers](https://developers.cloudflare.com/workers/platform/pricing/) e [D1](https://developers.cloudflare.com/d1/platform/pricing/) antes da publicação.

O R2 Standard inclui **10 GB-mês**, 1 milhão de operações Classe A e 10 milhões Classe B por mês. Há cobrança por armazenamento e operações excedentes; a franquia não é armazenamento ilimitado. A transferência de saída não tem cobrança de egress pelo R2. Verifique a ativação, os requisitos de faturamento e os [preços vigentes do R2](https://developers.cloudflare.com/r2/pricing/). Condições consultadas em 22/10/2026.

## Executar localmente

Pré-requisitos: Node.js **22.16 ou superior**, npm, Python 3 e Pillow. Os comandos abaixo usam PowerShell. Comece na raiz do repositório e entre em `commerce`:

```powershell
Set-Location commerce
npm ci
python -m pip install Pillow
```

Configure uma credencial **de teste** a partir de um arquivo privado fora do repositório. Substitua o caminho ilustrativo abaixo pelo seu arquivo; nunca cole seu conteúdo no código ou no GitHub.

```powershell
node scripts/configure-local.mjs --secrets-file "C:/CAMINHO-PRIVADO/stripe-test.txt" --enable-checkout
python scripts/prepare-private-files.py --test
npm run migrate:local
```

`configure-local.mjs` grava `.dev.vars`, ignorado pelo Git. Aceita somente chave `rk_test_` ou `sk_test_`; prefira uma chave restrita. Sem `--enable-checkout`, mantém novas compras bloqueadas. O segredo `whsec_` gerado é sintético: permite testes locais assinados, mas não valida eventos enviados pela Stripe. Para testes reais de webhook, substitua-o pelo segredo do listener ou do endpoint correspondente.

`prepare-private-files.py --test` copia os JPEGs existentes para `../.commerce-local/files/originals/` e escreve `../.commerce-local/files-report.json`. Não envia arquivos à nuvem nem libera vendas reais. Importe essas cópias no R2 local:

```powershell
node scripts/seed-local.mjs
npm run dev
```

`seed-local.mjs` carrega os arquivos preparados somente no R2 local, sem upload remoto. O Worker local atende em `http://127.0.0.1:8787`. Em outro terminal, na **raiz do repositório**, inicie a prévia da galeria:

```powershell
python scripts/serve-preview.py --shop-api http://127.0.0.1:8787
```

Abra `http://127.0.0.1:4173/` ou `http://127.0.0.1:4173/v2/`. Esse servidor usa uma lista de arquivos públicos permitidos e bloqueia `commerce/`, originais, arquivos ocultos e listagens de diretório. O parâmetro `--shop-api` habilita a loja **apenas na resposta em memória** de `shop-config.js`: o arquivo público permanece desabilitado, sem edições para reverter. Não substitua esse servidor por um servidor genérico da raiz, que poderia disponibilizar `.dev.vars` e os arquivos privados.

`SITE_URL` local deve ser `http://127.0.0.1:4173/`; as origens permitidas já estão no arquivo gerado. As origens são protocolo, domínio e porta, sem `/fotocordel/` ou `/v2/`.

Com a Stripe CLI autenticada na mesma conta/ambiente do catálogo, encaminhe os eventos ao Worker local:

```powershell
stripe listen --forward-to http://127.0.0.1:8787/stripe/webhook
```

Substitua `STRIPE_WEBHOOK_SECRET` em `.dev.vars` pelo segredo exibido pelo listener. Reinicie o Worker após alterar o arquivo. Um segredo do Dashboard e um segredo de `stripe listen` não são intercambiáveis. Use apenas dados de pagamento de teste nesse ambiente.

## Catálogo Stripe e credenciais

Os preços de teste existentes estão em `catalog.json`. Só é necessário executar a preparação novamente ao configurar outro ambiente ou quando faltar algum produto/preço:

```powershell
node scripts/setup-stripe.mjs --secrets-file "C:/CAMINHO-PRIVADO/stripe-test.txt"
```

O modo padrão é `test`. O script reutiliza os IDs/lookup keys do projeto, valida moeda e valor e grava os `testPriceId` encontrados. Ele cria produtos/preços; não cobra clientes. A credencial de preparação precisa ler/criar Products e Prices. Use credencial restrita separada para o Worker, com leitura/criação de Checkout Sessions e leitura de Prices, PaymentIntents, Charges e Refunds exigidas pelo backend; ele não precisa criar produtos nem emitir reembolsos. Chaves e segredos devem ficar no `.dev.vars` local ou em Workers Secrets, nunca em `shop-config.js`, `catalog.json` ou `wrangler.jsonc`.

## Webhook e entrega ao comprador

No Dashboard Stripe, cadastre um destino de eventos para `https://SEU-WORKER.workers.dev/stripe/webhook`, no mesmo modo da chave e dos preços. Configure estes eventos atendidos pelo backend:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
refund.created
refund.updated
refund.failed
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
```

O endpoint verifica a assinatura e o modo do evento. Eventos repetidos são reconhecidos; falhas de processamento podem ser tentadas novamente. A aplicação consulta o estado Stripe e confere o pedido, o preço e o pagamento antes de liberar o download. A página de retorno sozinha não comprova o pagamento. Mantenha o webhook configurado também para pagamentos assíncronos, reembolsos e contestações.

Os estados retornados para o pedido são:

| Estado | Efeito |
| --- | --- |
| `pending` | Pagamento ainda não confirmado; download bloqueado. |
| `paid` | Pagamento validado; download disponível quando o arquivo existe. |
| `refund_pending` | Reembolso pendente ou que exige ação; download suspenso. Se o reembolso falhar ou for cancelado, uma nova verificação pode retornar a `paid`. |
| `refunded` | Reembolso efetivado, inclusive parcial; acesso revogado. |
| `disputed` | Contestação registrada; acesso revogado nesta implementação. |
| `review` | Divergência na validação; exige revisão do responsável. |
| `expired` / `failed` | Checkout expirado ou pagamento sem sucesso; download bloqueado. |

Estados revogados (`refunded`, `disputed`, `review`) não são reabertos automaticamente por um evento de pagamento atrasado. Já `refund_pending` é uma suspensão reversível. O download consulta novamente o pagamento e verifica o estado salvo antes de iniciar a entrega.

Ao reutilizar um Checkout já registrado, o backend consulta a Stripe: se a sessão estiver expirada, responde `CHECKOUT_EXPIRED`, em vez de devolver um link vencido. Uma sessão existente não é descartada apenas por sua idade, preservando também o pedido já pago. Há um limite de 23 horas apenas para retomar tentativas que ainda não têm URL de Checkout registrada, antes de tentar criar uma sessão com a mesma chave de idempotência. Esses limites são diferentes do prazo de acesso de 30 dias do comprador. Consulte o pedido existente antes de iniciar outro se houver dúvida sobre uma cobrança. Novas tentativas têm limite de 10 por minuto por IP; repetir uma tentativa já registrada não consome essa cota. O identificador de IP é armazenado como HMAC, não em texto puro.

| Rota do Worker | Finalidade |
| --- | --- |
| `GET /health` | Estado básico e modo; não comprova conectividade completa com Stripe/D1/R2. |
| `GET /catalog` | Catálogo público, dimensões e disponibilidade para compra. |
| `POST /checkout` | Cria ou reutiliza o pedido e inicia o Checkout hospedado. |
| `POST /stripe/webhook` | Recebe eventos assinados da Stripe. |
| `GET /orders/<id>` | Consulta protegida do estado do pedido. |
| `POST /orders/<id>/download` | Entrega o JPEG privado de um pedido pago e autorizado. |

O retorno do Checkout abre `compra.html?pedido=<id>`, na raiz da galeria configurada em `SITE_URL`. Ao cancelar, acrescenta `cancelado=1`. A V2 usa a mesma página de compra da raiz.

O navegador guarda o token do comprador em **sessionStorage**, antes de abrir o Checkout. Consulta e download exigem esse token no cabeçalho `Authorization: Bearer …`; o número do pedido e o endereço de retorno sozinhos não dão acesso ao arquivo. O token não vai na URL. Sua validade no backend é de 30 dias, mas fechar a aba ou apagar os dados da sessão pode removê-lo antes. Mantenha a aba original até baixar o arquivo.

Esta versão não tem conta de comprador, recuperação automática por e-mail ou comprovante exportável que restaure o token. O recibo de pagamento da Stripe não funciona como chave de download. Se o token for perdido, o responsável precisa verificar a compra e atender a entrega manualmente; não há endpoint administrativo de reemissão nesta implementação. Defina um canal de atendimento antes de ativar vendas reais.

## Publicar um ambiente de teste, quando desejado

Esta sequência cria recursos remotos; não é necessária para os testes locais. Execute dentro de `commerce`, com sua própria conta Cloudflare:

```powershell
npx wrangler login
npx wrangler d1 create fotocordel-commerce-test
npx wrangler r2 bucket create fotocordel-originals-test
```

Copie o `database_id` retornado para o binding `DB` do ambiente padrão em `wrangler.jsonc`. O binding do bucket é `ORIGINALS`. Mantenha o bucket privado: não habilite endereço público `r2.dev` nem domínio público para seus arquivos de entrega.

Configure `SITE_URL` como `https://phellipe.eti.br/fotocordel/` e `ALLOWED_ORIGINS` como `https://phellipe.eti.br`. Mantenha `STRIPE_MODE: "test"` e `SALES_ENABLED: "false"` na primeira publicação.

```powershell
npx wrangler d1 migrations apply fotocordel-commerce-test --remote
npm run deploy
npx wrangler secret put STRIPE_SECRET_KEY
```

Insira a chave de teste no prompt de secrets. O `secret put` publica uma nova versão do Worker; a loja continua bloqueada por `SALES_ENABLED`. Anote o endereço HTTPS retornado pelo deploy e configure o webhook Stripe descrito abaixo. Depois salve seu segredo:

```powershell
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Para carregar os arquivos de teste no bucket remoto, execute dentro de `commerce`:

```powershell
$catalogue = Get-Content catalog.json -Raw | ConvertFrom-Json
foreach ($photo in $catalogue) {
  npx wrangler r2 object put "fotocordel-originals-test/$($photo.fileKey)" --file "../.commerce-local/files/$($photo.fileKey)" --content-type image/jpeg --remote
  if ($LASTEXITCODE -ne 0) { throw "Falha ao importar $($photo.id)" }
}
```

Confirme que permanece no bucket `fotocordel-originals-test`. Por fim, habilite `SALES_ENABLED` no ambiente de teste e publique novamente. Para ensaiar pelo computador sem alterar o site publicado, use `serve-preview.py --shop-api` com a URL HTTPS do Worker e configure esse Worker de teste com `SITE_URL: "http://127.0.0.1:4173/"` e essa mesma origem em `ALLOWED_ORIGINS`. O Checkout precisa voltar à origem onde o token foi salvo. Caso publique a loja de teste, restaure as URLs públicas do backend e configure `window.FOTOCORDEL_SHOP_CONFIG` em `shop-config.js` com `enabled: true` e `apiBase` igual à URL HTTPS do Worker, sem barra final. Isso ainda usa pagamentos simulados.

Os comandos seguem as referências oficiais de [D1](https://developers.cloudflare.com/d1/wrangler-commands/), [R2](https://developers.cloudflare.com/r2/reference/wrangler-commands/) e [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Preparar os arquivos vendidos

Guarde os masters reais fora do repositório. Cada JPEG deve usar exatamente o `filename` do catálogo, por exemplo `12-jangada.jpg`. Informe um caminho absoluto:

```powershell
python scripts/prepare-private-files.py --masters "C:/CAMINHO-PRIVADO/masters"
```

O script verifica que o formato interno é JPEG, copia os arquivos sem alterar seu conteúdo e relata dimensões, ausências e divergências em `.commerce-local/files-report.json`. Ele não atualiza o catálogo nem `readyForLive`. Revise cada arquivo, a composição, a resolução e a licença; atualize `width`/`height` em `catalog.json` para os pixels efetivamente entregues. Só então marque as obras revisadas como `readyForLive: true`.

O preparador não apaga cópias de ensaios anteriores. Se um master estiver ausente, não faça upload de uma cópia antiga por engano: confira o relatório e a origem de cada arquivo. O script de catálogo live exige **todas** as obras nele presentes prontas.

## Ativar produção posteriormente

Antes de habilitar cobranças, conclua a ativação da conta Stripe, disponibilize os masters revisados e ensaie compra, confirmação, download e falhas no ambiente de teste. Não basta mudar `STRIPE_MODE`.

Crie recursos separados para produção:

```powershell
npx wrangler d1 create fotocordel-commerce-live
npx wrangler r2 bucket create fotocordel-originals-live
```

Preencha o `database_id` em `env.live.d1_databases` e confira as URLs/origens de `env.live.vars`. Envie os masters aprovados ao bucket privado `fotocordel-originals-live`, com as chaves `originals/<id>.jpg`; no laço de importação, use esse nome de bucket, `--remote` e `--env live`.

Crie o catálogo de produção somente após a revisão:

```powershell
node scripts/setup-stripe.mjs --mode live --allow-live --secrets-file "C:/CAMINHO-PRIVADO/stripe-live.txt"
npx wrangler d1 migrations apply fotocordel-commerce-live --remote --env live
npx wrangler deploy --env live
npx wrangler secret put STRIPE_SECRET_KEY --env live
```

Mantenha `SALES_ENABLED: "false"` enquanto configura o webhook **live** e seu segredo separado:

```powershell
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env live
```

Depois de conferir o ambiente, altere `env.live.vars.SALES_ENABLED` para `"true"`, publique com `npx wrangler deploy --env live` e aponte o frontend para esse Worker. O Worker padrão e o Worker `--env live` possuem bancos, buckets, chaves e webhooks diferentes. O frontend usa apenas a URL pública da API e não recebe uma chave Stripe secreta.

## Verificação

Dentro de `commerce`:

```powershell
npm test
npm run check
```

`npm run check` faz verificações sintáticas e um `wrangler deploy --dry-run`; não provisiona hospedagem. Testes automatizados e dry run não substituem um Checkout completo com webhook no ambiente escolhido. Este guia não declara pagamentos live nem recursos Cloudflare já disponíveis.

Validação em 22/10/2026: 17 testes do backend passaram. Uma compra com cartão fictício foi concluída no Checkout hospedado da Stripe, em sandbox, por R$ 9,99. O retorno local confirmou o pagamento consultando a API Stripe e liberou o JPEG privado; o SHA-256 do arquivo baixado coincide com o original de teste. A interface foi conferida nas duas galerias e em viewport móvel de 390 × 844. O transporte externo de webhooks ainda precisa ser ensaiado no ambiente publicado; a assinatura e o processamento foram verificados nos testes automatizados.
