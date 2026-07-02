#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const PROJECT_NAME = 'pickleranker'

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  return result.stdout
}

console.log('Building static export...')
run('npm', ['run', 'build'])

console.log('\nDeploying to Cloudflare Pages...')
run('npx', ['wrangler', 'pages', 'deploy', 'out', '--project-name', PROJECT_NAME])

console.log(`\n✓ Deployed to Cloudflare Pages`)
console.log(`  https://dlpickle.pages.dev`)
