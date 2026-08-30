import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { GameLog } from '../types'

interface ChessLabDB extends DBSchema {
  games: {
    key: string
    value: GameLog
    indexes: { 'by-startedAt': string }
  }
}

const DB_NAME = 'chess-lab'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<ChessLabDB>> | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Subscribe to local game writes (save / delete / clear). */
export function subscribeGames(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getDb(): Promise<IDBPDatabase<ChessLabDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ChessLabDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('games', { keyPath: 'id' })
        store.createIndex('by-startedAt', 'startedAt')
      },
    })
  }
  return dbPromise
}

export async function saveGame(log: GameLog): Promise<void> {
  const db = await getDb()
  await db.put('games', log)
  notify()
}

export async function listGames(): Promise<GameLog[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('games', 'by-startedAt')
  return all.reverse()
}

export async function deleteGame(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('games', id)
  notify()
}

export async function clearGames(): Promise<void> {
  const db = await getDb()
  await db.clear('games')
  notify()
}
