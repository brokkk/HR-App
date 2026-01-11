'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Plus, Loader2, AlertCircle, Edit2, Trash2, X, Check, FolderOpen } from 'lucide-react'

interface Project {
    id: string
    name: string
    account_manager_id: string | null
    account_manager_name: string | null
    is_active: boolean
}

interface Employee {
    id: string
    full_name: string
}

export function ProjectsClient() {
    const [projects, setProjects] = useState<Project[]>([])
    const [employees, setEmployees] = useState<Employee[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Form state
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formName, setFormName] = useState('')
    const [formAmId, setFormAmId] = useState('')
    const [formActive, setFormActive] = useState(true)
    const [saving, setSaving] = useState(false)

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            // Fetch projects
            const res = await fetch('/api/admin/projects')
            const data = await res.json()
            if (data.success) {
                setProjects(data.items || [])
            } else {
                setError(data.error)
            }

            // Fetch active employees for AM dropdown
            const { data: emps } = await supabase
                .from('employees')
                .select('id, full_name')
                .eq('is_active', true)
                .order('full_name')

            setEmployees(emps || [])

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load')
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const resetForm = () => {
        setShowForm(false)
        setEditingId(null)
        setFormName('')
        setFormAmId('')
        setFormActive(true)
    }

    const handleEdit = (project: Project) => {
        setEditingId(project.id)
        setFormName(project.name)
        setFormAmId(project.account_manager_id || '')
        setFormActive(project.is_active)
        setShowForm(true)
    }

    const handleSubmit = async () => {
        if (!formName.trim()) {
            setError('Nama proyek wajib diisi')
            return
        }

        setSaving(true)
        setError(null)

        try {
            const method = editingId ? 'PATCH' : 'POST'
            const body = editingId
                ? { id: editingId, name: formName, account_manager_id: formAmId || null, is_active: formActive }
                : { name: formName, account_manager_id: formAmId || null, is_active: formActive }

            const res = await fetch('/api/admin/projects', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            const data = await res.json()

            if (data.success) {
                resetForm()
                fetchData()
            } else {
                setError(data.error)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal menyimpan')
        } finally {
            setSaving(false)
        }
    }

    const handleToggleActive = async (project: Project) => {
        try {
            const res = await fetch('/api/admin/projects', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: project.id, is_active: !project.is_active }),
            })

            const data = await res.json()
            if (data.success) {
                fetchData()
            } else {
                setError(data.error)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal mengubah status')
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-4 bg-danger-bg rounded-xl">
                    <AlertCircle className="w-5 h-5 text-danger-text" />
                    <p className="text-sm text-danger-text">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto">
                        <X className="w-4 h-4 text-danger-text" />
                    </button>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="text-sm text-text-sub">
                    {projects.filter(p => p.is_active).length} proyek aktif
                </div>
                <Button onClick={() => setShowForm(true)} icon={Plus}>
                    Tambah Proyek
                </Button>
            </div>

            {/* Form Modal */}
            {showForm && (
                <Card variant="bordered" className="p-6">
                    <h3 className="font-semibold text-text-main mb-4">
                        {editingId ? 'Edit Proyek' : 'Tambah Proyek'}
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-text-main mb-1 block">Nama Proyek</label>
                            <input
                                type="text"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder="Contoh: Project Alpha"
                                className="w-full px-4 py-2 rounded-xl border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-text-main mb-1 block">Account Manager</label>
                            <select
                                value={formAmId}
                                onChange={(e) => setFormAmId(e.target.value)}
                                className="w-full px-4 py-2 rounded-xl border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">-- Pilih AM --</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isActive"
                                checked={formActive}
                                onChange={(e) => setFormActive(e.target.checked)}
                                className="w-4 h-4"
                            />
                            <label htmlFor="isActive" className="text-sm text-text-main">Aktif</label>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={resetForm} className="flex-1">
                                Batal
                            </Button>
                            <Button onClick={handleSubmit} disabled={saving} className="flex-1" icon={saving ? Loader2 : Check}>
                                {saving ? 'Menyimpan...' : 'Simpan'}
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* Projects List */}
            <Card variant="bordered">
                <CardHeader title="Daftar Proyek" subtitle="Kelola proyek untuk lembur" />
                <CardContent className="p-0">
                    {projects.length === 0 ? (
                        <div className="py-12 text-center">
                            <FolderOpen className="w-12 h-12 text-text-sub mx-auto mb-4" />
                            <p className="text-text-sub">Belum ada proyek</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border-subtle">
                            {projects.map(project => (
                                <div key={project.id} className="flex items-center justify-between px-6 py-4 hover:bg-bg-page/50">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-text-main">{project.name}</span>
                                            <Badge variant={project.is_active ? 'success' : 'neutral'}>
                                                {project.is_active ? 'Aktif' : 'Nonaktif'}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-text-sub mt-1">
                                            AM: {project.account_manager_name || '(Belum ditentukan)'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            icon={Edit2}
                                            onClick={() => handleEdit(project)}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            icon={project.is_active ? Trash2 : Check}
                                            onClick={() => handleToggleActive(project)}
                                        >
                                            {project.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
