#!/usr/bin/env node
// Generate RSA key pairs for MATERIALS_LOADER_SVC and MATERIALS_APP_SVC, then
// fill snowflake/account_setup.template.sql → snowflake/account_setup.sql.
// Private keys stay in keys/ (gitignored). This script never prints a private key.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const KEYS = path.join(ROOT, 'keys')
const TEMPLATE = path.join(ROOT, 'snowflake/account_setup.template.sql')
const OUT = path.join(ROOT, 'snowflake/account_setup.sql')

function body(pem) {
  return pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '')
}

function pair(name) {
  const privPath = path.join(KEYS, `${name}_private.pem`)
  const pubPath = path.join(KEYS, `${name}_public.pem`)
  if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    return { publicPem: fs.readFileSync(pubPath, 'utf8'), reused: true }
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  fs.writeFileSync(privPath, privateKey, { mode: 0o600 })
  fs.writeFileSync(pubPath, publicKey, { mode: 0o644 })
  return { publicPem: publicKey, reused: false }
}

fs.mkdirSync(KEYS, { recursive: true })
const loader = pair('loader')
const app = pair('app')
const template = fs.readFileSync(TEMPLATE, 'utf8')
const sql = template
  .replaceAll('{{LOADER_PUBLIC_KEY}}', body(loader.publicPem))
  .replaceAll('{{APP_PUBLIC_KEY}}', body(app.publicPem))
fs.writeFileSync(OUT, sql)

console.log(`Wrote ${path.relative(ROOT, OUT)}`)
console.log(`Loader public key ${loader.reused ? 'reused' : 'generated'} (${body(loader.publicPem).slice(0, 24)}… ${body(loader.publicPem).length} chars)`)
console.log(`App public key ${app.reused ? 'reused' : 'generated'} (${body(app.publicPem).slice(0, 24)}… ${body(app.publicPem).length} chars)`)
console.log('Private keys are in keys/ and are gitignored. Never commit or paste them.')
console.log('Paste snowflake/account_setup.sql into a Snowsight worksheet as ACCOUNTADMIN.')
