import fs from 'fs'
import path from 'path'
import ContactSection from './ContactSection'

function readVersion(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), '../../version.txt'), 'utf-8').trim()
  } catch {
    return '—'
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
  const version = readVersion()
  const git = readGitInfo()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-xl">
        <div className="bg-white rounded-2xl shadow p-8 space-y-6">

          <div className="text-center">
            <div className="text-5xl mb-3">🍄</div>
            <h1 className="text-2xl font-bold text-gray-900">Mycologs</h1>
            <p className="text-sm text-gray-400 mt-1">きのこ同定と菌類探索のプラットフォーム</p>
          </div>

          <div className="border-t pt-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">バージョン</span>
              <span className="font-mono font-medium text-gray-800">{version}-{git.branch}-{git.hash}</span>
            </div>
          </div>

          <ContactSection />

        </div>
      </div>
    </div>
  )
}
