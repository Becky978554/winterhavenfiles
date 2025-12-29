#!/usr/bin/env node
'use strict'

// Fetch aggregated sheep dataset from a hosted Pages site and write to local repo
// Usage: node tools/fetch_sheep_from_site.js [baseUrl]
// Example: node tools/fetch_sheep_from_site.js https://becky978554.github.io/winterhavenfiles

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    lib.get(url, (res) => {
      const { statusCode } = res
      if (statusCode !== 200) return reject(new Error('HTTP ' + statusCode + ' for ' + url))
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ url, body: data, headers: res.headers }))
    }).on('error', reject)
  })
}

function extractArrayFromBundle(body) {
  // Try to find window.__initialSheepData = [ ... ];
  const m = body.match(/window\.__initialSheepData\s*=\s*(\[[\s\S]*?\])\s*;/m)
  if (m && m[1]) return JSON.parse(m[1])
  // fallback: first top-level array in the file
  const m2 = body.match(/(\[[\s\S]*\])/m)
  if (m2 && m2[1]) return JSON.parse(m2[1])
  throw new Error('No JSON array found in bundle')
}

async function run() {
  const base = process.argv[2] || 'https://becky978554.github.io/winterhavenfiles'
  const candidates = [
    base.replace(/\/$/, '') + '/data/sheep.json',
    base.replace(/\/$/, '') + '/data_sheep_bundle.js',
    base.replace(/\/$/, '') + '/public/data_sheep_bundle.js',
    base.replace(/\/$/, '') + '/public/import_data_to_localstorage.js',
    base.replace(/\/$/, '') + '/public/data/sheep.json',
  ]

  let dataset = null
  for (const url of candidates) {
    try {
      process.stdout.write('Trying ' + url + '... ')
      const res = await fetchUrl(url)
      process.stdout.write('OK\n')
      const contentType = (res.headers['content-type'] || '').toLowerCase()
      if (contentType.includes('application/json') || res.body.trim().startsWith('[')) {
        dataset = JSON.parse(res.body)
      } else {
        // possibly a JS bundle; try to extract
        dataset = extractArrayFromBundle(res.body)
      }
      if (Array.isArray(dataset)) break
    } catch (e) {
      process.stdout.write('failed (' + e.message + ')\n')
    }
  }

  if (!Array.isArray(dataset)) {
    console.error('Failed to fetch dataset from site. Tried candidates:', candidates.join(', '))
    process.exitCode = 2
    return
  }

  // ensure folders exist
  const dataDir = path.join(process.cwd(), 'data')
  const publicSheepDir = path.join(process.cwd(), 'public', 'sheep')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(publicSheepDir)) fs.mkdirSync(publicSheepDir, { recursive: true })

  // write aggregated file
  const aggPath = path.join(dataDir, 'sheep.json')
  fs.writeFileSync(aggPath, JSON.stringify(dataset, null, 2), 'utf8')
  console.log('Wrote', aggPath)

  // write per-animal files (use id or generated key)
  let count = 0
  for (const s of dataset) {
    const id = s.id || s._id || ('sheep-' + Math.random().toString(36).slice(2, 9))
    const key = ('' + id).indexOf('sheep-') === 0 ? id : ('sheep-' + id)
    const filePath = path.join(publicSheepDir, key + '.json')
    fs.writeFileSync(filePath, JSON.stringify(s, null, 2), 'utf8')
    count++
  }
  console.log('Wrote', count, 'per-animal files to', publicSheepDir)
  console.log('Done.')
}

run().catch(err => { console.error(err); process.exitCode = 1 })
