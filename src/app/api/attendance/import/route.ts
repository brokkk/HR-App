import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCSV, mapToEmployees, type MappedRow, type UnmappedRow, type InvalidRow } from '@/lib/attendance/parser'

export interface ImportPreviewResponse {
    success: boolean
    batchId?: string
    preview?: {
        total: number
        validCount: number
        invalidCount: number
        mappedCount: number
        unmappedCount: number
    }
    mappedRows?: MappedRow[]
    unmappedExternalIds?: UnmappedRow[]
    invalidRows?: InvalidRow[]
    error?: string
}

/**
 * POST /api/attendance/import
 * Upload and parse CSV, create batch, return preview
 */
export async function POST(request: NextRequest): Promise<NextResponse<ImportPreviewResponse>> {
    try {
        const supabase = await createClient()

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Parse multipart form data
        const formData = await request.formData()
        const file = formData.get('file') as File | null

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
        }

        if (!file.name.endsWith('.csv')) {
            return NextResponse.json({ success: false, error: 'File must be a CSV' }, { status: 400 })
        }

        // Read file content
        const content = await file.text()
        if (!content.trim()) {
            return NextResponse.json({ success: false, error: 'File is empty' }, { status: 400 })
        }

        // Parse CSV
        const parseResult = parseCSV(content)

        if (parseResult.total === 0) {
            return NextResponse.json({ success: false, error: 'No data rows in CSV' }, { status: 400 })
        }

        // If no valid rows at all, return error without creating batch
        if (parseResult.valid.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No valid rows found in CSV',
                preview: {
                    total: parseResult.total,
                    validCount: 0,
                    invalidCount: parseResult.invalid.length,
                    mappedCount: 0,
                    unmappedCount: 0,
                },
                invalidRows: parseResult.invalid.slice(0, 50), // Limit to first 50
            }, { status: 400 })
        }

        // Get all employees with fingerprint_external_id for mapping
        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('id, full_name, fingerprint_external_id')
            .not('fingerprint_external_id', 'is', null)

        if (empError) {
            console.error('Error fetching employees:', empError)
            return NextResponse.json({ success: false, error: 'Failed to fetch employees' }, { status: 500 })
        }

        // Build employee map: fingerprint_external_id -> { id, name }
        const employeeMap = new Map<string, { id: string; name: string | null }>()
        for (const emp of employees || []) {
            if (emp.fingerprint_external_id) {
                employeeMap.set(emp.fingerprint_external_id, {
                    id: emp.id,
                    name: emp.full_name,
                })
            }
        }

        // Map valid rows to employees
        const mappingResult = mapToEmployees(parseResult.valid, employeeMap)

        // Upload file to storage (try, but gracefully handle if bucket doesn't exist)
        let filePath: string | null = null
        const fileName = `${Date.now()}_${file.name}`

        const { error: uploadError } = await supabase.storage
            .from('attendance-imports')
            .upload(fileName, file, { contentType: 'text/csv' })

        if (uploadError) {
            // Log but don't fail - bucket might not exist
            console.warn('Storage upload failed (bucket may not exist):', uploadError.message)
            // We'll proceed without file storage
        } else {
            filePath = fileName
        }

        // Determine batch status based on results
        const hasAnyMapped = mappingResult.mapped.length > 0
        const status = hasAnyMapped ? 'pending' : 'failed'

        // Create import batch record
        const { data: batch, error: batchError } = await supabase
            .from('attendance_import_batches')
            .insert({
                uploaded_by: user.id,
                file_path: filePath,
                status,
                stats: {
                    total: parseResult.total,
                    valid: parseResult.valid.length,
                    invalid: parseResult.invalid.length,
                    mapped: mappingResult.mapped.length,
                    unmapped: mappingResult.unmapped.length,
                },
            })
            .select('id')
            .single()

        if (batchError) {
            console.error('Error creating batch:', batchError)
            return NextResponse.json({
                success: false,
                error: `Failed to create import batch: ${batchError.message}`
            }, { status: 500 })
        }

        // Return preview response
        return NextResponse.json({
            success: true,
            batchId: batch.id,
            preview: {
                total: parseResult.total,
                validCount: parseResult.valid.length,
                invalidCount: parseResult.invalid.length,
                mappedCount: mappingResult.mapped.length,
                unmappedCount: mappingResult.unmapped.length,
            },
            mappedRows: mappingResult.mapped.slice(0, 100), // Limit preview
            unmappedExternalIds: mappingResult.unmapped,
            invalidRows: parseResult.invalid.slice(0, 50),
        })

    } catch (error) {
        console.error('Import error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
