import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { execSync } from 'node:child_process'

const dist = 'dist'

function isValidTag(t) {
  return /^v\d+\.\d+\.\d+$/.test(t)
}

async function getTag() {
  const arg = process.argv[2] ?? ''
  if (isValidTag(arg)) return arg
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let input
  while (!isValidTag(input)) {
    input = await rl.question('请输入 tag (格式 vx.y.z,例如 v1.0.1): ')
    if (!isValidTag(input)) {
      console.error(`格式不正确: "${input}",请重新输入`)
    }
  }
  rl.close()
  return input
}

function findAsset(ext) {
  const assetsDir = join(dist, 'assets')
  if (!existsSync(assetsDir)) return null
  const re = new RegExp(`^index-[\\w.-]+\\.${ext}$`)
  for (const name of readdirSync(assetsDir)) {
    if (re.test(name)) return name
  }
  return null
}

async function main() {
  if (!existsSync(dist)) {
    console.error('dist 目录不存在,请先执行构建 (pnpm build)')
    process.exit(1)
  }

  const tag = await getTag()

  const indexHtmlPath = join(dist, 'index.html')
  if (!existsSync(indexHtmlPath)) {
    console.error('未找到 dist/index.html,请先执行 pnpm build')
    process.exit(1)
  }

  const indexHtml = readFileSync(indexHtmlPath, 'utf8')

  const jsFromHtml = indexHtml.match(/(?:src=["'].*?\/)?(index-[\w.-]+\.js)["']/)?.[1]
  const cssFromHtml = indexHtml.match(/(?:href=["'].*?\/)?(index-[\w.-]+\.css)["']/)?.[1]

  const jsFile = findAsset('js')
  const cssFile = findAsset('css')

  if (!jsFile) {
    console.error('未能在 dist/assets 中找到 index-*.js,请先执行 pnpm build')
    process.exit(1)
  }
  if (jsFromHtml && jsFromHtml !== jsFile) {
    console.error(`js 文件不一致: dist/index.html 引用 ${jsFromHtml},dist/assets 中实际为 ${jsFile}`)
    process.exit(1)
  }
  if (cssFromHtml && !cssFile) {
    console.error(`dist/index.html 引用了 ${cssFromHtml},但 dist/assets 中未找到 index-*.css`)
    process.exit(1)
  }

  const base = `https://cdn.jsdelivr.net/gh/2999/cargo-packing-demos@${tag}/dist`
  const html = `<!DOCTYPE html>
<html lang="">

<head>
  <meta charset="UTF-8">
  <link rel="icon" href="${base}/favicon.ico">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vite App</title>
  <script type="module" crossorigin src="${base}/assets/${jsFile}"></script>
${cssFile ? `  <link rel="stylesheet" crossorigin href="${base}/assets/${cssFile}">\n` : ''}</head>

<body>
  <div id="app"></div>
</body>

</html>
`

  mkdirSync('docs', { recursive: true })
  writeFileSync(join('docs', 'index.html'), html)
  console.log(`已生成 docs/index.html (tag: ${tag}, js: ${jsFile}${cssFile ? `, css: ${cssFile}` : ', 无 css 文件'})`)

  execSync('git add docs/index.html', { stdio: 'inherit' })
  execSync('git commit -m "add index-run.html"', { stdio: 'inherit' })
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
  execSync(`git push origin ${branch}`, { stdio: 'inherit' })
  execSync(`git tag ${tag}`, { stdio: 'inherit' })
  execSync(`git push origin ${tag}`, { stdio: 'inherit' })
  console.log(`已推送分支 ${branch} 和 tag ${tag} 到远端`)
}

main()
