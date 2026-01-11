import { MoreHorizontal } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'

interface Exception {
    id: string
    employeeName: string
    date: string
    issue: string
    issueType: 'late' | 'missing' | 'early'
    status: 'pending' | 'justified' | 'penalized'
}

interface ExceptionsTableProps {
    exceptions: Exception[]
    onViewAll?: () => void
}

const issueStyles = {
    late: 'text-orange-600 bg-orange-50 border-orange-100',
    missing: 'text-red-600 bg-red-50 border-red-100',
    early: 'text-blue-600 bg-blue-50 border-blue-100',
}

const statusVariants: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
    pending: 'neutral',
    justified: 'success',
    penalized: 'danger',
}

export function ExceptionsTable({ exceptions, onViewAll }: ExceptionsTableProps) {
    return (
        <Card variant="bordered" className="flex flex-col">
            <CardHeader
                title="Exceptions"
                subtitle="Attendance anomalies requiring attention"
                action={
                    <button
                        onClick={onViewAll}
                        className="text-sm font-medium text-primary hover:text-primary-dark transition-colors"
                    >
                        View all
                    </button>
                }
            />
            <div className="p-2 overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                        <tr className="text-text-sub border-b border-border-subtle/50">
                            <th className="px-4 py-3 font-medium">Employee</th>
                            <th className="px-4 py-3 font-medium">Date</th>
                            <th className="px-4 py-3 font-medium">Issue</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle/50">
                        {exceptions.map((exception) => (
                            <tr key={exception.id} className="hover:bg-bg-page transition-colors group">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <Avatar name={exception.employeeName} size="sm" />
                                        <span className="font-medium text-text-main">{exception.employeeName}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-text-sub">{exception.date}</td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${issueStyles[exception.issueType]}`}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                        {exception.issue}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <Badge variant={statusVariants[exception.status]}>
                                        {exception.status === 'pending' ? 'Pending Review' :
                                            exception.status === 'justified' ? 'Justified' : 'Penalized'}
                                    </Badge>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button className="text-text-sub hover:text-primary p-1 rounded-full hover:bg-white transition-all">
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    )
}
