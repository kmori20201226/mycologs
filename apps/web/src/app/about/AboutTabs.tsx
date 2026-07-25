'use client'

import { useState } from 'react'
import ContactSection from './ContactSection'

export interface ChangelogEntry {
  version: string
  date: string
  items: string[]
}

interface Props {
  versionString: string
  changelog: ChangelogEntry[]
}

export default function AboutTabs({ versionString, changelog }: Props) {
  const [tab, setTab] = useState<'about' | 'changelog'>('about')

  return (
    <>
      {/* Tab bar */}
      <div className="flex border-b">
        {(['about', 'changelog'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {key === 'about' ? '概要' : '更新履歴'}
          </button>
        ))}
      </div>

      {/* About tab */}
      {tab === 'about' && (
        <div className="space-y-6 pt-4">
          <div className="text-center">
            <div className="text-5xl mb-3">🍄</div>
            <h1 className="text-2xl font-bold text-gray-900">Mycologs</h1>
            <p className="text-sm text-gray-400 mt-1">きのこ同定と菌類探索のプラットフォーム</p>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">バージョン</span>
              <span className="font-mono font-medium text-gray-800">{versionString}</span>
            </div>
          </div>

          <div className="border-t pt-4 flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/qr-mycologs.svg"
              alt="Mycologs（https://mycologs.club）へのQRコード"
              width={320}
              height={320}
              className="rounded-lg border border-gray-100"
            />
            <a
              href="https://mycologs.club"
              className="text-sm text-emerald-600 hover:underline"
            >
              mycologs.club
            </a>
          </div>

          <ContactSection />
        </div>
      )}

      {/* Changelog tab */}
      {tab === 'changelog' && (
        <div className="pt-4 space-y-6">
          {changelog.map((entry) => (
            <div key={entry.version}>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="font-bold text-gray-900">{entry.version}</span>
                <span className="text-xs text-gray-400">{entry.date}</span>
              </div>
              <ul className="space-y-1">
                {entry.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
