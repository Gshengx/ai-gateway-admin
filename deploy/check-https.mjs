import https from 'node:https'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

export function checkEndpoint(url, ca, expectedStatus, timeoutMs = 15000) {
  const target = new URL(url)
  if (target.protocol !== 'https:') throw new Error('HTTPS is required')
  return new Promise((resolve, reject) => {
    const request = https.get(target, { ca, rejectUnauthorized: true }, (response) => {
      response.resume()
      response.on('error', reject)
      response.on('end', () => {
        if (response.statusCode !== expectedStatus) {
          reject(
            new Error(
              `${target.pathname}: HTTP ${response.statusCode}, expected ${expectedStatus}`,
            ),
          )
          return
        }
        resolve(response.statusCode)
      })
    })
    const timeout = setTimeout(() => request.destroy(new Error('HTTPS check timed out')), timeoutMs)
    request.on('close', () => clearTimeout(timeout))
    request.on('error', reject)
  })
}

async function main() {
  const [origin, caPath] = process.argv.slice(2)
  if (!origin || !caPath)
    throw new Error('Usage: node check-https.mjs <https-origin> <root-ca-path>')
  const ca = fs.readFileSync(caPath)
  const root = await checkEndpoint(new URL('/', origin), ca, 200)
  const api = await checkEndpoint(new URL('/api/v1/api-keys', origin), ca, 401)
  process.stdout.write(
    `TLS certificate chain, validity and hostname verified; home ${root} / API ${api}\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`HTTPS check failed: ${error.message}\n`)
    process.exitCode = 1
  })
}
