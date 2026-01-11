/**
 * Attendance CSV Parser
 * Parses and validates CSV data for attendance import
 */

export interface ParsedRow {
    rowNumber: number
    externalId: string
    timestamp: Date
    eventType: string | null
    raw: string
}

export interface InvalidRow {
    rowNumber: number
    raw: string
    reason: string
}

export interface ParseResult {
    valid: ParsedRow[]
    invalid: InvalidRow[]
    total: number
}

/**
 * Parse CSV content into structured rows
 * Expected format: external_id,timestamp,event_type (header optional)
 */
export function parseCSV(content: string): ParseResult {
    const lines = content.trim().split(/\r?\n/)
    const valid: ParsedRow[] = []
    const invalid: InvalidRow[] = []

    if (lines.length === 0) {
        return { valid: [], invalid: [], total: 0 }
    }

    // Check if first line is header
    const firstLine = lines[0].toLowerCase()
    const hasHeader = firstLine.includes('external_id') ||
        firstLine.includes('timestamp') ||
        firstLine.includes('event_type')

    const dataLines = hasHeader ? lines.slice(1) : lines
    const total = dataLines.length

    for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i].trim()
        if (!line) continue

        const rowNumber = hasHeader ? i + 2 : i + 1 // 1-indexed, account for header
        const result = parseRow(line, rowNumber)

        if (result.valid) {
            valid.push(result.data as ParsedRow)
        } else {
            invalid.push({
                rowNumber,
                raw: line,
                reason: result.reason || 'Unknown error',
            })
        }
    }

    return { valid, invalid, total }
}

interface RowParseResult {
    valid: boolean
    data?: ParsedRow
    reason?: string
}

function parseRow(line: string, rowNumber: number): RowParseResult {
    // Split by comma (simple CSV, no quoted fields handling for now)
    const parts = line.split(',').map(p => p.trim())

    if (parts.length < 2) {
        return { valid: false, reason: 'Missing required columns (external_id, timestamp)' }
    }

    const externalId = parts[0].trim()
    const timestampStr = parts[1].trim()
    const eventType = parts[2]?.trim().toUpperCase() || null

    // Validate external_id
    if (!externalId) {
        return { valid: false, reason: 'Empty external_id' }
    }

    // Validate timestamp
    if (!timestampStr) {
        return { valid: false, reason: 'Empty timestamp' }
    }

    const timestamp = new Date(timestampStr)
    if (isNaN(timestamp.getTime())) {
        return { valid: false, reason: `Invalid timestamp format: ${timestampStr}` }
    }

    // Validate event_type if provided
    if (eventType && !['IN', 'OUT', 'RAW'].includes(eventType)) {
        return { valid: false, reason: `Invalid event_type: ${eventType} (must be IN, OUT, or RAW)` }
    }

    return {
        valid: true,
        data: {
            rowNumber,
            externalId,
            timestamp,
            eventType,
            raw: line,
        },
    }
}

export interface MappedRow extends ParsedRow {
    employeeId: string
    employeeName: string | null
}

export interface UnmappedRow {
    externalId: string
    count: number
}

export interface MappingResult {
    mapped: MappedRow[]
    unmapped: UnmappedRow[]
}

/**
 * Map external_id to employee_id using fingerprint_external_id
 */
export function mapToEmployees(
    rows: ParsedRow[],
    employeeMap: Map<string, { id: string; name: string | null }>
): MappingResult {
    const mapped: MappedRow[] = []
    const unmappedCount = new Map<string, number>()

    for (const row of rows) {
        const employee = employeeMap.get(row.externalId)

        if (employee) {
            mapped.push({
                ...row,
                employeeId: employee.id,
                employeeName: employee.name,
            })
        } else {
            const count = unmappedCount.get(row.externalId) || 0
            unmappedCount.set(row.externalId, count + 1)
        }
    }

    const unmapped: UnmappedRow[] = Array.from(unmappedCount.entries()).map(
        ([externalId, count]) => ({ externalId, count })
    )

    return { mapped, unmapped }
}
