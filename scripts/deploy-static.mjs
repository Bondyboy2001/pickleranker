import { spawnSync } from 'node:child_process'

const PUBLIC_ALIAS = 'dlpickle.vercel.app'
// The Vercel CLI no longer assumes a default team in non-interactive mode, so
// every command needs an explicit scope.
const SCOPE = '12hbond-9352s-projects'

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

run('npm', ['run', 'build'])
const deployOutput = run('npx', ['vercel', 'deploy', 'out', '--prod', '--scope', SCOPE])
let deploymentUrl =
  deployOutput.match(/"url":\s*"([^"]+)"/)?.[1] ??
  deployOutput.match(/Production\s+(https:\/\/\S+)/)?.[1]

if (!deploymentUrl) {
  const listOutput = run('npx', ['vercel', 'ls', 'out', '--scope', SCOPE])
  deploymentUrl = listOutput.match(/https:\/\/out-\S+?\.vercel\.app/)?.[0]
}

if (!deploymentUrl) {
  console.error('Could not find deployment URL in Vercel output or deployment list.')
  process.exit(1)
}

run('npx', ['vercel', 'alias', 'set', deploymentUrl, PUBLIC_ALIAS, '--scope', SCOPE])
