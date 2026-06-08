const KEY = 'storyly_pipeline_v1'

// ---- localStorage (fast local cache) ----

export function loadData() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveData(data) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

// ---- Cloud sync (Vercel KV via API) ----

let saveTimeout = null

export async function loadFromCloud() {
  try {
    const res = await fetch('/api/data')
    const json = await res.json()
    if (json.ok && json.data) return json.data
    return null
  } catch {
    console.warn('Cloud load failed, using localStorage')
    return null
  }
}

export async function saveToCloud(data) {
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    })
    const json = await res.json()
    return json.ok
  } catch {
    console.warn('Cloud save failed, data safe in localStorage')
    return false
  }
}

// Debounced cloud save (2s) — local save happens instantly, cloud save is batched
export function saveToCloudDebounced(data) {
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => saveToCloud(data), 2000)
}

// Flush any pending cloud save immediately (for beforeunload)
export function flushCloudSave(data) {
  clearTimeout(saveTimeout)
  // Use sendBeacon for reliable save on page unload
  try {
    const blob = new Blob([JSON.stringify({ data })], { type: 'application/json' })
    navigator.sendBeacon('/api/data', blob)
  } catch {
    // Fallback: try sync XHR (less reliable but better than nothing)
    saveToCloud(data)
  }
}

// ---- File export/import ----

export function exportToFile(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `storyly-pipeline-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try { resolve(JSON.parse(e.target.result)) }
      catch { reject(new Error('Invalid JSON file')) }
    }
    reader.onerror = reject
    reader.readAsText(file)
  })
}
