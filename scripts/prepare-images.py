"""Prepare metadata-free WebP copies; original artwork and framing stay intact."""
from pathlib import Path
import json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "images"
OUTPUT = ROOT / "assets" / "photos"
OUTPUT.mkdir(parents=True, exist_ok=True)

ASSETS = [
    ("1.EU.decima.jpeg", "01-autorretrato", "Retrato ilustrado de um homem com boné de capitão e barba azul, acompanhado de versos."),
    ("2.EuSkate.jpeg", "02-skate", "Fotografia em preto e branco de uma pessoa andando de skate, acompanhada de versos."),
    ("3.DamaDAnoite.jpeg", "03-dama-da-noite", "Flores brancas abertas entre folhas verdes, com um poema na parte inferior."),
    ("4.Aline.jpeg", "04-aline", "Uma pessoa à beira-mar com tecido vermelho, refletida na areia molhada, acompanhada de versos."),
    ("5.Alegria.jpeg", "05-alegria", "Pessoa sorrindo com chapéu de palha, acompanhada de versos sobre o sorriso."),
    ("6.Janaina.jpeg", "06-janaina", "Barco azul e vermelho sobre a areia, sob céu azul, com um poema sobreposto."),
    ("7.Marcella.jpeg", "07-marcella", "Água da chuva caindo do telhado diante de um céu azul, acompanhada de versos."),
    ("8.Conjunção.jpeg", "08-conjuncao", "Lua e dois pontos luminosos no céu violeta acima das árvores, com um poema."),
    ("9.Niver.jpeg", "09-aniversario", "Chamas e brasas em um forno, acompanhadas de versos de aniversário."),
    ("10.AnoNovo.jpeg", "10-ano-novo", "Silhuetas ao redor de uma jangada na praia ao pôr do sol, refletidas na areia molhada, com versos de Ano-Novo."),
    ("11.DiaSanto.jpeg", "11-dia-santo", "Captura de tela de um pôr do sol atrás de telhados, acompanhada de um poema."),
    ("12..jpeg", "12-jangada", "Silhuetas empurrando uma jangada de vela escura na praia ao pôr do sol, acompanhadas de versos."),
    ("13.Amarelinho.jpeg", "13-amarelinho", "Painel de automóvel com velocímetro e relógio, acompanhado de versos."),
    ("14.Kite.jpg.jpeg", "14-kite", "Pessoas e equipamentos de kitesurf na praia sob um pôr do sol dourado, acompanhados de versos."),
    ("15.Cagada.jpeg", "15-cotidiano", "Vaso sanitário em exposição numa loja, acompanhado de um poema bem-humorado."),
    ("AreiaBranca.jpeg", "16-areia-branca", "Arco-íris sobre construções junto à praia, acompanhado de versos sobre Upanema."),
    ("WhatsApp Image 2026-10-16 at 10.26.11.jpeg", "17-perfeito-beach", "Placa em formato de prancha na areia, com árvores e mar ao fundo e um poema sobreposto."),
    ("Imagem do ChatGPT 21 de out. de 2026, 11_24_34.png", "macrame", "Imagem de referência de uma peça de macramê cru e azul com desenho semelhante a um QR code e franjas."),
]

manifest = []
for filename, slug, alt in ASSETS:
    source = SOURCE / filename
    with Image.open(source) as original:
        photo = ImageOps.exif_transpose(original).convert("RGB")
        original_size = photo.size
        thumbnail = photo.copy()
        max_thumbnail = 900 if slug == "macrame" else 1000
        thumbnail.thumbnail((max_thumbnail, max_thumbnail), Image.Resampling.LANCZOS)
        target = OUTPUT / f"{slug}.webp"
        thumbnail.save(target, "WEBP", quality=85, method=6)
        entry = {
            "source": f"images/{filename}",
            "src": f"assets/photos/{target.name}",
            "width": thumbnail.width,
            "height": thumbnail.height,
            "bytes": target.stat().st_size,
            "originalWidth": original_size[0],
            "originalHeight": original_size[1],
            "alt": alt,
        }
        # Full-size, metadata-free copies keep embedded poems readable in the viewer.
        if slug != "macrame":
            full = photo.copy()
            full.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
            full_target = OUTPUT / f"{slug}-full.webp"
            full.save(full_target, "WEBP", quality=90, method=6)
            entry.update(full=f"assets/photos/{full_target.name}", fullWidth=full.width, fullHeight=full.height, fullBytes=full_target.stat().st_size)
        manifest.append(entry)

(OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Prepared {len(manifest)} artwork thumbnails and 17 full-resolution reading copies.")
print(f"Output: {sum(path.stat().st_size for path in OUTPUT.glob('*.webp')):,} bytes")
