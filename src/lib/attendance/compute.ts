/**
 * Attendance Daily Computation
 * Pure functions for computing daily attendance with WIB timezone
 */

// Work schedule constants (Asia/Jakarta timezone)
export const WORK_START_MINUTES = 9 * 60 // 09:00 = 540 minutes
export const GRACE_END_MINUTES = WORK_START_MINUTES + 30 // 09:30 = 570 minutes
export const PENALTY_AMOUNT = 50000

// Valid source types
export type AttendanceSource = 'fingerprint' | 'outside' | 'manual' | 'import'

/**
 * Convert UTC timestamp to WIB (Asia/Jakarta, UTC+7) date string
 * Returns YYYY-MM-DD format
 */
export function toWibDate(ts: Date | string): string {
    const date = typeof ts === 'string' ? new Date(ts) : ts
    // WIB is UTC+7
    const wibOffset = 7 * 60 // minutes

    // Get the date parts in WIB
    const wibDate = new Date(date.getTime() + wibOffset * 60 * 1000)

    const year = wibDate.getUTCFullYear()
    const month = String(wibDate.getUTCMonth() + 1).padStart(2, '0')
    const day = String(wibDate.getUTCDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
}

/**
 * Get WIB time in minutes from midnight (0-1439)
 */
export function toWibMinutes(ts: Date | string): number {
    const date = typeof ts === 'string' ? new Date(ts) : ts
    const wibOffset = 7 * 60 // minutes

    // Convert to WIB
    const wibDate = new Date(date.getTime() + wibOffset * 60 * 1000)

    return wibDate.getUTCHours() * 60 + wibDate.getUTCMinutes()
}

/**
 * Format minutes to HH:MM string
 */
export function formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export interface PenaltyResult {
    lateMinutes: number
    isLate: boolean
    isPenalized: boolean
    penaltyAmount: number
}

/**
 * Compute late status and penalty based on check-in time
 * 
 * Grace Rule:
 * - If check-in <= 09:30 WIB: NOT late (lateMinutes=0, isLate=false, isPenalized=false)
 * - If check-in > 09:30 WIB: LATE (lateMinutes = checkIn - 540, isLate=true, isPenalized=true)
 * 
 * @param checkInWibMinutes - Check-in time in WIB minutes from midnight
 * @param source - Source of check-in (outside attendance has no penalty)
 */
export function computePenalty(checkInWibMinutes: number, source?: AttendanceSource): PenaltyResult {
    // Grace rule: <= 09:30 is NOT late at all
    const withinGrace = checkInWibMinutes <= GRACE_END_MINUTES

    if (withinGrace) {
        // Within grace period: not late, no penalty
        return { lateMinutes: 0, isLate: false, isPenalized: false, penaltyAmount: 0 }
    }

    // After grace: calculate late minutes from 09:00
    const lateMinutes = checkInWibMinutes - WORK_START_MINUTES
    const isLate = true

    // Outside attendance has no penalty even if late
    if (source === 'outside') {
        return { lateMinutes, isLate, isPenalized: false, penaltyAmount: 0 }
    }

    // Normal: late and penalized
    return { lateMinutes, isLate, isPenalized: true, penaltyAmount: PENALTY_AMOUNT }
}

export interface AttendanceLog {
    ts: Date
    event_type: 'IN' | 'OUT'
    source: AttendanceSource
}

export interface DailyRecord {
    employeeId: string
    date: string // YYYY-MM-DD in WIB
    checkIn: Date
    checkOut: Date | null
    checkInSource: AttendanceSource | null
    checkOutSource: AttendanceSource | null
    lateMinutes: number
    isLate: boolean
    isPenalized: boolean
    penaltyAmount: number
}

/**
 * Compute daily record from a list of attendance logs
 * @param employeeId - Employee UUID
 * @param date - WIB date string (YYYY-MM-DD)
 * @param logs - Array of attendance log entries with ts, event_type, source
 */
export function computeDailyRecord(
    employeeId: string,
    date: string,
    logs: AttendanceLog[]
): DailyRecord | null {
    if (logs.length === 0) return null

    // Find earliest IN log
    const inLogs = logs.filter(l => l.event_type === 'IN').sort((a, b) => a.ts.getTime() - b.ts.getTime())
    const outLogs = logs.filter(l => l.event_type === 'OUT').sort((a, b) => b.ts.getTime() - a.ts.getTime())

    if (inLogs.length === 0) return null

    const checkInLog = inLogs[0]
    const checkOutLog = outLogs.length > 0 ? outLogs[0] : null

    const checkIn = checkInLog.ts
    const checkOut = checkOutLog?.ts || null
    const checkInSource = checkInLog.source
    const checkOutSource = checkOutLog?.source || null

    // Compute penalty based on check-in time in WIB (with source)
    const checkInWibMinutes = toWibMinutes(checkIn)
    const penalty = computePenalty(checkInWibMinutes, checkInSource)

    return {
        employeeId,
        date,
        checkIn,
        checkOut,
        checkInSource,
        checkOutSource,
        ...penalty,
    }
}

/**
 * Legacy function for backward compatibility with timestamp-only calls
 */
export function computeDailyRecordFromTimestamps(
    employeeId: string,
    date: string,
    timestamps: Date[]
): DailyRecord | null {
    if (timestamps.length === 0) return null

    // Sort timestamps
    const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime())

    const checkIn = sorted[0]
    const checkOut = sorted[sorted.length - 1]

    // Compute penalty based on check-in time in WIB (no source = normal penalty rules)
    const checkInWibMinutes = toWibMinutes(checkIn)
    const penalty = computePenalty(checkInWibMinutes)

    return {
        employeeId,
        date,
        checkIn,
        checkOut,
        checkInSource: null,
        checkOutSource: null,
        ...penalty,
    }
}
