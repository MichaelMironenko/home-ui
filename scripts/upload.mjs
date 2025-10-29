#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { env, exit } from 'node:process'

const { SKIP_DEPLOY, DEPLOY_BUCKET, S3_BUCKET, AWS_BUCKET } = env

if (SKIP_DEPLOY === '1' || SKIP_DEPLOY?.toLowerCase() === 'true') {
  console.log('[deploy] SKIP_DEPLOY flag detected, upload step skipped.')
  exit(0)
}

const bucket = DEPLOY_BUCKET || S3_BUCKET || AWS_BUCKET

if (!bucket) {
  console.error('[deploy] Missing DEPLOY_BUCKET environment variable.')
  console.error('[deploy] Set DEPLOY_BUCKET (or S3_BUCKET/AWS_BUCKET) to your Yandex Object Storage bucket name.')
  exit(1)
}

const prefix = (env.DEPLOY_PREFIX || '').replace(/^\/+|\/+$/g, '')
const profile = env.DEPLOY_PROFILE
const cacheControl = env.DEPLOY_CACHE_CONTROL
const ycCli = env.YC_CLI_BIN || env.DEPLOY_CLI || 'yc'
const distDir = env.DEPLOY_DIST || 'dist'

if (!existsSync(distDir)) {
  console.error(`[deploy] Directory "${distDir}" not found. Run vite build first.`)
  exit(1)
}

const shouldClean =
  env.DEPLOY_CLEAN === '1' || env.DEPLOY_CLEAN?.toLowerCase() === 'true'

const acl =
  env.DEPLOY_ACL === 'none'
    ? null
    : env.DEPLOY_ACL && env.DEPLOY_ACL.trim().length > 0
      ? env.DEPLOY_ACL
      : 'public-read'

const baseArgs = profile ? ['--profile', profile] : []
const baseUri = prefix ? `s3://${bucket}/${prefix}` : `s3://${bucket}`

const extMime = new Map([
  ['.html', 'text/html'],
  ['.css', 'text/css'],
  ['.js', 'application/javascript'],
  ['.json', 'application/json'],
  ['.map', 'application/json'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.webp', 'image/webp'],
  ['.txt', 'text/plain'],
  ['.xml', 'application/xml'],
  ['.pdf', 'application/pdf'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf']
])

const posixJoin = (...parts) => parts.filter(Boolean).join('/')

const runCli = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(ycCli, [...baseArgs, ...args], { stdio: 'inherit' })

    child.on('error', (err) => {
      reject(new Error(`[deploy] Failed to start ${ycCli}: ${err.message}`))
    })

    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`[deploy] Command interrupted by signal ${signal}`))
        return
      }

      if (code !== 0) {
        reject(new Error(`[deploy] Command exited with code ${code}`))
        return
      }

      resolve()
    })
  })

const collectFiles = async (dir, root = dir) => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(abs, root)))
    } else if (entry.isFile()) {
      files.push(path.relative(root, abs))
    }
  }

  return files
}

const toMime = (file) => {
  const ext = path.extname(file).toLowerCase()
  return extMime.get(ext) || 'application/octet-stream'
}

const main = async () => {
  const files = await collectFiles(distDir)

  if (files.length === 0) {
    console.error('[deploy] No files found in dist directory.')
    exit(1)
  }

  if (shouldClean) {
    const target = prefix ? `${baseUri}/` : baseUri
    console.log(`[deploy] Cleaning ${target}`)
    try {
      await runCli(['storage', 's3', 'rm', target, '--recursive'])
    } catch (err) {
      console.error(err.message)
      exit(1)
    }
  }

  console.log(`[deploy] Uploading ${files.length} file(s) from ${distDir} to ${baseUri} via ${ycCli}`)

  for (const relativeFile of files) {
    const localPath = path.join(distDir, relativeFile)
    const remoteKey = posixJoin(prefix, relativeFile.split(path.sep).join('/'))
    const remoteUri = `s3://${bucket}/${remoteKey}`
    const mime = toMime(relativeFile)

    const args = ['storage', 's3', 'cp', localPath, remoteUri, '--content-type', mime]

    if (cacheControl) {
      args.push('--cache-control', cacheControl)
    }

    if (acl) {
      args.push('--acl', acl)
    }

    console.log(`[deploy] -> ${remoteKey} (${mime})`)

    try {
      await runCli(args)
    } catch (err) {
      console.error(err.message)
      exit(1)
    }
  }

  console.log('[deploy] Upload complete.')
}

main().catch((err) => {
  console.error('[deploy] Unexpected error:', err)
  exit(1)
})
