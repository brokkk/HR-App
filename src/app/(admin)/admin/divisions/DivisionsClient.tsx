'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
    Building2, Plus, Users, Loader2, AlertCircle,
    Pencil, Check, X, UserCircle
} from 'lucide-react'
import type { DivisionWithLead, EmployeeOption } from '@/app/api/admin/divisions/route'

export function DivisionsClient() {
    const [divisions, setDivisions] = useState<DivisionWithLead[]>([])
    const [employees, setEmployees] = useState<EmployeeOption[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [newName, setNewName] = useState('')
    const [creating, setCreating] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editLead, setEditLead] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/divisions')
            const result = await res.json()
            if (result.success) {
                setDivisions(result.divisions || [])
                setEmployees(result.employees || [])
                setError(null)
            } else {
                setError(result.error || 'Failed to load')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load')
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async () => {
        if (!newName.trim()) return
        setCreating(true)
        setError(null)

        try {
            const res = await fetch('/api/admin/divisions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
            })
            const result = await res.json()
            if (result.success) {
                setNewName('')
                fetchData()
            } else {
                setError(result.error || 'Failed to create')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed')
        } finally {
            setCreating(false)
        }
    }

    const startEdit = (div: DivisionWithLead) => {
        setEditingId(div.id)
        setEditName(div.name)
        setEditLead(div.lead_employee_id)
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditName('')
        setEditLead(null)
    }

    const saveEdit = async () => {
        if (!editingId) return
        setSaving(true)
        setError(null)

        try {
            const res = await fetch('/api/admin/divisions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingId,
                    name: editName.trim(),
                    lead_employee_id: editLead,
                }),
            })
            const result = await res.json()
            if (result.success) {
                cancelEdit()
                fetchData()
            } else {
                setError(result.error || 'Failed to update')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed')
        } finally {
            setSaving(false)
        }
    }

    // Filter employees for lead dropdown (active, ideally lead/employee role)
    const leadOptions = employees.filter(e => e.is_active)

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
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

            {/* Create Form */}
            <Card variant="bordered">
                <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="New division name..."
                            className="flex-1 px-4 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main placeholder:text-text-sub focus:outline-none focus:ring-2 focus:ring-primary/20"
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        />
                        <Button
                            onClick={handleCreate}
                            disabled={creating || !newName.trim()}
                            icon={creating ? Loader2 : Plus}
                            className={creating ? 'animate-pulse' : ''}
                        >
                            Create
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Divisions List */}
            {divisions.length === 0 ? (
                <Card variant="bordered">
                    <CardContent className="py-12 text-center">
                        <Building2 className="w-12 h-12 text-text-sub mx-auto mb-4" />
                        <p className="text-text-main font-medium">No divisions yet</p>
                        <p className="text-sm text-text-sub mt-1">Create your first division above</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {divisions.map((div) => (
                        <Card key={div.id} variant="bordered">
                            <CardContent className="py-4">
                                {editingId === div.id ? (
                                    // Edit Mode
                                    <div className="flex flex-col gap-3">
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                        <div className="flex items-center gap-2">
                                            <UserCircle className="w-4 h-4 text-text-sub" />
                                            <select
                                                value={editLead || ''}
                                                onChange={(e) => setEditLead(e.target.value || null)}
                                                className="flex-1 px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                                            >
                                                <option value="">No lead</option>
                                                {leadOptions.map(emp => (
                                                    <option key={emp.id} value={emp.id}>
                                                        {emp.full_name || emp.id.slice(0, 8)} ({emp.role})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={saveEdit}
                                                disabled={saving}
                                                icon={saving ? Loader2 : Check}
                                            >
                                                Save
                                            </Button>
                                            <Button size="sm" variant="secondary" onClick={cancelEdit} icon={X}>
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    // View Mode
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Building2 className="w-5 h-5 text-primary" />
                                                <h3 className="font-semibold text-text-main">{div.name}</h3>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-text-sub">
                                                <Users className="w-4 h-4" />
                                                {div.lead_name ? (
                                                    <span>Lead: <span className="font-medium text-text-main">{div.lead_name}</span></span>
                                                ) : (
                                                    <Badge variant="neutral">No lead</Badge>
                                                )}
                                            </div>
                                        </div>
                                        <Button size="sm" variant="ghost" onClick={() => startEdit(div)} icon={Pencil}>
                                            Edit
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
