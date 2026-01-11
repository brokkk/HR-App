'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Upload, FileText, AlertCircle, CheckCircle, XCircle, Loader2, Database, Calculator } from 'lucide-react'
import type { ImportPreviewResponse } from '@/app/api/attendance/import/route'
import type { CommitResponse } from '@/app/api/attendance/import/commit/route'
import type { ComputeResponse } from '@/app/api/attendance/compute/route'

type ImportState = 'idle' | 'uploading' | 'preview' | 'committing' | 'committed' | 'computing' | 'computed' | 'error'

interface CommitStats {
    total: number
    mapped: number
    unmapped: number
    inserted: number
    skipped: number
    errors: string[]
}

interface ComputeStats {
    impactedDays: number
    computed: number
    errors: string[]
}

export default function AttendanceImportPage() {
    const [state, setState] = useState<ImportState>('idle')
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)
    const [commitStats, setCommitStats] = useState<CommitStats | null>(null)
    const [computeStats, setComputeStats] = useState<ComputeStats | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            setFile(selectedFile)
            setError(null)
            setPreview(null)
            setCommitStats(null)
            setComputeStats(null)
            setState('idle')
        }
    }

    const handleUpload = async () => {
        if (!file) return
        setState('uploading')
        setError(null)

        try {
            const formData = new FormData()
            formData.append('file', file)
            const response = await fetch('/api/attendance/import', {
                method: 'POST',
                body: formData,
            })
            const result: ImportPreviewResponse = await response.json()

            if (result.success) {
                setPreview(result)
                setState('preview')
            } else {
                setError(result.error || 'Upload failed')
                setPreview(result)
                setState('error')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed')
            setState('error')
        }
    }

    const handleCommit = async () => {
        if (!preview?.batchId) return
        setState('committing')
        setError(null)

        try {
            const response = await fetch('/api/attendance/import/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId: preview.batchId }),
            })
            const result: CommitResponse = await response.json()

            if (result.success && result.stats) {
                setCommitStats(result.stats)
                setState('committed')
            } else {
                setError(result.error || 'Commit failed')
                setState('error')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Commit failed')
            setState('error')
        }
    }

    const handleCompute = async () => {
        if (!preview?.batchId) return
        setState('computing')
        setError(null)

        try {
            const response = await fetch('/api/attendance/compute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId: preview.batchId }),
            })
            const result: ComputeResponse = await response.json()

            if (result.success && result.stats) {
                setComputeStats(result.stats)
                setState('computed')
            } else {
                setError(result.error || 'Compute failed')
                setState('error')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Compute failed')
            setState('error')
        }
    }

    return (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-text-main tracking-tight">Import Attendance</h1>
                <p className="text-text-sub mt-1">Upload CSV file from fingerprint device</p>
            </div>

            {/* Upload Section */}
            <Card variant="bordered">
                <CardHeader title="Upload CSV" />
                <CardContent>
                    <div className="flex flex-col gap-4">
                        <div className="border-2 border-dashed border-border-subtle rounded-2xl p-8 text-center hover:border-primary transition-colors">
                            <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="csv-upload" />
                            <label htmlFor="csv-upload" className="cursor-pointer">
                                <FileText className="w-12 h-12 text-text-sub mx-auto mb-4" />
                                {file ? (
                                    <div>
                                        <p className="font-medium text-text-main">{file.name}</p>
                                        <p className="text-sm text-text-sub">{(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="font-medium text-text-main">Click to select CSV file</p>
                                        <p className="text-sm text-text-sub mt-1">Format: external_id, timestamp, event_type</p>
                                    </div>
                                )}
                            </label>
                        </div>
                        <Button
                            onClick={handleUpload}
                            disabled={!file || state === 'uploading' || state === 'committing' || state === 'computing'}
                            icon={state === 'uploading' ? Loader2 : Upload}
                            className={state === 'uploading' ? 'animate-pulse' : ''}
                        >
                            {state === 'uploading' ? 'Processing...' : 'Upload & Parse'}
                        </Button>
                        {error && (
                            <div className="flex items-center gap-2 p-4 bg-danger-bg rounded-xl">
                                <AlertCircle className="w-5 h-5 text-danger-text shrink-0" />
                                <p className="text-sm text-danger-text">{error}</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Compute Complete Section */}
            {state === 'computed' && computeStats && (
                <Card variant="bordered">
                    <CardHeader title="Daily Records Computed" action={<Badge variant="success">Complete</Badge>} />
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-success-bg rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-success-text">{computeStats.computed}</p>
                                <p className="text-xs text-text-sub">Days Computed</p>
                            </div>
                            <div className="bg-bg-page rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-primary">{computeStats.impactedDays}</p>
                                <p className="text-xs text-text-sub">Impacted Days</p>
                            </div>
                        </div>
                        {computeStats.errors.length > 0 && (
                            <div className="p-4 bg-danger-bg rounded-xl">
                                <p className="text-sm font-medium text-danger-text mb-2">Errors:</p>
                                {computeStats.errors.map((err, i) => (
                                    <p key={i} className="text-xs text-danger-text">{err}</p>
                                ))}
                            </div>
                        )}
                        <p className="text-sm text-text-sub text-center mt-4">
                            Late penalties have been calculated. Check /attendance to see daily records.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Commit Success Section */}
            {(state === 'committed' || state === 'computing') && commitStats && (
                <Card variant="bordered">
                    <CardHeader title="Import Complete" action={<Badge variant="success">Committed</Badge>} />
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <div className="bg-success-bg rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-success-text">{commitStats.inserted}</p>
                                <p className="text-xs text-text-sub">Inserted</p>
                            </div>
                            <div className="bg-bg-page rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-text-sub">{commitStats.skipped}</p>
                                <p className="text-xs text-text-sub">Skipped</p>
                            </div>
                            <div className="bg-bg-page rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-primary">{commitStats.mapped}</p>
                                <p className="text-xs text-text-sub">Mapped</p>
                            </div>
                            <div className="bg-warning-bg rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-warning-text">{commitStats.unmapped}</p>
                                <p className="text-xs text-text-sub">Unmapped</p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border-subtle">
                            <Button
                                onClick={handleCompute}
                                disabled={state === 'computing'}
                                className={`w-full ${state === 'computing' ? 'animate-pulse' : ''}`}
                                icon={state === 'computing' ? Loader2 : Calculator}
                            >
                                {state === 'computing' ? 'Computing...' : 'Compute Daily Records & Penalties'}
                            </Button>
                            <p className="text-xs text-text-sub text-center mt-2">
                                Calculates check_in/out times, late minutes, and penalties (Rp 50.000 if &gt; 09:30)
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Preview Section */}
            {preview?.preview && state !== 'committed' && state !== 'computing' && state !== 'computed' && (
                <Card variant="bordered">
                    <CardHeader
                        title="Preview"
                        action={
                            state === 'preview' ? <Badge variant="success">Ready to commit</Badge> :
                                state === 'committing' ? <Badge variant="info">Committing...</Badge> :
                                    state === 'error' ? <Badge variant="danger">Errors found</Badge> : null
                        }
                    />
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                            <div className="bg-bg-page rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-text-main">{preview.preview.total}</p>
                                <p className="text-xs text-text-sub">Total</p>
                            </div>
                            <div className="bg-bg-page rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-success-text">{preview.preview.validCount}</p>
                                <p className="text-xs text-text-sub">Valid</p>
                            </div>
                            <div className="bg-bg-page rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-danger-text">{preview.preview.invalidCount}</p>
                                <p className="text-xs text-text-sub">Invalid</p>
                            </div>
                            <div className="bg-bg-page rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-primary">{preview.preview.mappedCount}</p>
                                <p className="text-xs text-text-sub">Mapped</p>
                            </div>
                            <div className="bg-bg-page rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-warning-text">{preview.preview.unmappedCount}</p>
                                <p className="text-xs text-text-sub">Unmapped</p>
                            </div>
                        </div>

                        {preview.batchId && (
                            <div className="mb-6 p-3 bg-bg-page rounded-xl text-sm">
                                <span className="text-text-sub">Batch: </span>
                                <code className="text-text-main font-mono text-xs">{preview.batchId}</code>
                            </div>
                        )}

                        {preview.invalidRows && preview.invalidRows.length > 0 && (
                            <div className="mb-6">
                                <h3 className="font-medium text-text-main mb-3 flex items-center gap-2">
                                    <XCircle className="w-4 h-4 text-danger-text" />
                                    Invalid ({preview.invalidRows.length})
                                </h3>
                                <div className="overflow-x-auto max-h-48">
                                    <table className="w-full text-sm">
                                        <thead><tr className="text-text-sub border-b"><th className="px-2 py-1 text-left">Row</th><th className="px-2 py-1 text-left">Reason</th></tr></thead>
                                        <tbody>
                                            {preview.invalidRows.slice(0, 10).map((row) => (
                                                <tr key={row.rowNumber}><td className="px-2 py-1">{row.rowNumber}</td><td className="px-2 py-1 text-danger-text">{row.reason}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {preview.unmappedExternalIds && preview.unmappedExternalIds.length > 0 && (
                            <div className="mb-6">
                                <h3 className="font-medium text-text-main mb-3 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 text-warning-text" />
                                    Unmapped IDs
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {preview.unmappedExternalIds.map((item) => (
                                        <Badge key={item.externalId} variant="warning">{item.externalId} ({item.count})</Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {preview.mappedRows && preview.mappedRows.length > 0 && (
                            <div className="mb-6">
                                <h3 className="font-medium text-text-main mb-3 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-success-text" />
                                    Mapped (first {Math.min(preview.mappedRows.length, 10)})
                                </h3>
                                <div className="overflow-x-auto max-h-48">
                                    <table className="w-full text-sm">
                                        <thead><tr className="text-text-sub border-b"><th className="px-2 py-1">ID</th><th className="px-2 py-1">Employee</th><th className="px-2 py-1">Time</th></tr></thead>
                                        <tbody>
                                            {preview.mappedRows.slice(0, 10).map((row, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-2 py-1 font-mono text-xs">{row.externalId}</td>
                                                    <td className="px-2 py-1">{row.employeeName || row.employeeId.slice(0, 8)}</td>
                                                    <td className="px-2 py-1 text-text-sub">{new Date(row.timestamp).toLocaleString('id-ID')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {state === 'preview' && preview.batchId && preview.preview.mappedCount > 0 && (
                            <div className="pt-4 border-t border-border-subtle">
                                <Button onClick={handleCommit} className="w-full" icon={Database}>
                                    Commit {preview.preview.mappedCount} Records
                                </Button>
                            </div>
                        )}

                        {state === 'committing' && (
                            <div className="pt-4 border-t border-border-subtle">
                                <Button disabled className="w-full animate-pulse" icon={Loader2}>Committing...</Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
