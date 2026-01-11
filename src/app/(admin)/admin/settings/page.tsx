import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Clock, Fingerprint, Shield, AlertCircle, Info } from 'lucide-react'

const ADMIN_EMAIL_COUNT = (process.env.ADMIN_EMAILS?.split(',') || []).length

export default function AdminSettingsPage() {
    return (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-text-main tracking-tight">Settings</h1>
                <p className="text-text-sub mt-1">System configuration (read-only)</p>
            </div>

            {/* Work Rules Section */}
            <Card variant="bordered">
                <CardHeader
                    title="Work Rules"
                    subtitle="Attendance and penalty configuration"
                    action={<Badge variant="success">Active</Badge>}
                />
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                        <SettingRow
                            icon={Clock}
                            label="Timezone"
                            value="Asia/Jakarta (WIB)"
                        />
                        <SettingRow
                            icon={Clock}
                            label="Work Start"
                            value="09:00"
                        />
                        <SettingRow
                            icon={Clock}
                            label="Grace Period"
                            value="30 minutes (until 09:30)"
                        />
                        <SettingRow
                            icon={AlertCircle}
                            label="Late Penalty"
                            value="Rp 50.000 if check-in > 09:30"
                            valueClass="text-danger-text"
                        />
                        <SettingRow
                            icon={Clock}
                            label="Outside Attendance Cooldown"
                            value="60 seconds"
                        />
                    </div>
                    <div className="mt-4 p-3 bg-bg-page rounded-lg flex items-start gap-2">
                        <Info className="w-4 h-4 text-text-sub mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-text-sub">
                            These rules are currently hardcoded in attendance compute/RPC.
                            Editable settings will be added in a future update.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Fingerprint Device Section */}
            <Card variant="bordered">
                <CardHeader
                    title="Fingerprint Device"
                    subtitle="Hardware integration"
                    action={<Badge variant="neutral">Coming soon</Badge>}
                />
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                        <SettingRow
                            icon={Fingerprint}
                            label="Device Brand/Model"
                            value="Not configured"
                            valueClass="text-text-sub italic"
                        />
                        <SettingRow
                            icon={Fingerprint}
                            label="Import Format"
                            value="external_id, timestamp, event_type"
                            valueClass="font-mono text-xs"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Admin Access Section */}
            <Card variant="bordered">
                <CardHeader
                    title="Admin Access"
                    subtitle="Authorization settings"
                    action={<Badge variant="info">Info</Badge>}
                />
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                        <SettingRow
                            icon={Shield}
                            label="ADMIN_EMAILS"
                            value={ADMIN_EMAIL_COUNT > 0 ? `Configured (${ADMIN_EMAIL_COUNT} email${ADMIN_EMAIL_COUNT > 1 ? 's' : ''})` : 'Not configured'}
                            valueClass={ADMIN_EMAIL_COUNT > 0 ? 'text-success-text' : 'text-warning-text'}
                        />
                        <SettingRow
                            icon={Shield}
                            label="Role Requirement"
                            value="HR or Owner in employees.role"
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function SettingRow({
    icon: Icon,
    label,
    value,
    valueClass = 'text-text-main',
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string
    valueClass?: string
}) {
    return (
        <div className="flex items-center gap-3 p-3 bg-bg-page rounded-lg">
            <div className="w-8 h-8 bg-bg-surface rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-text-sub" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs text-text-sub">{label}</p>
                <p className={`text-sm font-medium truncate ${valueClass}`}>{value}</p>
            </div>
        </div>
    )
}
