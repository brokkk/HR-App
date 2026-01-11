'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Mail, Building, Calendar, LogOut, Save, Loader2, CheckCircle, Edit2, X, Sun, Moon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/providers/ThemeProvider'

interface ProfileData {
    id: string
    full_name: string | null
    email: string
    role: string
    division_name: string | null
    created_at: string
}

interface Props {
    initialProfile: ProfileData
}

export function ProfileClient({ initialProfile }: Props) {
    const [profile, setProfile] = useState(initialProfile)
    const [editing, setEditing] = useState(false)
    const [fullName, setFullName] = useState(profile.full_name || '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const { theme, toggleTheme } = useTheme()

    const handleSave = async () => {
        const trimmed = fullName.trim()

        if (trimmed.length < 2) {
            setError('Name must be at least 2 characters')
            return
        }
        if (trimmed.length > 80) {
            setError('Name must be less than 80 characters')
            return
        }

        setSaving(true)
        setError(null)
        setSuccess(false)

        try {
            const supabase = createClient()
            const { error: rpcError } = await supabase.rpc('update_my_full_name', {
                p_full_name: trimmed,
            })

            if (rpcError) {
                setError(rpcError.message)
                return
            }

            // Update local state
            setProfile({ ...profile, full_name: trimmed })
            setEditing(false)
            setSuccess(true)
            setTimeout(() => setSuccess(false), 3000)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        setFullName(profile.full_name || '')
        setEditing(false)
        setError(null)
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
    }

    const displayName = profile.full_name || profile.email.split('@')[0]

    return (
        <div className="flex flex-col gap-5 px-5 pt-5 pb-24">
            <h1 className="text-xl font-bold text-text-main mb-6">Profile</h1>

            {/* Success Message */}
            {success && (
                <div className="flex items-center gap-2 p-3 bg-success-bg rounded-xl mb-4">
                    <CheckCircle className="w-4 h-4 text-success-text" />
                    <span className="text-sm text-success-text">Profile updated successfully!</span>
                </div>
            )}

            {/* Profile Card */}
            <Card variant="bordered" className="p-6 mb-6">
                <div className="flex items-center gap-4 mb-6">
                    <Avatar name={displayName} size="lg" />
                    <div className="flex-1">
                        {editing ? (
                            <div className="flex flex-col gap-2">
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Enter your full name"
                                    className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    maxLength={80}
                                    autoFocus
                                />
                                {error && (
                                    <p className="text-xs text-danger-text">{error}</p>
                                )}
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        onClick={handleSave}
                                        disabled={saving}
                                        icon={saving ? Loader2 : Save}
                                    >
                                        {saving ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={handleCancel}
                                        disabled={saving}
                                        icon={X}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <div>
                                    <h2 className="text-lg font-bold text-text-main">{displayName}</h2>
                                    <Badge variant="neutral">{profile.role}</Badge>
                                </div>
                                <button
                                    onClick={() => setEditing(true)}
                                    className="p-2 hover:bg-bg-page rounded-lg transition-colors"
                                    title="Edit name"
                                >
                                    <Edit2 className="w-4 h-4 text-text-sub" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-text-sub" />
                        <div>
                            <p className="text-xs text-text-sub">Email</p>
                            <p className="text-sm font-medium text-text-main">{profile.email}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Building className="w-5 h-5 text-text-sub" />
                        <div>
                            <p className="text-xs text-text-sub">Division</p>
                            <p className="text-sm font-medium text-text-main">{profile.division_name || 'Not assigned'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-text-sub" />
                        <div>
                            <p className="text-xs text-text-sub">Joined</p>
                            <p className="text-sm font-medium text-text-main">{formatDate(profile.created_at)}</p>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Theme Toggle */}
            <Card variant="bordered" className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {theme === 'dark' ? (
                            <Moon className="w-5 h-5 text-text-sub" />
                        ) : (
                            <Sun className="w-5 h-5 text-text-sub" />
                        )}
                        <div>
                            <p className="text-sm font-medium text-text-main">Appearance</p>
                            <p className="text-xs text-text-sub">
                                {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={toggleTheme}
                        className="relative w-12 h-6 bg-border-subtle rounded-full transition-colors hover:bg-primary/20"
                    >
                        <span
                            className={`absolute top-0.5 w-5 h-5 bg-primary rounded-full transition-transform ${theme === 'dark' ? 'left-6' : 'left-0.5'
                                }`}
                        />
                    </button>
                </div>
            </Card>

            {/* Logout Button */}
            <form action="/auth/signout" method="post">
                <Button variant="secondary" className="w-full" icon={LogOut}>
                    Sign Out
                </Button>
            </form>
        </div>
    )
}
