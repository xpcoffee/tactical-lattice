// Filesystem storage for components (repo) and builds (userData).
// Components and sprites are saved in the repo under data/ (dev-only authoring).
// Builds are saved per-user in app.getPath('userData').

import { app } from 'electron'
import { join } from 'path'
import { mkdir, copyFile, readdir, readFile, writeFile, rm } from 'fs/promises'

function repoRoot(): string {
  return process.cwd()
}

function repoData(): string {
  return join(repoRoot(), 'data')
}

function userData(): string {
  return app.getPath('userData')
}

export async function ensureUserDirs(): Promise<void> {
  await mkdir(join(repoData(), 'components'), { recursive: true })
  await mkdir(join(repoData(), 'sprites'), { recursive: true })
  await mkdir(join(userData(), 'builds'), { recursive: true })
}

// ─── Sprites ────────────────────────────────────────────────────────

export async function importPng(
  sourcePath: string,
  id: string,
  view: 'front' | 'rear',
): Promise<{ relativePath: string; absolutePath: string }> {
  const filename = `${id}-${view}.png`
  const relativePath = `sprites/${filename}`
  const absolutePath = join(repoData(), relativePath)
  await copyFile(sourcePath, absolutePath)
  return { relativePath, absolutePath }
}

export async function copySprite(
  id: string,
  fromView: 'front' | 'rear',
  toView: 'front' | 'rear',
): Promise<{ relativePath: string } | null> {
  const srcPath = join(repoData(), 'sprites', `${id}-${fromView}.png`)
  const dstFilename = `${id}-${toView}.png`
  const dstPath = join(repoData(), 'sprites', dstFilename)
  await copyFile(srcPath, dstPath).catch(() => null)
  return { relativePath: `sprites/${dstFilename}` }
}

export function resolveSpritePath(relativePath: string): string {
  return `repodata:///${relativePath}`
}

// ─── Component definitions ──────────────────────────────────────────

export async function saveComponentDef(def: unknown): Promise<void> {
  const d = def as { id: string; sprites?: Record<string, { url?: string }> }
  // Convert repodata:// URLs back to relative paths for portability.
  if (d.sprites) {
    for (const view of ['front', 'rear']) {
      const s = d.sprites[view]
      if (s?.url?.startsWith('repodata:///')) {
        s.url = s.url.slice('repodata:///'.length)
      }
    }
  }
  await writeFile(join(repoData(), 'components', `${d.id}.json`), JSON.stringify(def, null, 2))
}

export async function loadComponentDefs(): Promise<unknown[]> {
  const dir = join(repoData(), 'components')
  const files = await readdir(dir).catch(() => [])
  const defs: unknown[] = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const raw = await readFile(join(dir, f), 'utf-8')
    const def = JSON.parse(raw)
    // Resolve relative sprite paths to repodata:// URLs for the renderer.
    if (def.sprites) {
      for (const view of ['front', 'rear']) {
        if (def.sprites[view]?.url && !def.sprites[view].url.startsWith('data:')) {
          def.sprites[view].url = resolveSpritePath(def.sprites[view].url)
        }
      }
    }
    defs.push(def)
  }
  return defs
}

export async function deleteComponentDef(id: string): Promise<void> {
  const jsonPath = join(repoData(), 'components', `${id}.json`)
  await rm(jsonPath, { force: true })
  for (const view of ['front', 'rear']) {
    await rm(join(repoData(), 'sprites', `${id}-${view}.png`), { force: true })
  }
}

// ─── Builds (per-user, in userData) ─────────────────────────────────

export async function saveBuild(build: unknown): Promise<void> {
  const b = build as { id: string }
  await writeFile(join(userData(), 'builds', `${b.id}.json`), JSON.stringify(build, null, 2))
}

export async function loadBuilds(): Promise<unknown[]> {
  const dir = join(userData(), 'builds')
  const files = await readdir(dir).catch(() => [])
  const builds: unknown[] = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const raw = await readFile(join(dir, f), 'utf-8')
    builds.push(JSON.parse(raw))
  }
  return builds
}

export async function deleteBuild(id: string): Promise<void> {
  await rm(join(userData(), 'builds', `${id}.json`), { force: true })
}
