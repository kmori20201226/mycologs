import fs from 'fs'
import path from 'path'
import AboutTabs, { type ChangelogEntry } from './AboutTabs'

function parseChangelog(): ChangelogEntry[] {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), '../../CHANGELOG.md'), 'utf-8')
    return content
      .split(/^## /m)
      .filter(Boolean)
      .map((section) => {
        const lines = section.trim().split('\n')
        const header = lines[0]
        const match = header.match(/^([\d.]+)\s*\(([^)]+)\)/)
        const version = match?.[1] ?? header
        const date = match?.[2] ?? ''
        const items = lines.slice(1).filter((l) => l.startsWith('- ')).map((l) => l.slice(2))
        return { version, date, items }
      })
  } catch {
    return []
  }
}

function readGitInfo(): { hash: string; branch: string } {
  try {
    const lines = fs.readFileSync(path.join(process.cwd(), '../../git-info.txt'), 'utf-8').trim().split('\n')
    return { hash: lines[0] ?? 'unknown', branch: lines[1] ?? 'unknown' }
  } catch {
    return { hash: 'unknown', branch: 'unknown' }
  }
}

export default function AboutPage() {
  const changelog = parseChangelog()
  const git = readGitInfo()
  const version = changelog[0]?.version ?? '—'
  const versionString = `${version}-${git.branch}-${git.hash}`

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-xl">
        <div className="bg-white rounded-2xl shadow p-8">
          <AboutTabs versionString={versionString} changelog={changelog} />
        </div>
      </div>
    </div>
  )
}
