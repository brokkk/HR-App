'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ChevronLeft, Calendar, FileText, Loader2, CheckCircle, User } from 'lucide-react'
import Link from 'next/link'

type RequestType = 'leave' | 'overtime'

interface Project {
    id: string
    name: string
    account_manager_id: string | null
    account_manager_name: string | null
}

export default function NewRequestPage() {
    const router = useRouter()
    const [type, setType] = useState<RequestType>('leave')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [reason, setReason] = useState('')
    const [projectId, setProjectId] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Projects for overtime
    const [projects, setProjects] = useState<Project[]>([])
    const [loadingProjects, setLoadingProjects] = useState(false)

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Fetch projects when overtime is selected
    useEffect(() => {
        if (type === 'overtime' && projects.length === 0) {
            fetchProjects()
        }
    }, [type])

    const fetchProjects = async () => {
        setLoadingProjects(true)
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('id, name, account_manager_id')
                .eq('is_active', true)
                .order('name')

            if (error) throw error

            console.log('Projects fetched:', data)

            // Get AM names
            const amIds = [...new Set((data || []).map(p => p.account_manager_id).filter(Boolean))] as string[]
            console.log('AM IDs to fetch:', amIds)

            let amMap = new Map<string, string>()

            if (amIds.length > 0) {
                const { data: ams, error: amError } = await supabase
                    .from('employees')
                    .select('id, full_name')
                    .in('id', amIds)

                console.log('AM employees fetched:', ams, 'Error:', amError)

                if (ams) {
                    amMap = new Map(ams.map(a => [a.id, a.full_name || 'Unknown']))
                }
            }

            const projectsWithAm = (data || []).map(p => ({
                ...p,
                account_manager_name: p.account_manager_id ? amMap.get(p.account_manager_id) || null : null,
            }))
            console.log('Projects with AM names:', projectsWithAm)

            setProjects(projectsWithAm)

        } catch (err) {
            console.error('Failed to fetch projects:', err)
        } finally {
            setLoadingProjects(false)
        }
    }

    const selectedProject = projects.find(p => p.id === projectId)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!startDate) {
            setError('Tanggal mulai wajib diisi')
            return
        }

        if (type === 'overtime' && !projectId) {
            setError('Proyek wajib dipilih untuk lembur')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    start_date: startDate,
                    end_date: endDate || null,
                    reason,
                    project_id: type === 'overtime' ? projectId : undefined,
                }),
            })

            const result = await response.json()

            if (result.success) {
                setSuccess(true)
                setTimeout(() => router.push('/requests'), 1500)
            } else {
                setError(result.error || 'Gagal membuat permintaan')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal membuat')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-success-text" />
                </div>
                <h2 className="text-xl font-bold text-text-main">Permintaan Terkirim!</h2>
                <p className="text-text-sub">Mengarahkan ke daftar permintaan...</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 pb-24">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link href="/requests">
                    <Button variant="ghost" size="icon" icon={ChevronLeft} />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-text-main">Permintaan Baru</h1>
                    <p className="text-sm text-text-sub">Ajukan cuti atau lembur</p>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit}>
                <Card variant="bordered">
                    <CardHeader title="Detail Permintaan" />
                    <CardContent>
                        <div className="flex flex-col gap-5">
                            {/* Type Selector */}
                            <div>
                                <label className="text-sm font-medium text-text-main mb-2 block">Jenis</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setType('leave')}
                                        className={`p-4 rounded-xl border-2 transition-colors ${type === 'leave'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border-subtle hover:border-primary/50'
                                            }`}
                                    >
                                        <Calendar className={`w-6 h-6 mx-auto mb-2 ${type === 'leave' ? 'text-primary' : 'text-text-sub'}`} />
                                        <p className={`text-sm font-medium ${type === 'leave' ? 'text-primary' : 'text-text-main'}`}>
                                            Cuti (Leave)
                                        </p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('overtime')}
                                        className={`p-4 rounded-xl border-2 transition-colors ${type === 'overtime'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border-subtle hover:border-primary/50'
                                            }`}
                                    >
                                        <FileText className={`w-6 h-6 mx-auto mb-2 ${type === 'overtime' ? 'text-primary' : 'text-text-sub'}`} />
                                        <p className={`text-sm font-medium ${type === 'overtime' ? 'text-primary' : 'text-text-main'}`}>
                                            Lembur (Overtime)
                                        </p>
                                    </button>
                                </div>
                            </div>

                            {/* Project Selector (Overtime only) */}
                            {type === 'overtime' && (
                                <div>
                                    <label className="text-sm font-medium text-text-main mb-2 block">
                                        Proyek <span className="text-danger-text">*</span>
                                    </label>
                                    {loadingProjects ? (
                                        <div className="flex items-center gap-2 text-text-sub">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span className="text-sm">Memuat proyek...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <select
                                                value={projectId}
                                                onChange={(e) => setProjectId(e.target.value)}
                                                className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                                required
                                            >
                                                <option value="">-- Pilih Proyek --</option>
                                                {projects.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>

                                            {/* AM Info */}
                                            {selectedProject && (
                                                <div className="mt-2 p-3 bg-bg-page rounded-xl flex items-center gap-2">
                                                    <User className="w-4 h-4 text-text-sub" />
                                                    <span className="text-sm text-text-sub">
                                                        Account Manager: {' '}
                                                        <span className="text-text-main font-medium">
                                                            {selectedProject.account_manager_name || '(Belum ditentukan)'}
                                                        </span>
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Start Date */}
                            <Input
                                label="Tanggal Mulai"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                required
                            />

                            {/* End Date */}
                            <Input
                                label="Tanggal Selesai (opsional)"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={startDate}
                            />

                            {/* Reason */}
                            <div>
                                <label className="text-sm font-medium text-text-main mb-2 block">Alasan</label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Jelaskan alasan permintaan..."
                                    className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-bg-surface text-text-main placeholder:text-text-sub focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                                    rows={3}
                                />
                            </div>

                            {/* Info for overtime */}
                            {type === 'overtime' && (
                                <div className="p-3 bg-info-bg rounded-xl">
                                    <p className="text-sm text-info-text">
                                        💡 Lembur akan disetujui oleh AM proyek, lalu HR. Uang makan Rp 50.000 otomatis dicatat setelah disetujui.
                                    </p>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="p-3 bg-danger-bg rounded-xl">
                                    <p className="text-sm text-danger-text">{error}</p>
                                </div>
                            )}

                            {/* Submit */}
                            <Button
                                type="submit"
                                disabled={loading || !startDate || (type === 'overtime' && !projectId)}
                                icon={loading ? Loader2 : undefined}
                                className={loading ? 'animate-pulse' : ''}
                            >
                                {loading ? 'Mengirim...' : 'Kirim Permintaan'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    )
}
