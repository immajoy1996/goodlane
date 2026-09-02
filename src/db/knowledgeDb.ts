import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url'
import type { CarrierInteraction } from '../types/interactions'

function bindSql(value: SqlValue | undefined): SqlValue {
  if (value === undefined) return null
  if (typeof value === 'number' && Number.isNaN(value)) return null
  return value
}

let db: Database | null = null
let ready = false

export function isKnowledgeDbReady(): boolean {
  return ready
}

export function markKnowledgeDbReady(value: boolean): void {
  ready = value
}

export async function openKnowledgeDatabase(): Promise<Database> {
  if (db) return db

  const SQL = await initSqlJs({ locateFile: () => sqlWasm })
  db = new SQL.Database()
  createTables(db)
  return db
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Knowledge database is not initialized')
  }
  return db
}

function createTables(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS interactions (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT,
      load_id TEXT,
      carrier_name TEXT,
      mc_number TEXT,
      equipment TEXT,
      availability TEXT,
      carrier_rate_usd REAL,
      broker_rate_usd REAL,
      agreed_rate_usd REAL,
      status TEXT,
      timestamp TEXT,
      raw_text TEXT,
      questions_json TEXT,
      warnings_json TEXT,
      load_id_confidence TEXT,
      mc_number_confidence TEXT,
      needs_review INTEGER,
      manually_assigned INTEGER
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS loads (
      load_id TEXT PRIMARY KEY,
      origin TEXT,
      destination TEXT,
      distance_miles REAL,
      equipment_type TEXT,
      weight_lbs REAL,
      pickup_date TEXT,
      pickup_window TEXT,
      delivery_date TEXT,
      offered_rate_usd REAL,
      status TEXT,
      shipper_name TEXT,
      internal_notes TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS carriers (
      mc_number TEXT PRIMARY KEY,
      company_name TEXT,
      primary_contact TEXT,
      email TEXT,
      equipment_types_json TEXT,
      preferred_lanes_json TEXT,
      reliability_score REAL,
      loads_completed_with_goodlane INTEGER,
      avg_response_time_hours REAL,
      insurance_expiry TEXT,
      authority_status TEXT,
      safety_rating TEXT,
      onboarded INTEGER,
      notes TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS rate_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT,
      origin_state TEXT,
      destination_state TEXT,
      equipment_type TEXT,
      avg_rate_per_mile REAL,
      min_rate_per_mile REAL,
      max_rate_per_mile REAL,
      load_volume INTEGER
    )
  `)
}

export function clearKnowledgeTables(database: Database): void {
  database.run('DELETE FROM interactions')
  database.run('DELETE FROM loads')
  database.run('DELETE FROM carriers')
  database.run('DELETE FROM rate_history')
}

export function replaceInteractions(
  database: Database,
  interactions: CarrierInteraction[],
): void {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO interactions (
      id, source, source_id, load_id, carrier_name, mc_number, equipment,
      availability, carrier_rate_usd, broker_rate_usd, agreed_rate_usd,
      status, timestamp, raw_text, questions_json, warnings_json,
      load_id_confidence, mc_number_confidence, needs_review, manually_assigned
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const interaction of interactions) {
    const sourceId = interaction.id.includes(':')
      ? interaction.id.split(':').slice(1).join(':')
      : interaction.id

    stmt.run([
      bindSql(interaction.id),
      bindSql(interaction.source),
      bindSql(sourceId),
      bindSql(interaction.loadId),
      bindSql(interaction.carrierName),
      bindSql(interaction.mcNumber),
      bindSql(interaction.equipment),
      bindSql(interaction.availability),
      bindSql(interaction.carrierRate),
      bindSql(interaction.brokerRate),
      bindSql(interaction.agreedRate),
      null,
      bindSql(interaction.timestamp),
      bindSql(interaction.rawText),
      JSON.stringify(interaction.questions ?? []),
      JSON.stringify(interaction.resolutionWarnings ?? []),
      bindSql(interaction.loadIdConfidence),
      bindSql(interaction.mcNumberConfidence),
      interaction.needsReview ? 1 : 0,
      interaction.manuallyAssigned ? 1 : 0,
    ])
  }

  stmt.free()
}

export function replaceLoads(database: Database, loads: DbLoad[]): void {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO loads (
      load_id, origin, destination, distance_miles, equipment_type, weight_lbs,
      pickup_date, pickup_window, delivery_date, offered_rate_usd, status,
      shipper_name, internal_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const load of loads) {
    stmt.run([
      bindSql(load.loadId),
      bindSql(load.origin),
      bindSql(load.destination),
      bindSql(load.distanceMiles),
      bindSql(load.equipmentType),
      bindSql(load.weightLbs),
      bindSql(load.pickupDate),
      bindSql(load.pickupWindow),
      bindSql(load.deliveryDate),
      bindSql(load.offeredRateUsd),
      bindSql(load.status),
      bindSql(load.shipperName),
      bindSql(load.internalNotes),
    ])
  }

  stmt.free()
}

export function replaceCarriers(database: Database, carriers: DbCarrier[]): void {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO carriers (
      mc_number, company_name, primary_contact, email, equipment_types_json,
      preferred_lanes_json, reliability_score, loads_completed_with_goodlane,
      avg_response_time_hours, insurance_expiry, authority_status, safety_rating,
      onboarded, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const carrier of carriers) {
    stmt.run([
      bindSql(carrier.mcNumber),
      bindSql(carrier.companyName),
      bindSql(carrier.primaryContact),
      bindSql(carrier.email),
      JSON.stringify(carrier.equipmentTypes ?? []),
      JSON.stringify(carrier.preferredLanes ?? []),
      bindSql(carrier.reliabilityScore),
      bindSql(carrier.loadsCompletedWithGoodlane),
      bindSql(carrier.avgResponseTimeHours),
      bindSql(carrier.insuranceExpiry),
      bindSql(carrier.authorityStatus),
      bindSql(carrier.safetyRating),
      carrier.onboarded ? 1 : 0,
      bindSql(carrier.notes),
    ])
  }

  stmt.free()
}

export type DbLoad = {
  loadId: string
  origin: string
  destination: string
  distanceMiles: number
  equipmentType: string
  weightLbs: number
  pickupDate: string
  pickupWindow: string
  deliveryDate: string
  offeredRateUsd: number
  status: string
  shipperName: string
  internalNotes: string
}

export type DbCarrier = {
  mcNumber: string
  companyName: string
  primaryContact: string
  email: string | null
  equipmentTypes: string[]
  preferredLanes: string[]
  reliabilityScore: number
  loadsCompletedWithGoodlane: number
  avgResponseTimeHours: number
  insuranceExpiry: string
  authorityStatus: string
  safetyRating: string
  onboarded: boolean
  notes: string
}

export type RateHistoryRow = {
  weekStart: string
  originState: string
  destinationState: string
  equipmentType: string
  avgRatePerMile: number
  minRatePerMile: number
  maxRatePerMile: number
  loadVolume: number
}

export function replaceRateHistory(database: Database, rows: RateHistoryRow[]): void {
  const stmt = database.prepare(`
    INSERT INTO rate_history (
      week_start, origin_state, destination_state, equipment_type,
      avg_rate_per_mile, min_rate_per_mile, max_rate_per_mile, load_volume
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const row of rows) {
    stmt.run([
      bindSql(row.weekStart),
      bindSql(row.originState),
      bindSql(row.destinationState),
      bindSql(row.equipmentType),
      bindSql(row.avgRatePerMile),
      bindSql(row.minRatePerMile),
      bindSql(row.maxRatePerMile),
      bindSql(row.loadVolume),
    ])
  }

  stmt.free()
}

type InteractionRow = {
  id: string
  source: string
  source_id: string | null
  load_id: string | null
  carrier_name: string | null
  mc_number: string | null
  equipment: string | null
  availability: string | null
  carrier_rate_usd: number | null
  broker_rate_usd: number | null
  agreed_rate_usd: number | null
  status: string | null
  timestamp: string | null
  raw_text: string | null
  questions_json: string | null
  warnings_json: string | null
  load_id_confidence: string | null
  mc_number_confidence: string | null
  needs_review: number | null
  manually_assigned: number | null
}

function rowToInteraction(row: InteractionRow): CarrierInteraction {
  return {
    id: row.id,
    source: row.source as 'email' | 'call',
    loadId: row.load_id,
    carrierName: row.carrier_name,
    mcNumber: row.mc_number,
    availability: row.availability,
    carrierRate: row.carrier_rate_usd,
    brokerRate: row.broker_rate_usd,
    agreedRate: row.agreed_rate_usd,
    equipment: row.equipment,
    questions: row.questions_json ? JSON.parse(row.questions_json) : [],
    timestamp: row.timestamp,
    rawText: row.raw_text ?? '',
    loadIdConfidence: (row.load_id_confidence as CarrierInteraction['loadIdConfidence']) ?? 'low',
    mcNumberConfidence:
      (row.mc_number_confidence as CarrierInteraction['mcNumberConfidence']) ?? 'low',
    needsReview: row.needs_review === 1,
    resolutionWarnings: row.warnings_json ? JSON.parse(row.warnings_json) : [],
    manuallyAssigned: row.manually_assigned === 1,
  }
}

function queryAll<T>(database: Database, sql: string, params: SqlValue[] = []): T[] {
  const stmt = database.prepare(sql)
  stmt.bind(params)
  const rows: T[] = []

  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }

  stmt.free()
  return rows
}

export function selectAllInteractions(database: Database): CarrierInteraction[] {
  const rows = queryAll<InteractionRow>(
    database,
    'SELECT * FROM interactions ORDER BY timestamp, id',
  )
  return rows.map(rowToInteraction)
}

export function updateInteractionRecord(
  database: Database,
  interaction: CarrierInteraction,
): void {
  database.run(
    `
      UPDATE interactions
      SET load_id = ?, mc_number = ?, load_id_confidence = ?, mc_number_confidence = ?,
          needs_review = ?, manually_assigned = ?, warnings_json = ?
      WHERE id = ?
    `,
    [
      interaction.loadId,
      interaction.mcNumber,
      interaction.loadIdConfidence,
      interaction.mcNumberConfidence,
      interaction.needsReview ? 1 : 0,
      interaction.manuallyAssigned ? 1 : 0,
      JSON.stringify(interaction.resolutionWarnings),
      interaction.id,
    ],
  )
}

export function selectInteractionsByLoadId(
  database: Database,
  loadId: string,
): CarrierInteraction[] {
  const rows = queryAll<InteractionRow>(
    database,
    'SELECT * FROM interactions WHERE load_id = ? ORDER BY timestamp, id',
    [loadId],
  )
  return rows.map(rowToInteraction)
}

export function selectLoadById(database: Database, loadId: string): DbLoad | null {
  const rows = queryAll<{
    load_id: string
    origin: string
    destination: string
    distance_miles: number
    equipment_type: string
    weight_lbs: number
    pickup_date: string
    pickup_window: string
    delivery_date: string
    offered_rate_usd: number
    status: string
    shipper_name: string
    internal_notes: string
  }>(database, 'SELECT * FROM loads WHERE load_id = ? LIMIT 1', [loadId])

  const row = rows[0]
  if (!row) return null

  return {
    loadId: row.load_id,
    origin: row.origin,
    destination: row.destination,
    distanceMiles: row.distance_miles,
    equipmentType: row.equipment_type,
    weightLbs: row.weight_lbs,
    pickupDate: row.pickup_date,
    pickupWindow: row.pickup_window,
    deliveryDate: row.delivery_date,
    offeredRateUsd: row.offered_rate_usd,
    status: row.status,
    shipperName: row.shipper_name,
    internalNotes: row.internal_notes,
  }
}

export function selectCarrierByMc(
  database: Database,
  mcNumber: string,
): DbCarrier | null {
  const rows = queryAll<{
    mc_number: string
    company_name: string
    primary_contact: string
    email: string | null
    equipment_types_json: string
    preferred_lanes_json: string
    reliability_score: number
    loads_completed_with_goodlane: number
    avg_response_time_hours: number
    insurance_expiry: string
    authority_status: string
    safety_rating: string
    onboarded: number
    notes: string
  }>(database, 'SELECT * FROM carriers WHERE mc_number = ? LIMIT 1', [mcNumber])

  const row = rows[0]
  if (!row) return null

  return {
    mcNumber: row.mc_number,
    companyName: row.company_name,
    primaryContact: row.primary_contact,
    email: row.email,
    equipmentTypes: JSON.parse(row.equipment_types_json),
    preferredLanes: JSON.parse(row.preferred_lanes_json),
    reliabilityScore: row.reliability_score,
    loadsCompletedWithGoodlane: row.loads_completed_with_goodlane,
    avgResponseTimeHours: row.avg_response_time_hours,
    insuranceExpiry: row.insurance_expiry,
    authorityStatus: row.authority_status,
    safetyRating: row.safety_rating,
    onboarded: row.onboarded === 1,
    notes: row.notes,
  }
}

export function searchCarriers(database: Database, query: string, limit = 5) {
  const queryLower = `%${query.toLowerCase()}%`
  const queryDigits = query.replace(/\D/g, '')

  const rows = queryAll<{
    mc_number: string
    company_name: string
    primary_contact: string
    email: string | null
  }>(
    database,
    `
      SELECT mc_number, company_name, primary_contact, email
      FROM carriers
      WHERE lower(company_name) LIKE ?
         OR lower(primary_contact) LIKE ?
         OR lower(COALESCE(email, '')) LIKE ?
         OR (? != '' AND mc_number = ?)
      LIMIT ?
    `,
    [queryLower, queryLower, queryLower, queryDigits, queryDigits, limit],
  )

  return rows.map((row) => ({
    companyName: row.company_name,
    mcNumber: row.mc_number,
    dotNumber: null,
    contactName: row.primary_contact,
    email: row.email,
  }))
}

export function selectRateHistory(
  database: Database,
  originState: string,
  destinationState: string,
  equipmentType: string,
) {
  return queryAll<{
    week_start: string
    origin_state: string
    destination_state: string
    equipment_type: string
    avg_rate_per_mile: number
    min_rate_per_mile: number
    max_rate_per_mile: number
    load_volume: number
  }>(
    database,
    `
      SELECT *
      FROM rate_history
      WHERE upper(origin_state) = ?
        AND upper(destination_state) = ?
        AND lower(equipment_type) = lower(?)
      ORDER BY week_start DESC
    `,
    [originState.toUpperCase(), destinationState.toUpperCase(), equipmentType],
  )
}

export function getTableCounts(database: Database) {
  const count = (table: string) => {
    const rows = queryAll<{ count: number }>(
      database,
      `SELECT COUNT(*) as count FROM ${table}`,
    )
    return rows[0]?.count ?? 0
  }

  const emailInteractions = queryAll<{ count: number }>(
    database,
    `SELECT COUNT(*) as count FROM interactions WHERE source = 'email'`,
  )[0]?.count ?? 0

  const callInteractions = queryAll<{ count: number }>(
    database,
    `SELECT COUNT(*) as count FROM interactions WHERE source = 'call'`,
  )[0]?.count ?? 0

  const duplicateIds = queryAll<{ count: number }>(
    database,
    `
      SELECT COUNT(*) as count FROM (
        SELECT id FROM interactions GROUP BY id HAVING COUNT(*) > 1
      )
    `,
  )[0]?.count ?? 0

  return {
    interactions: count('interactions'),
    loads: count('loads'),
    carriers: count('carriers'),
    rateHistory: count('rate_history'),
    emailInteractions,
    callInteractions,
    duplicateIds,
  }
}
