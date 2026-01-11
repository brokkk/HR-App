import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { toWibDate, computeDailyRecord, AttendanceLog, AttendanceSource } from '@/lib/attendance/compute'
import { safeAuditLog } from '@/lib/audit/log'

export interface ComputeResponse {
    success: boolean
    batchId?: string
    stats?: {
        impactedDays: number
        computed: number
        errors: string[]
    }
    error?: string
}

/**
 * POST /api/attendance/compute
 * Compute attendance_daily records for a committed batch
 */
export async function POST(request: NextRequest): Promise<NextResponse<ComputeResponse>> {
    try {
        const supabase = await createClient()

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Parse request body
        const body = await request.json()
        const { batchId } = body as { batchId?: string }

        if (!batchId) {
            return NextResponse.json({ success: false, error: 'Missing batchId' }, { status: 400 })
        }

        // Verify batch exists and is committed
        const { data: batch, error: batchError } = await supabase
            .from('attendance_import_batches')
            .select('id, status')
            .eq('id', batchId)
            .single()

        if (batchError || !batch) {
            return NextResponse.json({
                success: false,
                error: 'Batch not found or access denied'
            }, { status: 404 })
        }

        if (batch.status !== 'committed') {
            return NextResponse.json({
                success: false,
                error: `Batch status is '${batch.status}', must be 'committed' to compute`
            }, { status: 400 })
        }

        // Find all attendance_logs for this batch (now with event_type and source)
        const { data: logs, error: logsError } = await supabase
            .from('attendance_logs')
            .select('id, employee_id, ts, event_type, source')
            .eq('source', 'import')
            .filter('meta->>batch_id', 'eq', batchId)

        if (logsError) {
            console.error('Error fetching logs:', logsError)
            return NextResponse.json({
                success: false,
                error: `Failed to fetch logs: ${logsError.message}`
            }, { status: 500 })
        }

        if (!logs || logs.length === 0) {
            return NextResponse.json({
                success: true,
                batchId,
                stats: { impactedDays: 0, computed: 0, errors: [] },
            })
        }

        // Group logs by (employee_id, date_wib)
        const dayGroups = new Map<string, { employeeId: string; date: string; logs: AttendanceLog[] }>()

        for (const log of logs) {
            const ts = new Date(log.ts)
            const dateWib = toWibDate(ts)
            const key = `${log.employee_id}:${dateWib}`

            if (!dayGroups.has(key)) {
                dayGroups.set(key, {
                    employeeId: log.employee_id,
                    date: dateWib,
                    logs: [],
                })
            }

            dayGroups.get(key)!.logs.push({
                ts,
                event_type: log.event_type as 'IN' | 'OUT',
                source: (log.source || 'import') as AttendanceSource,
            })
        }

        // Compute daily records
        const errors: string[] = []
        let computed = 0

        for (const [, group] of dayGroups) {
            const record = computeDailyRecord(group.employeeId, group.date, group.logs)

            if (!record) continue

            // Upsert to attendance_daily
            const { error: upsertError } = await supabase
                .from('attendance_daily')
                .upsert({
                    employee_id: record.employeeId,
                    date: record.date,
                    check_in: record.checkIn.toISOString(),
                    check_out: record.checkOut?.toISOString() || null,
                    check_in_source: record.checkInSource,
                    check_out_source: record.checkOutSource,
                    late_minutes: record.lateMinutes,
                    is_late: record.isLate,
                    is_penalized: record.isPenalized,
                    penalty_amount: record.penaltyAmount,
                    computed_at: new Date().toISOString(),
                }, {
                    onConflict: 'employee_id,date',
                })

            if (upsertError) {
                console.error('Upsert error:', upsertError)
                errors.push(`${group.employeeId}/${group.date}: ${upsertError.message}`)
            } else {
                computed++
            }
        }

        // Audit log
        await safeAuditLog(supabase, {
            action: 'attendance_daily_computed',
            entity: 'attendance_import_batches',
            entity_id: batchId,
            meta: { impactedDays: dayGroups.size, computed },
        })

        return NextResponse.json({
            success: true,
            batchId,
            stats: {
                impactedDays: dayGroups.size,
                computed,
                errors,
            },
        })

    } catch (error) {
        console.error('Compute error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
