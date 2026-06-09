'use client'

import { useEffect, useRef, useState } from 'react'
import type { Event } from '@/lib/api'

interface Props {
  events: Event[]
  value: number | ''
  onChange: (id: number | '') => void
  // Used only for the leading icon (club vs. personal event).
  clubEventIds?: Set<number>
  disabled?: boolean
  placeholder?: string
}

// Label for an event option: a club/personal icon, an optional date, the name.
function eventLabel(ev: Event, clubEventIds?: Set<number>): string {
  const prefix = clubEventIds?.has(ev.id) ? '👨‍👩‍👧‍👧 ' : '😊 '
  const date = ev.startAt
    ? `${new Date(ev.startAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} `
    : ''
  return `${prefix}${date}${ev.name}`
}

// A searchable, clearable single-select for events (the user's club + private
// events). Filters by name and place as the user types.
export default function EventCombobox({ events, value, onChange, clubEventIds, disabled, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = events.find((e) => e.id === value) ?? null

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? events.filter((e) => `${e.name} ${e.place ?? ''}`.toLowerCase().includes(needle))
    : events

  function select(id: number | '') {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  // When open, the input reflects what the user is typing; when closed, it shows
  // the current selection's label.
  const inputValue = open ? query : selected ? eventLabel(selected, clubEventIds) : ''

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          placeholder={placeholder ?? 'イベントを検索…'}
          disabled={disabled}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          className="w-full border rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
        />
        {selected && !disabled ? (
          <button
            type="button"
            onClick={() => select('')}
            aria-label="イベントの選択を解除"
            className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <span className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        )}
      </div>

      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
          <li>
            <button
              type="button"
              onClick={() => select('')}
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${value === '' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500'}`}
            >
              イベントなし
            </button>
          </li>
          {filtered.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                onClick={() => select(ev.id)}
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${ev.id === value ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'}`}
              >
                {eventLabel(ev, clubEventIds)}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-gray-400">該当するイベントがありません</li>
          )}
        </ul>
      )}
    </div>
  )
}
