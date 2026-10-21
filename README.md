# Fotocordel

Exposição estática de fotopoesias de Marcello Tubarão: mar, cotidiano, afetos e um encontro com o macramê.

Site: https://phellipe.github.io/fotocordel/

## Visualizar localmente

Execute `python -m http.server 4173 --bind 127.0.0.1` na pasta do projeto e abra http://127.0.0.1:4173/.

Não há instalação, build, backend, serviços pagos, cookies ou dependências externas durante a visita. HTML, CSS, JavaScript, fontes, imagens e QR são servidos pelo próprio site. GitHub Pages publica a raiz da branch `main`; `.nojekyll` dispensa o Jekyll.

## Conteúdo

- `gallery-data.js`: obras, títulos editoriais, descrições acessíveis e transcrições dos versos. Os títulos de navegação não substituem o título/assinatura na imagem.
- `assets/photos/`: miniaturas e imagens completas em WebP. Os enquadramentos e textos das obras foram preservados.
- `images/`: originais locais, ignorados pelo Git e não publicados.
- `sound.js`: paisagens sintéticas de ondas e vento, feitas com Web Audio. Só iniciam por ação do visitante, com volume ajustável; pausam quando a aba deixa de estar visível. Não são gravações dos locais fotografados.
- `assets/qr/`: QR funcional em PNG (impressão) e SVG (vetorial), apontando para a URL pública do projeto.
- `assets/photos/macrame.webp`: estudo visual fornecido do projeto em macramê. O desenho da trama não é um QR funcional verificado. Para produzir uma peça escaneável, use o código funcional como matriz, mantendo os módulos e a margem branca, e teste o objeto físico antes de reproduzi-lo.

## Atualizar as fotografias

Instale Pillow (`python -m pip install Pillow`) e execute `python scripts/prepare-images.py` para reproduzir os derivados a partir dos originais. Atualize `gallery-data.js` quando alterar o acervo. As versões completas são abertas somente quando o visitante seleciona a obra. Transcrições devem ser revisadas junto com o autor.

O QR pode ser recriado com `python -m pip install qrcode Pillow` e `python scripts/create-qr.py`. Se mudar o endereço público, atualize também os metadados em `index.html`.

## Publicar alterações

Depois de revisar as mudanças, faça commit e push para `main`. O GitHub Pages publica automaticamente.

## Direção de arte

Azul do fio de macramê, papel cru, acento de barro; composição editorial, fotografias sem recorte e um varal na abertura. Referências consultadas: [Skillry — Cobalt Serif](https://skillry.dev/skills/bs-cobalt-serif-freelancer-site), [Impeccable](https://impeccable.style/slop/) e [Refero — Intercom](https://styles.refero.design/style/12255b63-e506-4bc1-a4cd-d05487de32f3). Sem templates pagos, instalação de skills externas ou acesso à conta Skillry.

Fotografias e poemas mantêm os créditos presentes nas obras. O acervo não foi relicenciado. Fontes Fraunces, Cormorant Garamond e DM Sans: SIL Open Font License; licenças em `assets/fonts/`.
