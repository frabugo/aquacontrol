const sharp = require('sharp')
const path  = require('path')
const fs    = require('fs')

const origen  = path.join(__dirname, '../public/icons/central.png')
const destino = path.join(__dirname, '../public/icons')

const tamaños = [72, 96, 128, 144, 152, 192, 384, 512]

async function generar() {
  // Si no existe central.png, crear un ícono placeholder con SVG
  if (!fs.existsSync(origen)) {
    console.log('No existe central.png, generando ícono placeholder...')
    const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="80" fill="#2563EB"/>
      <text x="256" y="200" text-anchor="middle" font-family="Arial,sans-serif" font-size="180" font-weight="900" fill="white">A</text>
      <text x="256" y="380" text-anchor="middle" font-family="Arial,sans-serif" font-size="80" font-weight="700" fill="rgba(255,255,255,0.8)">AQUA</text>
    </svg>`
    await sharp(Buffer.from(svg)).png().toFile(origen)
    console.log('✅ central.png generado (placeholder)')
  }

  for (const size of tamaños) {
    await sharp(origen)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 37, g: 99, b: 235, alpha: 1 }
      })
      .png()
      .toFile(path.join(destino, `icon-${size}.png`))
    console.log(`✅ icon-${size}.png`)
  }
  console.log('Íconos generados')
}

generar().catch(console.error)
