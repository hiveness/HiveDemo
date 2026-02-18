
import postgres from 'postgres'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

// Load environment variables from the root .env file if available
const envPath = path.resolve(__dirname, '../.env')
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath })
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
    process.exit(1)
}

// Construct connection string for Supabase (Transaction Pooler port 6543 or Session 5432)
// Since we don't have the password in the env (only service key), we can't connect via TCP usually.
// Wait, Supabase Service Key is NOT a database password. It's for the REST API.
// Unless the user provided a DATABASE_URL, we cannot run raw SQL migrations from here using `postgres` client.

// CHECK: Do we have DATABASE_URL?
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL

async function run() {
    if (!DATABASE_URL) {
        console.error("ERROR: DATABASE_URL is missing. Cannot run migrations directly.")
        console.error("Please use the Supabase Dashboard SQL Editor to run the contents of:")
        console.error("packages/db/src/migrations/*.sql")

        // Alternative: Try to use the REST API to run SQL if a specific function exists (unlikely in new setups)
        process.exit(1)
    }

    const sql = postgres(DATABASE_URL)

    const migrationsDir = path.join(__dirname, '../packages/db/src/migrations')
    const files = fs.readdirSync(migrationsDir).sort()

    console.log(`Found ${files.length} migration files.`)

    for (const file of files) {
        if (!file.endsWith('.sql')) continue
        console.log(`Running migration: ${file}`)
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
        try {
            await sql.unsafe(content)
            console.log(`  -> Success`)
        } catch (err) {
            console.error(`  -> Failed: ${err.message}`)
        }
    }

    await sql.end()
}

run().catch(console.error)
