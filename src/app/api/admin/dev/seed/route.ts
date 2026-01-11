import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []
const ENABLE_DEV_TOOLS = process.env.ENABLE_DEV_TOOLS === 'true'

// Work rules (same as compute.ts)
const WORK_START_HOUR = 9
const WORK_START_MINUTE = 0
const GRACE_MINUTES = 30
const PENALTY_AMOUNT = 50000

/**
 * Generate UUID
 */
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}

/**
 * Get random integer between min and max (inclusive)
 */
function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Random boolean with probability (0-1)
 */
function randomBool(probability: number): boolean {
    return Math.random() < probability
}

/**
 * Pick random item from array
 */
function randomPick<T>(arr: T[]): T {
    return arr[randomInt(0, arr.length - 1)]
}

/**
 * Get last N days as date strings in WIB
 */
function getLastNDays(n: number): string[] {
    const dates: string[] = []
    const now = new Date()
    const wibOffset = 7 * 60
    const utcOffset = now.getTimezoneOffset()
    const wibNow = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)

    for (let i = 0; i < n; i++) {
        const d = new Date(wibNow)
        d.setDate(d.getDate() - i)
        dates.push(d.toISOString().split('T')[0])
    }
    return dates.reverse() // oldest first
}

/**
 * Create timestamp for a date at specific hour:minute in WIB
 */
function createWIBTimestamp(dateStr: string, hour: number, minute: number): string {
    const [year, month, day] = dateStr.split('-').map(Number)
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour - 7, minute, randomInt(0, 59)))
    return utcDate.toISOString()
}

/**
 * Compute late minutes and penalty using GRACE RULE
 */
function computePenalty(checkInMinutes: number): { late_minutes: number; is_late: boolean; is_penalized: boolean; penalty_amount: number } {
    const workStartMinutes = WORK_START_HOUR * 60 + WORK_START_MINUTE
    const graceEndMinutes = workStartMinutes + GRACE_MINUTES

    // Grace rule: <= 09:30 is NOT late
    if (checkInMinutes <= graceEndMinutes) {
        return { late_minutes: 0, is_late: false, is_penalized: false, penalty_amount: 0 }
    }

    // After grace: late
    const late_minutes = checkInMinutes - workStartMinutes
    return { late_minutes, is_late: true, is_penalized: true, penalty_amount: PENALTY_AMOUNT }
}

// Seed configuration
interface SeedConfig {
    checkIn: { minHour: number; minMinute: number; maxHour: number; maxMinute: number }
    checkOut: { minHour: number; minMinute: number; maxHour: number; maxMinute: number }
    presenceRate: number  // 0-1, probability of attendance per day
    requestsPerEmployee: { min: number; max: number }
    approvalMix: boolean  // if true, random status; if false, mostly pending
}

const DEFAULT_CONFIG: SeedConfig = {
    checkIn: { minHour: 8, minMinute: 50, maxHour: 9, maxMinute: 55 },
    checkOut: { minHour: 17, minMinute: 30, maxHour: 19, maxMinute: 15 },
    presenceRate: 1.0,  // 100% attendance
    requestsPerEmployee: { min: 0, max: 1 },
    approvalMix: false,
}

const RANDOM_CONFIG: SeedConfig = {
    checkIn: { minHour: 8, minMinute: 45, maxHour: 10, maxMinute: 15 },
    checkOut: { minHour: 17, minMinute: 0, maxHour: 20, maxMinute: 30 },
    presenceRate: 0.85,  // 80-95% attendance (we'll add variance)
    requestsPerEmployee: { min: 0, max: 3 },
    approvalMix: true,
}

/**
 * Get random check-in time in minutes from config
 */
function getRandomCheckInMinutes(config: SeedConfig): { hour: number; minute: number; minutes: number } {
    const minMinutes = config.checkIn.minHour * 60 + config.checkIn.minMinute
    const maxMinutes = config.checkIn.maxHour * 60 + config.checkIn.maxMinute
    const minutes = randomInt(minMinutes, maxMinutes)
    return {
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
        minutes,
    }
}

/**
 * Get random check-out time from config
 */
function getRandomCheckOut(config: SeedConfig): { hour: number; minute: number } {
    const minMinutes = config.checkOut.minHour * 60 + config.checkOut.minMinute
    const maxMinutes = config.checkOut.maxHour * 60 + config.checkOut.maxMinute
    const minutes = randomInt(minMinutes, maxMinutes)
    return {
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
    }
}

/**
 * POST /api/admin/dev/seed
 * Generate demo data for testing
 * Query params or body: { variant?: 'random' }
 */
export async function POST(request: NextRequest) {
    try {
        // Production guard
        if (process.env.NODE_ENV === 'production' && !ENABLE_DEV_TOOLS) {
            return NextResponse.json({ error: 'Dev tools disabled in production' }, { status: 404 })
        }

        const supabase = await createClient()

        // Auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Determine variant
        const url = new URL(request.url)
        const variantParam = url.searchParams.get('variant')

        let bodyVariant: string | undefined
        try {
            const body = await request.json()
            bodyVariant = body?.variant
        } catch {
            // No body or invalid JSON, ignore
        }

        const variant = variantParam || bodyVariant || 'default'
        const config = variant === 'random' ? RANDOM_CONFIG : DEFAULT_CONFIG

        const seed_id = generateUUID()
        const dates = getLastNDays(14)
        const startDate = dates[0]
        const endDate = dates[dates.length - 1]

        // Get active employees
        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('id, full_name, fingerprint_external_id')
            .eq('is_active', true)
            .limit(20)

        if (empError) {
            return NextResponse.json({ error: empError.message }, { status: 500 })
        }

        if (!employees || employees.length === 0) {
            return NextResponse.json({ error: 'No active employees found' }, { status: 400 })
        }

        let logs_inserted = 0
        let daily_upserted = 0

        // Generate attendance logs and daily records
        for (const emp of employees) {
            // Randomize presence rate per employee (80-95% in random mode)
            const empPresenceRate = variant === 'random'
                ? (80 + randomInt(0, 15)) / 100
                : config.presenceRate

            for (const dateStr of dates) {
                // Skip weekends (Saturday=6, Sunday=0)
                const dayOfWeek = new Date(dateStr).getDay()
                if (dayOfWeek === 0 || dayOfWeek === 6) continue

                // Random presence (skip some days in random mode)
                if (!randomBool(empPresenceRate)) continue

                // Random check-in
                const checkIn = getRandomCheckInMinutes(config)
                const checkInTs = createWIBTimestamp(dateStr, checkIn.hour, checkIn.minute)

                // Random check-out
                const checkOut = getRandomCheckOut(config)
                const checkOutTs = createWIBTimestamp(dateStr, checkOut.hour, checkOut.minute)

                // Insert IN log
                const { error: inErr } = await supabase
                    .from('attendance_logs')
                    .insert({
                        employee_id: emp.id,
                        ts: checkInTs,
                        event_type: 'IN',
                        source: 'import',
                        fingerprint_external_id: emp.fingerprint_external_id || null,
                        meta: { seed_id, kind: 'demo', variant },
                    })

                if (!inErr) logs_inserted++

                // Insert OUT log
                const { error: outErr } = await supabase
                    .from('attendance_logs')
                    .insert({
                        employee_id: emp.id,
                        ts: checkOutTs,
                        event_type: 'OUT',
                        source: 'import',
                        fingerprint_external_id: emp.fingerprint_external_id || null,
                        meta: { seed_id, kind: 'demo', variant },
                    })

                if (!outErr) logs_inserted++

                // Compute penalty using check-in minutes
                const penalty = computePenalty(checkIn.minutes)

                // Upsert attendance_daily
                const { error: dailyErr } = await supabase
                    .from('attendance_daily')
                    .upsert({
                        employee_id: emp.id,
                        date: dateStr,
                        check_in: checkInTs,
                        check_out: checkOutTs,
                        check_in_source: 'import',
                        check_out_source: 'import',
                        ...penalty,
                    }, { onConflict: 'employee_id,date' })

                if (!dailyErr) daily_upserted++
            }
        }

        // Seed requests
        let requests_created = 0
        let approvals_created = 0

        for (const emp of employees) {
            const numRequests = randomInt(config.requestsPerEmployee.min, config.requestsPerEmployee.max)

            for (let i = 0; i < numRequests; i++) {
                const type = randomPick(['leave', 'overtime']) as 'leave' | 'overtime'
                const startDateIdx = randomInt(0, dates.length - 3)
                const reqStartDate = dates[startDateIdx]

                // Determine status
                let status: string
                if (config.approvalMix) {
                    status = randomPick(['pending', 'pending', 'approved', 'rejected'])
                } else {
                    status = 'pending'
                }

                const reqData: Record<string, unknown> = {
                    employee_id: emp.id,
                    type,
                    start_date: reqStartDate,
                    end_date: type === 'leave' ? dates[Math.min(startDateIdx + randomInt(1, 3), dates.length - 1)] : null,
                    reason: type === 'leave'
                        ? randomPick(['Urusan keluarga', 'Sakit', 'Cuti tahunan', 'Acara pribadi'])
                        : randomPick(['Deadline proyek', 'Maintenance server', 'Client meeting', 'Release deployment']),
                    status,
                    meta: { seed_id, kind: 'demo', variant },
                }

                const { data: createdReq, error: reqErr } = await supabase
                    .from('requests')
                    .insert(reqData)
                    .select('id')
                    .single()

                if (!reqErr && createdReq) {
                    requests_created++

                    // Create approval record for approved/rejected
                    if (status === 'approved' || status === 'rejected') {
                        const { error: apprErr } = await supabase
                            .from('request_approvals')
                            .insert({
                                request_id: createdReq.id,
                                actor_id: user.id,
                                action: status,
                                notes: `Demo ${status}`,
                            })

                        if (!apprErr) approvals_created++
                    }
                }
            }
        }

        // Seed meal claims for approved overtime
        let meal_claims_created = 0
        const { data: approvedOvertimes } = await supabase
            .from('requests')
            .select('id, employee_id')
            .eq('type', 'overtime')
            .eq('status', 'approved')
            .contains('meta', { seed_id })
            .limit(5)

        if (approvedOvertimes && approvedOvertimes.length > 0) {
            for (let i = 0; i < approvedOvertimes.length; i++) {
                const req = approvedOvertimes[i]
                const claimStatus = randomPick(['pending', 'pending', 'approved', 'paid'])

                const { error: claimErr } = await supabase
                    .from('overtime_meal_claims')
                    .insert({
                        employee_id: req.employee_id,
                        request_id: req.id,
                        amount: 50000,
                        status: claimStatus,
                        meta: { seed_id, kind: 'demo', variant },
                    })

                if (!claimErr) meal_claims_created++
            }
        }

        return NextResponse.json({
            success: true,
            seed_id,
            variant,
            range: { start: startDate, end: endDate },
            seeded_employee_ids: employees.map(e => e.id),
            created: {
                logs_inserted,
                daily_upserted,
                requests_created,
                approvals_created,
                meal_claims_created,
            },
        })

    } catch (error) {
        console.error('Seed API error:', error)
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
