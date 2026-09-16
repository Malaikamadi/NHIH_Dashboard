/**
 * Apply db/schema.sql to the local DATABASE_URL.
 * Usage: npx tsx scripts/setup-postgres.ts
 */
import '../server/env'
import { migratePostgres, postgresActive } from '../server/postgres'

async function main() {
  if (!postgresActive()) {
    console.error('Set PERSISTENCE=postgres and DATABASE_URL in .env.local first.')
    process.exit(1)
  }
  await migratePostgres()
  console.log('Schema applied to local PostgreSQL')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
