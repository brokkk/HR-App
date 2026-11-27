'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { mapToEmployees, parseCSV } from '@/lib/attendance/parser'

const sample = `external_id,timestamp,event_type
DEMO-01,2026-01-12T09:00:00+07:00,IN
DEMO-01,2026-01-12T18:00:00+07:00,OUT
DEMO-02,2026-01-12T09:05:00+07:00,IN
UNKNOWN,2026-01-12T09:12:00+07:00,IN
DEMO-02,invalid-date,OUT`

const demoEmployees = new Map([
    ['DEMO-01', { id: 'demo-01', name: 'Demo Employee 1' }],
    ['DEMO-02', { id: 'demo-02', name: 'Demo Employee 2' }],
])

function previewCSV(csv: string) {
    const parsed = parseCSV(csv)
    return { ...parsed, ...mapToEmployees(parsed.valid, demoEmployees) }
}

export default function AttendanceDemoPage() {
    const [csv, setCsv] = useState(sample)
    const [preview, setPreview] = useState(() => previewCSV(sample))

    return (
        <main className="min-h-screen bg-bg-page px-4 py-10">
            <div className="mx-auto max-w-3xl space-y-6">
                <header className="space-y-3">
                    <Link href="/login" className="text-sm font-semibold text-primary underline">
                        HR App
                    </Link>
                    <h1 className="text-3xl font-bold text-text-main">Attendance CSV preview</h1>
                    <p className="text-text-sub">
                        Try the attendance importer with sample data. Preview runs in your browser
                        using two demo employee IDs, <code>DEMO-01</code> and <code>DEMO-02</code>.
                    </p>
                </header>

                <Card variant="bordered">
                    <CardContent>
                        <form className="space-y-3" onSubmit={event => {
                            event.preventDefault()
                            setPreview(previewCSV(csv))
                        }}>
                            <label htmlFor="attendance-csv" className="block font-semibold text-text-main">
                                CSV sample
                            </label>
                            <textarea
                                id="attendance-csv"
                                value={csv}
                                onChange={event => setCsv(event.target.value)}
                                rows={8}
                                maxLength={50000}
                                spellCheck={false}
                                className="w-full rounded-lg border border-border-subtle bg-bg-page p-3 font-mono text-sm text-text-main"
                            />
                            <Button type="submit">Preview CSV</Button>
                        </form>
                    </CardContent>
                </Card>

                <Card variant="bordered">
                    <CardContent className="space-y-4">
                        <h2 className="text-lg font-bold text-text-main">Preview results</h2>
                        <p aria-live="polite" className="text-sm text-text-main">
                            {preview.mapped.length} mapped · {preview.valid.length - preview.mapped.length} unmatched · {preview.invalid.length} invalid
                        </p>
                        {preview.mapped.length > 0 && (
                            <ul className="list-disc space-y-1 pl-5 text-sm text-text-sub">
                                {preview.mapped.slice(0, 10).map(row => (
                                    <li key={row.rowNumber}>
                                        Row {row.rowNumber}: {row.externalId} → {row.employeeName}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {preview.unmapped.length > 0 && (
                            <ul className="list-disc space-y-1 pl-5 text-sm text-text-sub">
                                {preview.unmapped.slice(0, 10).map(row => (
                                    <li key={row.externalId}>{row.externalId}: {row.count} unmatched</li>
                                ))}
                            </ul>
                        )}
                        {preview.invalid.length > 0 && (
                            <ul className="list-disc space-y-1 pl-5 text-sm text-text-sub">
                                {preview.invalid.slice(0, 10).map(row => (
                                    <li key={row.rowNumber}>Row {row.rowNumber}: {row.reason}</li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </main>
    )
}
