import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EmployeeHistoryClient } from './EmployeeHistoryClient'
import { Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

function LoadingFallback() {
    return (
        <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
    )
}

interface Props {
    params: Promise<{ employeeId: string }>
}

export default async function EmployeeApprovalHistoryPage({ params }: Props) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
        redirect('/home')
    }

    const { employeeId } = await params

    // Get employee info
    const { data: employee } = await supabase
        .from('employees')
        .select('id, full_name, division_id')
        .eq('id', employeeId)
        .single()

    if (!employee) {
        redirect('/admin/approval-history')
    }

    // Get division name
    let divisionName = 'No Division'
    if (employee.division_id) {
        const { data: division } = await supabase
            .from('divisions')
            .select('name')
            .eq('id', employee.division_id)
            .single()
        divisionName = division?.name || 'Unknown'
    }

    return (
        <div className="flex flex-col gap-8">
            {/* Back link + Header */}
            <div>
                <Link
                    href="/admin/approval-history"
                    className="inline-flex items-center gap-1 text-sm text-text-sub hover:text-primary mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Kembali ke Riwayat Approval
                </Link>
                <h1 className="text-3xl font-bold text-text-main tracking-tight">{employee.full_name}</h1>
                <p className="text-text-sub mt-1">Riwayat approval - {divisionName}</p>
            </div>

            <Suspense fallback={<LoadingFallback />}>
                <EmployeeHistoryClient employeeId={employeeId} employeeName={employee.full_name || ''} />
            </Suspense>
        </div>
    )
}
