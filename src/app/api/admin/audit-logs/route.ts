import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

interface AuditLogItem {
    id: string
    created_at: string
    actor_id: string | null
    actor_name: string | null
    action: string
    entity: string
    entity_id: string | null
    meta: Record<string, unknown>
}

interface AuditLogsResponse {
    success: boolean
    range?: { start: string; end: string }
    page?: number
    pageSize?: number
    total?: number
    items?: AuditLogItem[]
    error?: string
}

/**
 * Get today in WIB
 */
function getTodayWIB(): string {
    const now = new Date()
    const wibOffset = 7 * 60
    const utcOffset = now.getTimezoneOffset()
    const wibTime = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)
    return wibTime.toISOString().split('T')[0]
}

/**
 * Get date N days ago in WIB
 */
function getDaysAgoWIB(days: number): string {
    const now = new Date()
    const wibOffset = 7 * 60
    const utcOffset = now.getTimezoneOffset()
    const wibTime = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)
    wibTime.setDate(wibTime.getDate() - days)
    return wibTime.toISOString().split('T')[0]
}

/**
 * Convert WIB date to UTC timestamp range
 */
function wibDateToUtcRange(date: string, isEnd: boolean): string {
    const [year, month, day] = date.split('-').map(Number)
    if (isEnd) {
        // End of day: 23:59:59 WIB = 16:59:59 UTC
        const utc = new Date(Date.UTC(year, month - 1, day, 16, 59, 59))
        return utc.toISOString()
    } else {
        // Start of day: 00:00:00 WIB = 17:00:00 UTC previous day
        const utc = new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0))
        return utc.toISOString()
    }
}

const VALID_ENTITIES = ['all', 'employees', 'divisions', 'requests', 'overtime_meal_claims', 'attendance_import_batches']

/**
 * GET /api/admin/audit-logs
 * Fetch audit logs with filters and pagination
 */
export async function GET(request: NextRequest): Promise<NextResponse<AuditLogsResponse>> {
    try {
        const supabase = await createClient()

        // Auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Parse query params
        const { searchParams } = new URL(request.url)
        const start = searchParams.get('start') || getDaysAgoWIB(7)
        const end = searchParams.get('end') || getTodayWIB()
        const entity = searchParams.get('entity') || 'all'
        const q = searchParams.get('q')?.trim().toLowerCase() || ''
        const pageParam = parseInt(searchParams.get('page') || '1', 10)
        const pageSizeParam = parseInt(searchParams.get('pageSize') || '50', 10)

        // Validate entity
        if (!VALID_ENTITIES.includes(entity)) {
            return NextResponse.json({ success: false, error: 'Invalid entity' }, { status: 400 })
        }

        // Validate pagination
        const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam)
        const pageSize = Math.min(200, Math.max(1, isNaN(pageSizeParam) ? 50 : pageSizeParam))

        // Build UTC range
        const startUtc = wibDateToUtcRange(start, false)
        const endUtc = wibDateToUtcRange(end, true)

        // Build base count query
        let countQuery = supabase
            .from('audit_logs')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', startUtc)
            .lte('created_at', endUtc)

        if (entity !== 'all') {
            countQuery = countQuery.eq('entity', entity)
        }

        // Apply q filter on action at DB level
        if (q) {
            countQuery = countQuery.ilike('action', `%${q}%`)
        }

        const { count, error: countError } = await countQuery

        if (countError) {
            return NextResponse.json({ success: false, error: countError.message }, { status: 500 })
        }

        const total = count ?? 0

        // If no results, return early
        if (total === 0) {
            return NextResponse.json({
                success: true,
                range: { start, end },
                page,
                pageSize,
                total: 0,
                items: [],
            })
        }

        // Build data query
        let dataQuery = supabase
            .from('audit_logs')
            .select('id, created_at, actor_id, action, entity, entity_id, meta')
            .gte('created_at', startUtc)
            .lte('created_at', endUtc)

        if (entity !== 'all') {
            dataQuery = dataQuery.eq('entity', entity)
        }

        // Apply q filter on action at DB level
        if (q) {
            dataQuery = dataQuery.ilike('action', `%${q}%`)
        }

        // Order and paginate
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        const { data: logs, error: logsError } = await dataQuery
            .order('created_at', { ascending: false })
            .range(from, to)

        if (logsError) {
            return NextResponse.json({ success: false, error: logsError.message }, { status: 500 })
        }

        // Fetch actor names for this page only
        const actorIds = [...new Set((logs || []).map(l => l.actor_id).filter(Boolean))] as string[]
        let actorMap = new Map<string, string>()

        if (actorIds.length > 0) {
            const { data: actors } = await supabase
                .from('employees')
                .select('id, full_name')
                .in('id', actorIds)

            if (actors) {
                actorMap = new Map(actors.map(a => [a.id, a.full_name || 'Unknown']))
            }
        }

        // Map logs with actor names
        const items: AuditLogItem[] = (logs || []).map(log => ({
            id: log.id,
            created_at: log.created_at,
            actor_id: log.actor_id,
            actor_name: log.actor_id ? actorMap.get(log.actor_id) || 'Unknown' : 'System',
            action: log.action,
            entity: log.entity,
            entity_id: log.entity_id,
            meta: log.meta as Record<string, unknown>,
        }))

        return NextResponse.json({
            success: true,
            range: { start, end },
            page,
            pageSize,
            total,
            items,
        })

    } catch (error) {
        console.error('Audit logs error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
