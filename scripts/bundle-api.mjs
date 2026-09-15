import { mkdirSync } from 'node:fs'
import path from 'node:path'
import * as esbuild from 'esbuild'

mkdirSync(path.join(process.cwd(), 'api'), { recursive: true })

await esbuild.build({
  entryPoints: [path.join('server', 'vercel-handler.ts')],
  outfile: path.join('api', '[...path].js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logLevel: 'info',
  footer: {
    js: 'module.exports = module.exports.default || module.exports;',
  },
})
