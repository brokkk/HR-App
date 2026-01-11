'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import {
    Users, Loader2, AlertCircle, Pencil, Check, X,
    UserCheck, UserX, Search, ChevronLeft, ChevronRight, UserPlus, Mail, Send, Trash2
} from 'lucide-react'
import type { EmployeeWithDivision, DivisionOption } from '@/app/api/admin/employees/route'

const ROLES = ['employee', 'lead', 'hr', 'owner'] as const
const roleColors: Record<string, 'neutral' | 'info' | 'warning' | 'success'> = {
    employee: 'neutral',
    lead: 'info',
    hr: 'warning',
    owner: 'success',
}

export function EmployeesClient() {
    const router = useRouter()
    const searchParams = useSearchParams()

    // URL params
    const pageParam = parseInt(searchParams.get('page') || '1', 10)
    const pageSizeParam = parseInt(searchParams.get('pageSize') || '20', 10)
    const qParam = searchParams.get('q') || ''

    const [employees, setEmployees] = useState<EmployeeWithDivision[]>([])
    const [divisions, setDivisions] = useState<DivisionOption[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editData, setEditData] = useState<Partial<EmployeeWithDivision>>({})
    const [saving, setSaving] = useState(false)

    // Invite modal state
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [inviteData, setInviteData] = useState({
        email: '',
        full_name: '',
        role: 'employee',
        division_id: '',
        fingerprint_external_id: '',
    })
    const [inviting, setInviting] = useState(false)
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
    const [resendingId, setResendingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    // Pagination state
    const [page, setPage] = useState(pageParam)
    const [pageSize] = useState(pageSizeParam)
    const [total, setTotal] = useState(0)
    const [searchQuery, setSearchQuery] = useState(qParam)

    const totalPages = Math.ceil(total / pageSize) || 1

    const fetchData = useCallback(async (fetchPage: number, fetchQ: string) => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            params.set('page', String(fetchPage))
            params.set('pageSize', String(pageSize))
            if (fetchQ) params.set('q', fetchQ)

            const res = await fetch(`/api/admin/employees?${params}`)
            const result = await res.json()
            if (result.success) {
                setEmployees(result.items || [])
                setDivisions(result.divisions || [])
                setTotal(result.total || 0)
                setError(null)
            } else {
                setError(result.error || 'Failed to load')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load')
        } finally {
            setLoading(false)
        }
    }, [pageSize])

    // Update URL
    const updateUrl = useCallback((newPage: number, newQ: string) => {
        const params = new URLSearchParams()
        params.set('page', String(newPage))
        if (pageSize !== 20) params.set('pageSize', String(pageSize))
        if (newQ) params.set('q', newQ)
        router.push(`/admin/employees?${params}`)
    }, [router, pageSize])

    // Initial load
    useEffect(() => {
        fetchData(page, qParam)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const handleSearch = () => {
        setPage(1)
        updateUrl(1, searchQuery)
        fetchData(1, searchQuery)
    }

    const handlePrev = () => {
        if (page > 1) {
            const newPage = page - 1
            setPage(newPage)
            updateUrl(newPage, searchQuery)
            fetchData(newPage, searchQuery)
        }
    }

    const handleNext = () => {
        if (page < totalPages) {
            const newPage = page + 1
            setPage(newPage)
            updateUrl(newPage, searchQuery)
            fetchData(newPage, searchQuery)
        }
    }

    const startEdit = (emp: EmployeeWithDivision) => {
        setEditingId(emp.id)
        setEditData({
            full_name: emp.full_name || '',
            role: emp.role,
            division_id: emp.division_id,
            is_active: emp.is_active,
            fingerprint_external_id: emp.fingerprint_external_id || '',
        })
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditData({})
    }

    const saveEdit = async () => {
        if (!editingId) return
        setSaving(true)
        setError(null)

        try {
            const res = await fetch('/api/admin/employees', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingId, ...editData }),
            })
            const result = await res.json()
            if (result.success) {
                cancelEdit()
                fetchData(page, searchQuery) // Refresh current page
            } else {
                setError(result.error || 'Failed to update')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed')
        } finally {
            setSaving(false)
        }
    }

    const toggleActive = async (emp: EmployeeWithDivision) => {
        setError(null)
        try {
            const res = await fetch('/api/admin/employees', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: emp.id, is_active: !emp.is_active }),
            })
            const result = await res.json()
            if (result.success) {
                fetchData(page, searchQuery) // Refresh current page
            } else {
                setError(result.error || 'Failed to toggle')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed')
        }
    }

    const openInviteModal = () => {
        setInviteData({ email: '', full_name: '', role: 'employee', division_id: '', fingerprint_external_id: '' })
        setInviteSuccess(null)
        setShowInviteModal(true)
    }

    const closeInviteModal = () => {
        setShowInviteModal(false)
        setInviteSuccess(null)
    }

    const handleInvite = async () => {
        if (!inviteData.email || !inviteData.full_name) {
            setError('Email dan nama wajib diisi')
            return
        }

        setInviting(true)
        setError(null)

        try {
            const res = await fetch('/api/admin/employees/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: inviteData.email,
                    full_name: inviteData.full_name,
                    role: inviteData.role || 'employee',
                    division_id: inviteData.division_id || null,
                    fingerprint_external_id: inviteData.fingerprint_external_id || null,
                }),
            })
            const result = await res.json()

            if (result.success) {
                setInviteSuccess(`Undangan terkirim ke ${inviteData.email}`)
                fetchData(1, searchQuery) // Refresh list
                setTimeout(() => {
                    closeInviteModal()
                }, 1500)
            } else {
                setError(result.error || 'Gagal mengundang')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal')
        } finally {
            setInviting(false)
        }
    }

    const handleResendInvite = async (employeeId: string) => {
        setResendingId(employeeId)
        setError(null)

        try {
            const res = await fetch('/api/admin/employees/resend-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_id: employeeId }),
            })
            const result = await res.json()

            if (result.success) {
                alert('Email undangan berhasil dikirim ulang!')
            } else {
                setError(result.error || 'Gagal mengirim ulang')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal')
        } finally {
            setResendingId(null)
        }
    }

    const handleDelete = async (emp: EmployeeWithDivision) => {
        const confirmMsg = `Hapus karyawan "${emp.full_name || 'No Name'}"?\n\nPilih OK untuk hapus data saja.\nData login user akan tetap ada.`
        if (!confirm(confirmMsg)) return

        setDeletingId(emp.id)
        setError(null)

        try {
            const res = await fetch(`/api/admin/employees?id=${emp.id}&deleteAuth=true`, {
                method: 'DELETE',
            })
            const result = await res.json()

            if (result.success) {
                fetchData(page, searchQuery)
            } else {
                setError(result.error || 'Gagal menghapus')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal')
        } finally {
            setDeletingId(null)
        }
    }

    // Calculate showing range
    const showingFrom = total > 0 ? (page - 1) * pageSize + 1 : 0
    const showingTo = Math.min(page * pageSize, total)

    return (
        <div className="flex flex-col gap-6">
            {/* Search & Pagination Controls */}
            <Card variant="bordered">
                <CardContent className="py-4">
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-sub" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    placeholder="Search by name..."
                                    className="w-full pl-10 pr-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm placeholder:text-text-sub focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>
                        <Button onClick={handleSearch} icon={Search}>
                            Search
                        </Button>
                        <Button onClick={openInviteModal} icon={UserPlus}>
                            Tambah Karyawan
                        </Button>

                        {/* Pagination */}
                        <div className="flex items-center gap-2 ml-auto">
                            <span className="text-sm text-text-sub">
                                {total > 0 ? `${showingFrom}–${showingTo} of ${total}` : 'No results'}
                            </span>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handlePrev}
                                disabled={page <= 1 || loading}
                                icon={ChevronLeft}
                            >
                                Prev
                            </Button>
                            <span className="text-sm text-text-main font-medium px-2">
                                Page {page} of {totalPages}
                            </span>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleNext}
                                disabled={page >= totalPages || loading}
                                icon={ChevronRight}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

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

            {/* Loading */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            ) : employees.length === 0 ? (
                /* Empty State */
                <Card variant="bordered">
                    <CardContent className="py-12 text-center">
                        <Users className="w-12 h-12 text-text-sub mx-auto mb-4" />
                        <p className="text-text-main font-medium">No employees found</p>
                        {searchQuery && (
                            <p className="text-text-sub text-sm mt-1">Try a different search term</p>
                        )}
                    </CardContent>
                </Card>
            ) : (
                /* Table */
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse bg-bg-surface rounded-xl overflow-hidden shadow-sm">
                        <thead>
                            <tr className="bg-bg-page border-b border-border-subtle">
                                <th className="px-4 py-3 text-left text-sm font-semibold text-text-main">Name</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-text-main">Division</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-text-main">Role</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-text-main">Active</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-text-main">Fingerprint ID</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-text-main">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map((emp) => (
                                <tr key={emp.id} className="border-b border-border-subtle hover:bg-bg-page/50 transition-colors">
                                    {editingId === emp.id ? (
                                        // Edit Mode
                                        <>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    value={editData.full_name || ''}
                                                    onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                                                    className="w-full px-2 py-1 rounded border border-border-subtle bg-bg-surface text-text-main text-sm"
                                                    placeholder="Full name"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={editData.division_id || ''}
                                                    onChange={(e) => setEditData({ ...editData, division_id: e.target.value || null })}
                                                    className="w-full px-2 py-1 rounded border border-border-subtle bg-bg-surface text-text-main text-sm"
                                                >
                                                    <option value="">No Division</option>
                                                    {divisions.map(d => (
                                                        <option key={d.id} value={d.id}>{d.name}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={editData.role || 'employee'}
                                                    onChange={(e) => setEditData({ ...editData, role: e.target.value })}
                                                    className="w-full px-2 py-1 rounded border border-border-subtle bg-bg-surface text-text-main text-sm"
                                                >
                                                    {ROLES.map(r => (
                                                        <option key={r} value={r}>{r}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={editData.is_active ?? true}
                                                    onChange={(e) => setEditData({ ...editData, is_active: e.target.checked })}
                                                    className="w-4 h-4 rounded border-border-subtle"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    value={editData.fingerprint_external_id || ''}
                                                    onChange={(e) => setEditData({ ...editData, fingerprint_external_id: e.target.value })}
                                                    className="w-full px-2 py-1 rounded border border-border-subtle bg-bg-surface text-text-main text-sm"
                                                    placeholder="FP-001"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex justify-end gap-2">
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
                                            </td>
                                        </>
                                    ) : (
                                        // View Mode
                                        <>
                                            <td className="px-4 py-3 text-sm text-text-main font-medium">
                                                {emp.full_name || <span className="text-text-sub italic">No name</span>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-text-sub">
                                                {emp.division_name || <span className="italic">No division</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={roleColors[emp.role] || 'neutral'}>{emp.role}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => toggleActive(emp)}
                                                    className={`p-1 rounded-full transition-colors ${emp.is_active
                                                        ? 'text-success-text hover:bg-success-bg'
                                                        : 'text-danger-text hover:bg-danger-bg'
                                                        }`}
                                                    title={emp.is_active ? 'Active - click to deactivate' : 'Inactive - click to activate'}
                                                >
                                                    {emp.is_active ? (
                                                        <UserCheck className="w-5 h-5" />
                                                    ) : (
                                                        <UserX className="w-5 h-5" />
                                                    )}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-text-sub font-mono">
                                                {emp.fingerprint_external_id || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleResendInvite(emp.id)}
                                                        disabled={resendingId === emp.id}
                                                        icon={resendingId === emp.id ? Loader2 : Send}
                                                        title="Kirim ulang undangan"
                                                    >
                                                        Resend
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => startEdit(emp)} icon={Pencil}>
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleDelete(emp)}
                                                        disabled={deletingId === emp.id}
                                                        icon={deletingId === emp.id ? Loader2 : Trash2}
                                                        className="text-danger-text hover:bg-danger-bg"
                                                        title="Hapus karyawan"
                                                    >
                                                        Delete
                                                    </Button>
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <Card className="w-full max-w-md">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <Mail className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-text-main">Undang Karyawan Baru</h2>
                                    <p className="text-sm text-text-sub">Email undangan akan dikirim</p>
                                </div>
                            </div>

                            {inviteSuccess ? (
                                <div className="p-4 bg-success-bg rounded-xl mb-4 flex items-center gap-2">
                                    <Check className="w-5 h-5 text-success-text" />
                                    <p className="text-success-text">{inviteSuccess}</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    <Input
                                        label="Email"
                                        type="email"
                                        value={inviteData.email}
                                        onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                                        placeholder="nama@perusahaan.com"
                                        required
                                    />
                                    <Input
                                        label="Nama Lengkap"
                                        value={inviteData.full_name}
                                        onChange={(e) => setInviteData({ ...inviteData, full_name: e.target.value })}
                                        placeholder="John Doe"
                                        required
                                    />
                                    <div>
                                        <label className="text-sm font-medium text-text-main mb-2 block">Role</label>
                                        <select
                                            value={inviteData.role}
                                            onChange={(e) => setInviteData({ ...inviteData, role: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm"
                                        >
                                            {ROLES.map(r => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-text-main mb-2 block">Division</label>
                                        <select
                                            value={inviteData.division_id}
                                            onChange={(e) => setInviteData({ ...inviteData, division_id: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm"
                                        >
                                            <option value="">No Division</option>
                                            {divisions.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <Input
                                        label="Fingerprint ID (opsional)"
                                        value={inviteData.fingerprint_external_id}
                                        onChange={(e) => setInviteData({ ...inviteData, fingerprint_external_id: e.target.value })}
                                        placeholder="FP-001"
                                    />
                                </div>
                            )}

                            <div className="flex gap-3 mt-6">
                                <Button
                                    variant="secondary"
                                    onClick={closeInviteModal}
                                    className="flex-1"
                                >
                                    Batal
                                </Button>
                                {!inviteSuccess && (
                                    <Button
                                        onClick={handleInvite}
                                        disabled={inviting || !inviteData.email || !inviteData.full_name}
                                        icon={inviting ? Loader2 : Mail}
                                        className={`flex-1 ${inviting ? 'animate-pulse' : ''}`}
                                    >
                                        {inviting ? 'Mengirim...' : 'Kirim Undangan'}
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
