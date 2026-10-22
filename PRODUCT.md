# Fotocordel

Exposição de fotopoesias com **V1 aprovada como única experiência apresentada ao público**. A V2 fica preservada e oculta da navegação.

## Propósito

Expor as 17 fotopoesias fornecidas, atribuídas a Marcello Tubarão, numa experiência de fotografia, leitura e som com identidade de cordel nordestino. A coleção reúne mar e horizonte, terra e cotidiano, afetos e encontros; não se limita a paisagens marítimas.

Um QR code numa peça física de macramê é a porta de entrada para o site, especialmente pelo celular. O site também apresenta o estudo visual do macramê e oferece QR funcional para download. O novo QR da V1 aponta ao domínio próprio; códigos antigos dependem da continuidade dos redirecionamentos após a migração.

## Versão aprovada e arquivo

| Versão | URL | Características |
| --- | --- | --- |
| V1 aprovada | `https://fotocordel.com.br/` (DNS/HTTPS em validação) | “Entre o sal e a palavra”; visual editorial do primeiro site, galeria original e som iniciado pelo visitante. |
| V1 em teste temporário | `https://fotocordel-preview.fotocordel-commerce.workers.dev/` | Publicado e Checkout simulado validado em 22/10/2026, sem depender do DNS definitivo. |
| V2 arquivada | Fontes em `v2/`, sem divulgação | Estudo de cordel com xilogravura; preservado e marcado `noindex, nofollow`. |

O pedido atual é mostrar **somente a V1**. O seletor de versões foi removido. A V2 não foi apagada, mas não deve receber divulgação, novos links de navegação ou novas compras. A URL direta ainda pode abrir; `noindex` não é autenticação. Seu QR fica como arquivo histórico. O QR atual apresenta a V1 aprovada no domínio próprio.

## Migração de domínio

Em 22/10/2026, o registro de **fotocordel.com.br** foi confirmado ativo e o usuário autorizou avançar. O `CNAME` do GitHub Pages está configurado e as entradas DNS foram salvas no Registro.br, aguardando publicação/propagação. A migração deve ser considerada concluída somente após verificar DNS, HTTPS, páginas públicas e retornos do Checkout no novo domínio.

Preparar a migração com HTTPS para a V1 aprovada e conferir os retornos de pagamento e as origens permitidas da API. Preservar os arquivos da V2 sem divulgá-los. Planejar a continuidade dos endereços antigos para manter funcionais os QR codes já distribuídos; a compra do domínio, sozinha, não muda seus destinos.

O preview público temporário apresenta a V1 como entrada e inclui os arquivos da V2 por URL direta para preservar os retornos de pedidos dessa edição. A lista permitida contém 64 arquivos; a V2 permanece sem divulgação na navegação, com `noindex` e sem novas compras pela interface. O preview foi publicado e validado em 22/10/2026 com compra completa no navegador em modo de teste: retorno à mesma origem, pedido confirmado como `paid`, webhook `checkout.session.completed` processado em D1 e download JPEG com SHA-256 igual ao original. O domínio canônico e o QR continuam sendo `https://fotocordel.com.br/`, com DNS ainda pendente. Os comandos de preparo e deploy do preview estão no [README](README.md#executar-e-publicar).

## O que existe

- Exposição de 17 obras e filtros temáticos em ambas; folhas grandes e visão geral na V2.
- Leitor com fotografia completa, transcrição, crédito, zoom e navegação.
- Som sintético com volume e opção de vento. Na V2, mar habilitado por padrão, sujeito à liberação de áudio do navegador, com silêncio persistente e controles flutuante e no leitor.
- Capa ilustrada de sertão e mar na V2, separada do acervo fotográfico original.
- Hospedagem estática em GitHub Pages, com preview temporário da V1 em Cloudflare Workers. O QR atual da V1 codifica `https://fotocordel.com.br/`; códigos antigos impressos devem ser testados após a migração.

## Limites e conteúdo

O site público continua como exposição estática. O frontend conecta à API hospedada exclusiva de sandbox, habilitada somente para compras simuladas; o fluxo completo do Checkout público foi validado no preview em 22/10/2026. Isso não habilita cobranças reais. O código de comércio está em `commerce/`: Stripe Checkout, pedidos em D1 e JPEGs de teste em Static Assets privados, acessíveis somente após autorização pelo Worker. Não foi provisionado bucket R2 para esse sandbox; R2 privado permanece previsto para produção. A hospedagem depende dos planos e cotas dos serviços, sem garantia de gratuidade absoluta.

A interface de compra aparece somente na V1, por R$ 9,99 com uso pessoal e comercial, e identifica claramente o modo de teste e o cartão fictício. A V1 tem recibo em `compra.html`; a V2, em `v2/compra.html`. Visual, logo e “Voltar ao varal” correspondem à edição do pedido. URLs antigas de retorno continuam compatíveis: a consulta autenticada do pedido identifica sua edição e encaminha ao recibo correto na mesma origem, preservando o acesso salvo no navegador.

Não há cadastro ou analytics. O acesso à compra usa um token da sessão do navegador, com validade de 30 dias no backend; fechar a aba ou apagar a sessão pode removê-lo antes. A recuperação automática por e-mail ainda não está implementada.

Os títulos de navegação são editoriais; imagens e assinaturas continuam sendo as obras originais. Transcrições devem ser conferidas com o autor. A imagem azul de macramê é um estudo visual, não prova de um QR tecido funcional. A peça física precisa ser produzida a partir da matriz correta e testada.

Novas obras e mudanças editoriais entram pelos arquivos do projeto. Os próximos refinamentos devem preservar a leitura dos versos, a integridade das fotografias e o acesso simples pelo QR.

Os 17 produtos Stripe existentes são de teste. Todos os itens do catálogo exigem revisão dos arquivos finais antes de habilitar produção; os JPEGs fornecidos não devem ser anunciados como masters de alta resolução exclusivos.
