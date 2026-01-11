import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCSV, mapToEmployees } from '@/lib/attendance/parser'
import { safeAuditLog } from '@/lib/audit/log'

export interface CommitResponse {
    success: boolean
    batchId?: string
    stats?: {
        total: number
        mapped: number
        unmapped: number
        inserted: number
        skipped: number
        errors: string[]
    }
    error?: string
}

/**
 * POST /api/attendance/import/commit
 * Commit a parsed import batch to attendance_logs
 * Re-fetches and re-parses CSV from storage for security
 */
export async function POST(request: NextRequest): Promise<NextResponse<CommitResponse>> {
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

        // Fetch the batch record
        const { data: batch, error: batchError } = await supabase
            .from('attendance_import_batches')
            .select('*')
            .eq('id', batchId)
            .single()

        if (batchError || !batch) {
            return NextResponse.json({
                success: false,
                error: 'Batch not found or access denied'
            }, { status: 404 })
        }

        // Check if already committed
        if (batch.status === 'committed') {
            return NextResponse.json({
                success: true,
                batchId,
                stats: batch.stats as CommitResponse['stats'],
                error: 'Batch already committed',
            })
        }

        // Download CSV from storage
        let csvContent: string

        if (batch.file_path) {
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('attendance-imports')
                .download(batch.file_path)

            if (downloadError || !fileData) {
                // If file not found, try to use cached stats if available
                console.error('Failed to download CSV:', downloadError)
                return NextResponse.json({
                    success: false,
                    error: 'Failed to download CSV file from storage'
                }, { status: 500 })
            }

            csvContent = await fileData.text()
        } else {
            return NextResponse.json({
                success: false,
                error: 'No file path stored for this batch'
            }, { status: 400 })
        }

        // Re-parse CSV
        const parseResult = parseCSV(csvContent)

        if (parseResult.valid.length === 0) {
            // Update batch as failed
            await supabase
                .from('attendance_import_batches')
                .update({
                    status: 'failed',
                    stats: { ...batch.stats, error: 'No valid rows to commit' }
                })
                .eq('id', batchId)

            return NextResponse.json({
                success: false,
                error: 'No valid rows to commit'
            }, { status: 400 })
        }

        // Get employees with fingerprint_external_id for mapping
        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('id, full_name, fingerprint_external_id')
            .not('fingerprint_external_id', 'is', null)

        if (empError) {
            return NextResponse.json({
                success: false,
                error: 'Failed to fetch employees'
            }, { status: 500 })
        }

        // Build employee map
        const employeeMap = new Map<string, { id: string; name: string | null }>()
        for (const emp of employees || []) {
            if (emp.fingerprint_external_id) {
                employeeMap.set(emp.fingerprint_external_id, {
                    id: emp.id,
                    name: emp.full_name,
                })
            }
        }

        // Map rows to employees
        const mappingResult = mapToEmployees(parseResult.valid, employeeMap)

        if (mappingResult.mapped.length === 0) {
            await supabase
                .from('attendance_import_batches')
                .update({
                    status: 'failed',
                    stats: {
                        total: parseResult.total,
                        valid: parseResult.valid.length,
                        mapped: 0,
                        unmapped: mappingResult.unmapped.length,
                        error: 'No rows could be mapped to employees'
                    }
                })
                .eq('id', batchId)

            return NextResponse.json({
                success: false,
                error: 'No rows could be mapped to employees'
            }, { status: 400 })
        }

        // Prepare rows for insertion
        const logsToInsert = mappingResult.mapped.map((row) => ({
            employee_id: row.employeeId,
            ts: row.timestamp.toISOString(),
            event_type: row.eventType || null,
            source: 'import' as const,
            meta: {
                batch_id: batchId,
                external_id: row.externalId,
                row_number: row.rowNumber,
            },
        }))

        // Insert with ON CONFLICT DO NOTHING (handled via upsert with ignoreDuplicates)
        const { data: insertedData, error: insertError } = await supabase
            .from('attendance_logs')
            .upsert(logsToInsert, {
                onConflict: 'employee_id,ts,source',
                ignoreDuplicates: true,
            })
            .select('id')

        const errors: string[] = []
        if (insertError) {
            errors.push(insertError.message)
            console.error('Insert error:', insertError)
        }

        // Calculate stats
        const inserted = insertedData?.length || 0
        const skipped = logsToInsert.length - inserted

        const stats: CommitResponse['stats'] = {
            total: parseResult.total,
            mapped: mappingResult.mapped.length,
            unmapped: mappingResult.unmapped.length,
            inserted,
            skipped,
            errors,
        }

        // Update batch status
        const newStatus = errors.length > 0 && inserted === 0 ? 'failed' : 'committed'

        await supabase
            .from('attendance_import_batches')
            .update({
                status: newStatus,
                stats,
            })
            .eq('id', batchId)

        // Audit log
        await safeAuditLog(supabase, {
            action: 'attendance_import_committed',
            entity: 'attendance_import_batches',
            entity_id: batchId,
            meta: { inserted, skipped },
        })

        return NextResponse.json({
            success: true,
            batchId,
            stats,
        })

    } catch (error) {
        console.error('Commit error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
