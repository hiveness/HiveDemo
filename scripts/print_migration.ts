
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

// Load environment variables from the root .env file if available
const envPath = path.resolve(__dirname, '../../.env')
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath })
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function runMigrations() {
    const migrationsDir = path.join(__dirname, '../packages/db/src/migrations')
    if (!fs.existsSync(migrationsDir)) {
        console.error(`Migrations directory not found at ${migrationsDir}`)
        process.exit(1)
    }

    const files = fs.readdirSync(migrationsDir).sort()
    console.log(`Found ${files.length} migration files.`)

    for (const file of files) {
        if (!file.endsWith('.sql')) continue

        console.log(`Running migration: ${file}`)
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')

        const { error } = await supabase.rpc('exec_sql', { sql })

        // If exec_sql is not enabled (security definer issue), we might need another way.
        // But usually standard migrations run via CLI. 
        // IF this fails, we will instruct user to copy paste logic or use Table Editor.
        // HACK: Supabase JS client doesn't support running raw SQL directly unless there is a function.
        // Alternative: Use the postgres connection string if available? No, we only have HTTP keys.

        // ACTUALLY, checking if `hive_artifacts` exists by trying to select from it.
        // If we can't run SQL, we might just assume it works or ask user to run via Dashboard.

        // Let's try to simulate checking if the table exists.
    }

    console.log("NOTE: This script cannot execute raw SQL via supabase-js unless a helper function exists.")
    console.log("Please run the following SQL in your Supabase Dashboard SQL Editor:")
    console.log(fs.readFileSync(path.join(migrationsDir, '007_artifacts.sql'), 'utf8'))
}

runMigrations().catch(console.error)
