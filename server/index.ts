import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import './env'
import { app } from './app'
import * as repo from './db'
import { broadcast } from './hub'

const PORT = Number(process.env.PORT ?? 8787)

if (existsSync('dist/index.html')) {
  app.use('/assets/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

setInterval(() => {
  void repo.tickOverdue().then((next) => {
    if (next) broadcast(next)
  })
}, 15000)

const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`NHIH ops API on http://localhost:${info.port} (${repo.persistence()})`)
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other API with: kill $(lsof -ti :${PORT})`)
    process.exit(1)
  }
  throw err
})
