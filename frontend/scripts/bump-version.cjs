const fs = require('fs')
const path = require('path')

const now = new Date()
const pad = n => String(n).padStart(2, '0')
const v = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`

const data = { v, ts: now.getTime() }
fs.writeFileSync(
  path.join(__dirname, '../public/version.json'),
  JSON.stringify(data) + '\n'
)
console.log(`Version: ${v}`)
