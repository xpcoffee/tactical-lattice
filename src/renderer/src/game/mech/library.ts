// Merged component library: dev components + user-created components from disk.

import type { ComponentDef } from './components'
import { DEV_LIBRARY } from './library.dev'

let cachedLibrary: ComponentDef[] = DEV_LIBRARY

export async function loadLibrary(): Promise<ComponentDef[]> {
  const userDefs = await window.api.loadComponentDefs()
  const userIds = new Set(userDefs.map(d => d.id))
  // Dev components that aren't overridden by user defs, then user defs.
  cachedLibrary = [
    ...DEV_LIBRARY.filter(d => !userIds.has(d.id)),
    ...userDefs,
  ]
  return cachedLibrary
}

export function getLibrary(): ComponentDef[] {
  return cachedLibrary
}
