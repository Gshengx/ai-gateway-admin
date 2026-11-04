/** CSV and first-sheet XLSX reader. XLSX expansion is bounded; formulas are never evaluated. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [],
    cell = '',
    quoted = false
  const input = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = !quoted
    } else if (c === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((v) => v.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += c
    if (rows.length > 1001) throw new Error('fileLimit')
  }
  if (quoted) throw new Error('fileLimit')
  row.push(cell)
  if (row.some((v) => v.trim())) rows.push(row)
  return rows
}
function xml(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('fileLimit')
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('fileLimit')
  return doc
}
async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const view = new DataView(buffer),
    bytes = new Uint8Array(buffer)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  if (end < 0) throw new Error('fileLimit')
  const count = view.getUint16(end + 10, true),
    start = view.getUint32(end + 16, true)
  if (count > 500 || start >= bytes.length) throw new Error('fileLimit')
  const entries = new Map<
    string,
    { method: number; size: number; compressed: number; offset: number }
  >()
  let cursor = start,
    total = 0
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('fileLimit')
    const nameSize = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true)
    const filename = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameSize))
    const entry = {
      method: view.getUint16(cursor + 10, true),
      size: view.getUint32(cursor + 24, true),
      compressed: view.getUint32(cursor + 20, true),
      offset: view.getUint32(cursor + 42, true),
    }
    total += entry.size
    if (
      entry.size > 10 * 1024 * 1024 ||
      total > 20 * 1024 * 1024 ||
      filename.includes('..') ||
      view.getUint16(cursor + 8, true) & 1
    )
      throw new Error('fileLimit')
    entries.set(filename, entry)
    cursor += 46 + nameSize + extra + comment
  }
  async function read(name: string): Promise<string> {
    const entry = entries.get(name)
    if (!entry) return ''
    const at = entry.offset
    if (view.getUint32(at, true) !== 0x04034b50) throw new Error('fileLimit')
    const dataAt = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true)
    if (dataAt + entry.compressed > bytes.length) throw new Error('fileLimit')
    let output: Uint8Array
    const input = bytes.slice(dataAt, dataAt + entry.compressed)
    if (entry.method === 0) output = input
    else if (entry.method === 8) {
      const reader = new Blob([input])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
        .getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.length
        if (size > entry.size || size > 10 * 1024 * 1024) {
          await reader.cancel()
          throw new Error('fileLimit')
        }
        chunks.push(part.value)
      }
      output = new Uint8Array(size)
      let offset = 0
      chunks.forEach((c) => {
        output.set(c, offset)
        offset += c.length
      })
    } else throw new Error('fileLimit')
    if (output.length !== entry.size) throw new Error('fileLimit')
    return new TextDecoder().decode(output)
  }
  const sharedXml = await read('xl/sharedStrings.xml')
  const shared = sharedXml
    ? [...xml(sharedXml).getElementsByTagName('si')].map((si) =>
        [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''),
      )
    : []
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const workbook = await read('xl/workbook.xml'),
    relationships = await read('xl/_rels/workbook.xml.rels')
  if (workbook && relationships) {
    const first = xml(workbook).getElementsByTagName('sheet')[0],
      id = first?.getAttribute('r:id')
    const relation = [...xml(relationships).getElementsByTagName('Relationship')].find(
      (r) => r.getAttribute('Id') === id,
    )
    const target = relation?.getAttribute('Target')
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target
  }
  const content = await read(sheetPath)
  if (!content) throw new Error('fileLimit')
  const rows = [...xml(content).getElementsByTagName('row')]
  if (rows.length > 1001) throw new Error('fileLimit')
  return rows.map((row) => {
    const values: string[] = []
    for (const cell of [...row.getElementsByTagName('c')]) {
      const ref = cell.getAttribute('r') ?? '',
        letters = ref.replace(/[0-9]/g, '')
      let column = 0
      for (const c of letters) column = column * 26 + c.charCodeAt(0) - 64
      if (column < 1 || column > 100) throw new Error('fileLimit')
      const raw = cell.getElementsByTagName('v')[0]?.textContent ?? ''
      values[column - 1] =
        cell.getAttribute('t') === 's'
          ? (shared[Number(raw)] ?? '')
          : cell.getAttribute('t') === 'inlineStr'
            ? [...cell.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('')
            : raw
    }
    return values
  })
}
export async function readRuleFile(file: File): Promise<Record<string, string>[]> {
  if (file.size > 5 * 1024 * 1024 || !file.size) throw new Error('fileLimit')
  const ext = file.name.split('.').pop()?.toLowerCase()
  const rows =
    ext === 'csv'
      ? parseCsv(await file.text())
      : ext === 'xlsx'
        ? await parseXlsx(await file.arrayBuffer())
        : (() => {
            throw new Error('fileLimit')
          })()
  if (rows.length < 2) throw new Error('noRows')
  if (rows.length > 1001) throw new Error('fileLimit')
  const headers = rows[0]!.map((x) => x.trim())
  if (
    !headers.includes('name') ||
    !headers.includes('detection_method') ||
    new Set(headers).size !== headers.length
  )
    throw new Error('INVALID_IMPORT')
  return rows
    .slice(1)
    .map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ''])))
}
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const escape = (value: unknown) => {
    let text = String(value ?? '')
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text
    return '"' + text.replace(/"/g, '""') + '"'
  }
  const blob = new Blob(
    ['\uFEFF' + [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')],
    { type: 'text/csv;charset=utf-8' },
  )
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const ruleHeaders = [
  'name',
  'rule_type',
  'category',
  'sub_category',
  'direction',
  'detection_method',
  'patterns',
  'keywords',
  'entity_type',
  'field_description',
  'threshold',
  'match_threshold',
  'mask_config',
  'sensitivity_level',
  'enabled',
  'description',
]
