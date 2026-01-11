'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Database, Trash2, Loader2, AlertCircle, CheckCircle, AlertTriangle, Shuffle } from 'lucide-react'

interface SeedResult {
    seed_id: string
    variant: string
    range: { start: string; end: string }
    seeded_employee_ids: string[]
    created: {
        logs_inserted: number
        daily_upserted: number
        requests_created: number
        approvals_created: number
        meal_claims_created: number
    }
}

interface ClearResult {
    seed_id: string
    deleted: {
        logs_deleted: number
        daily_deleted: number
        requests_deleted: number
        approvals_deleted: number
        claims_deleted: number
    }
}

interface StoredSeedData {
    seed_id: string
    range: { start: string; end: string }
    employee_ids: string[]
    variant?: string
}

const STORAGE_KEY = 'hrapp_seed_data'

export function DevToolsClient() {
    const [storedData, setStoredData] = useState<StoredSeedData | null>(null)
    const [seedLoading, setSeedLoading] = useState(false)
    const [clearLoading, setClearLoading] = useState(false)
    const [seedResult, setSeedResult] = useState<SeedResult | null>(null)
    const [clearResult, setClearResult] = useState<ClearResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored) {
                setStoredData(JSON.parse(stored))
            }
        } catch {
            // Ignore parse errors
        }
    }, [])

    const handleSeed = async (variant: 'default' | 'random' = 'default') => {
        setSeedLoading(true)
        setError(null)
        setSeedResult(null)
        setClearResult(null)

        try {
            const res = await fetch(`/api/admin/dev/seed?variant=${variant}`, { method: 'POST' })
            const data = await res.json()

            if (res.ok && data.success) {
                setSeedResult(data)
                const newStoredData: StoredSeedData = {
                    seed_id: data.seed_id,
                    range: data.range,
                    employee_ids: data.seeded_employee_ids || [],
                    variant: data.variant,
                }
                setStoredData(newStoredData)
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newStoredData))
            } else {
                setError(data.error || 'Failed to generate demo data')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate')
        } finally {
            setSeedLoading(false)
        }
    }

    const handleClear = async () => {
        if (!storedData?.seed_id) {
            setError('No seed data found')
            return
        }

        setClearLoading(true)
        setError(null)
        setSeedResult(null)
        setClearResult(null)

        try {
            const res = await fetch('/api/admin/dev/seed/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    seed_id: storedData.seed_id,
                    range: storedData.range,
                    employee_ids: storedData.employee_ids,
                }),
            })
            const data = await res.json()

            if (res.ok && data.success) {
                setClearResult(data)
                setStoredData(null)
                localStorage.removeItem(STORAGE_KEY)
            } else {
                setError(data.error || 'Failed to clear demo data')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clear')
        } finally {
            setClearLoading(false)
        }
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Warning Banner */}
            <div className="flex items-center gap-3 p-4 bg-warning-bg rounded-xl">
                <AlertTriangle className="w-5 h-5 text-warning-text flex-shrink-0" />
                <p className="text-sm text-warning-text">
                    These tools are for development/testing only. They will be disabled in production environments.
                </p>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-4 bg-danger-bg rounded-xl">
                    <AlertCircle className="w-5 h-5 text-danger-text" />
                    <p className="text-sm text-danger-text">{error}</p>
                </div>
            )}

            {/* Generate Demo Data */}
            <Card variant="bordered">
                <CardHeader
                    title="Generate Demo Data"
                    subtitle="Create 14 days of attendance logs, requests, and meal claims"
                />
                <CardContent>
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                onClick={() => handleSeed('default')}
                                disabled={seedLoading || clearLoading}
                                icon={seedLoading ? Loader2 : Database}
                                className={seedLoading ? 'animate-pulse' : ''}
                            >
                                {seedLoading ? 'Generating...' : 'Default'}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => handleSeed('random')}
                                disabled={seedLoading || clearLoading}
                                icon={seedLoading ? Loader2 : Shuffle}
                                className={seedLoading ? 'animate-pulse' : ''}
                            >
                                {seedLoading ? 'Generating...' : 'Random'}
                            </Button>
                        </div>
                        <p className="text-xs text-text-sub">
                            <strong>Default:</strong> Consistent data (08:50-09:55 check-in, 100% presence)<br />
                            <strong>Random:</strong> Varied data (08:45-10:15, 80-95% presence, mixed approvals)
                        </p>

                        {seedResult && (
                            <div className="p-4 bg-success-bg rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                    <CheckCircle className="w-5 h-5 text-success-text" />
                                    <span className="font-medium text-success-text">
                                        Demo data created! ({seedResult.variant})
                                    </span>
                                </div>
                                <div className="grid gap-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Seed ID:</span>
                                        <code className="text-text-main font-mono text-xs bg-bg-page px-2 py-1 rounded">
                                            {seedResult.seed_id.slice(0, 8)}...
                                        </code>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Date Range:</span>
                                        <span className="text-text-main">{seedResult.range.start} to {seedResult.range.end}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Employees:</span>
                                        <span className="text-text-main">{seedResult.seeded_employee_ids?.length || 0}</span>
                                    </div>
                                    <hr className="border-border-subtle my-2" />
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Logs:</span>
                                        <span className="text-text-main font-medium">{seedResult.created.logs_inserted}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Daily records:</span>
                                        <span className="text-text-main font-medium">{seedResult.created.daily_upserted}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Requests:</span>
                                        <span className="text-text-main font-medium">{seedResult.created.requests_created}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Approvals:</span>
                                        <span className="text-text-main font-medium">{seedResult.created.approvals_created}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Meal claims:</span>
                                        <span className="text-text-main font-medium">{seedResult.created.meal_claims_created}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Clear Demo Data */}
            <Card variant="bordered">
                <CardHeader
                    title="Clear Demo Data"
                    subtitle="Remove all data created by the last seed"
                />
                <CardContent>
                    <div className="flex flex-col gap-4">
                        {storedData ? (
                            <div className="p-3 bg-bg-page rounded-lg text-sm">
                                <div className="flex justify-between mb-1">
                                    <span className="text-text-sub">Seed:</span>
                                    <code className="font-mono text-xs">{storedData.seed_id.slice(0, 8)}...</code>
                                </div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-text-sub">Range:</span>
                                    <span className="text-text-main">{storedData.range.start} → {storedData.range.end}</span>
                                </div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-text-sub">Employees:</span>
                                    <span className="text-text-main">{storedData.employee_ids.length}</span>
                                </div>
                                {storedData.variant && (
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Variant:</span>
                                        <span className="text-text-main">{storedData.variant}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-text-sub">No seed data stored. Generate demo data first.</p>
                        )}

                        <Button
                            variant="secondary"
                            onClick={handleClear}
                            disabled={seedLoading || clearLoading || !storedData}
                            icon={clearLoading ? Loader2 : Trash2}
                            className={clearLoading ? 'animate-pulse' : ''}
                        >
                            {clearLoading ? 'Clearing...' : 'Clear All Demo Data'}
                        </Button>

                        {clearResult && (
                            <div className="p-4 bg-bg-page rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                    <CheckCircle className="w-5 h-5 text-success-text" />
                                    <span className="font-medium text-text-main">Demo data cleared!</span>
                                </div>
                                <div className="grid gap-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Logs deleted:</span>
                                        <span className="text-text-main font-medium">{clearResult.deleted.logs_deleted}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Daily records:</span>
                                        <span className="text-text-main font-medium">{clearResult.deleted.daily_deleted}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Requests:</span>
                                        <span className="text-text-main font-medium">{clearResult.deleted.requests_deleted}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Approvals:</span>
                                        <span className="text-text-main font-medium">{clearResult.deleted.approvals_deleted}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-text-sub">Meal claims:</span>
                                        <span className="text-text-main font-medium">{clearResult.deleted.claims_deleted}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
