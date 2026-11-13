import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import { createI18n } from 'vue-i18n'

const loadModule = createRequire(import.meta.url)

// Load the actual TypeScript language entry points without adding a test runtime dependency.
loadModule.extensions['.ts'] = (module, filename) => {
  const source = fs
    .readFileSync(filename, 'utf8')
    .replace(/(['"])@\/([^'"]+)\1/g, (_, quote, name) => JSON.stringify(path.resolve('src', name)))
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    filename,
  )
}
const messages = {
  'zh-CN': loadModule(path.resolve('src/locales/zh-CN.ts')).default,
  'en-US': loadModule(path.resolve('src/locales/en-US.ts')).default,
}
const failures = new Set()
const calls = new Set()
const dynamicCalls = new Set()
const get = (root, key) => key.split('.').reduce((value, item) => value?.[item], root)
function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) => {
    const name = prefix ? `${prefix}.${key}` : key
    return item && typeof item === 'object' ? flatten(item, name) : [name]
  })
}
const keys = flatten(messages['zh-CN']).sort()
const englishKeys = flatten(messages['en-US']).sort()
for (const key of new Set([...keys, ...englishKeys])) {
  for (const locale of Object.keys(messages)) {
    if (typeof get(messages[locale], key) !== 'string') failures.add(`${locale}: missing ${key}`)
  }
}
function namedParameters(message) {
  return [...new Set([...message.matchAll(/\{([\w]+)\}/g)].map((match) => match[1]))].sort()
}
for (const key of keys) {
  const zh = get(messages['zh-CN'], key)
  const en = get(messages['en-US'], key)
  if (typeof zh !== 'string' || typeof en !== 'string') continue
  if (JSON.stringify(namedParameters(zh)) !== JSON.stringify(namedParameters(en)))
    failures.add(`Interpolation parameters differ: ${key}`)
}

function literalKeys(node) {
  if (!node) return []
  if (ts.isStringLiteralLike(node)) return [node.text]
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node))
    return literalKeys(node.expression)
  if (ts.isConditionalExpression(node))
    return [...literalKeys(node.whenTrue), ...literalKeys(node.whenFalse)]
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literalKeys(node.left)
    const right = literalKeys(node.right)
    return left.flatMap((prefix) => right.map((suffix) => prefix + suffix))
  }
  return []
}
function checkKey(key, file) {
  calls.add(key)
  for (const locale of Object.keys(messages)) {
    if (typeof get(messages[locale], key) !== 'string') failures.add(`${file}: ${locale} ${key}`)
  }
}

// These contracts feed dynamically constructed translation keys, including states absent in a page.
const enumContracts = [
  ['cost', 'PeriodType', 'cost.'],
  ['cost', 'Dimension', 'cost.'],
  ['cost', 'BudgetStatus', 'cost.', { SHARED: 'cost.sharedBudget' }],
  ['cost', 'BudgetConfig.period_type', 'cost.'],
  ['cost', 'BudgetConfig.budget_mode', 'cost.'],
  ['cost', 'BudgetConfig.over_budget_action', 'cost.'],
  ['cost', 'Adjustment.status', 'cost.'],
  ['projects', 'ProjectStatus', 'projects.'],
  ['projects', 'ProjectRole', 'projects.'],
  ['projects', 'ProjectBudget.status', 'projects.', { DISABLED: 'projects.budgetDisabled' }],
  ['projectBudgets', 'ProjectBudgetPeriod.state', 'budgetPlan.'],
  [
    'projectBudgets',
    'ProjectBudgetHistory.action',
    'cost.history',
    { CONFIGURED: 'cost.historyUPDATED' },
  ],
  ['projectBudgets', 'BudgetApplication.target', 'budgetFlow.'],
  ['projectBudgets', 'BudgetApplication.mode', 'budgetFlow.'],
  ['projectBudgets', 'BudgetWorkOrder.status', 'budgetFlow.'],
  ['projectBudgets', 'BudgetWorkOrder.execution', 'budgetFlow.'],
  ['expenses', 'ExpenseRecord.cost_owner_type', 'expenses.'],
  ['expenses', 'ExpenseRecord.status', 'expenses.'],
  ['expenses', 'ExpenseRecord.usage_source', 'expenses.'],
  ['modelAccess', 'Status', 'ma.'],
  ['modelAccess', 'Health', 'ma.'],
  ['modelAccess', 'Subject', 'ma.'],
  ['modelAccess', 'Check.status', 'ma.'],
  ['modelAccess', 'TestRun.status', 'ma.'],
  ['modelAccess', 'TestRun.trigger_type', 'ma.'],
  ['modelAccess', 'Pricing.pricing_mode', 'ma.'],
  ['modelAccessContract', 'Provider.security_level', 'ma.'],
]
let enumCases = 0
for (const [moduleName, reference, prefix, overrides = {}] of enumContracts) {
  const filename = `src/api/modules/${moduleName}.ts`
  const source = fs.readFileSync(filename, 'utf8')
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true)
  const [name, field] = reference.split('.')
  const declaration = ast.statements.find(
    (node) =>
      (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
      node.name.text === name,
  )
  const type = field
    ? declaration?.members?.find((member) => member.name?.getText(ast) === field)?.type
    : declaration?.type
  if (!type) {
    failures.add(`Enum contract not found: ${filename} ${reference}`)
    continue
  }
  const values = (ts.isUnionTypeNode(type) ? type.types : [type])
    .filter((node) => ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal))
    .map((node) => node.literal.text)
  if (!values.length) failures.add(`No string enum values: ${filename} ${reference}`)
  for (const value of values) {
    enumCases++
    checkKey(overrides[value] || prefix + value, `${filename} ${reference}`)
  }
}
function inspectScript(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ''
      if (name === 't' || name === '$t') {
        const literal = literalKeys(node.arguments[0])
        literal.forEach((key) => checkKey(key, file))
        if (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]))
          dynamicCalls.add(`${file}: ${node.arguments[0]?.getText(ast)}`)
      }
      if (name === 'useI18n' && node.arguments[0]) {
        const options = node.arguments[0]
        if (
          ts.isObjectLiteralExpression(options) &&
          options.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              (property.name.getText(ast) === 'messages' ||
                (property.name.getText(ast) === 'useScope' &&
                  literalKeys(property.initializer).includes('local'))),
          )
        )
          failures.add(`${file}: register messages globally instead of using a partial local scope`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
}
function inspectTemplate(node, file) {
  if (node.type === 5) inspectScript(node.content.content, file)
  for (const property of node.props || []) {
    if (property.type === 7 && property.exp) inspectScript(property.exp.content, file)
  }
  for (const child of node.children || []) inspectTemplate(child, file)
}
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(filename) : [filename]
  })
}
const sources = sourceFiles('src').filter(
  (filename) => /\.(vue|ts)$/.test(filename) && !filename.includes(`${path.sep}locales${path.sep}`),
)
for (const filename of sources) {
  const source = fs.readFileSync(filename, 'utf8')
  if (!filename.endsWith('.vue')) {
    inspectScript(source, filename)
    continue
  }
  const { descriptor } = parse(source, { filename })
  for (const script of [descriptor.script, descriptor.scriptSetup])
    if (script) inspectScript(script.content, filename)
  if (descriptor.template?.ast) inspectTemplate(descriptor.template.ast, filename)
}

// Exercise the same compiler and fallback behavior used in the browser, with warnings enabled.
const originalWarn = console.warn
const originalError = console.error
try {
  console.warn = (...args) => failures.add(args.map(String).join(' '))
  console.error = (...args) => failures.add(args.map(String).join(' '))
  for (const locale of Object.keys(messages)) {
    const i18n = createI18n({ legacy: false, locale, fallbackLocale: locale, messages })
    for (const key of flatten(messages[locale])) {
      const message = get(messages[locale], key)
      if (typeof message !== 'string') continue
      const params = Object.fromEntries(namedParameters(message).map((name) => [name, 100]))
      try {
        i18n.global.t(key, params)
      } catch (error) {
        failures.add(`${locale} ${key}: ${error.message}`)
      }
    }
    i18n.dispose()
  }
} finally {
  console.warn = originalWarn
  console.error = originalError
}
if (failures.size) {
  process.stderr.write([...failures].join('\n') + '\n')
  process.exitCode = 1
} else {
  process.stdout.write(
    `Passed: ${keys.length} paired translation keys, ${calls.size} static/contract keys in ${sources.length} source files, ${enumCases} enum cases, and both language message compilers.\n`,
  )
  process.stdout.write(
    `${dynamicCalls.size} dynamic expressions require browser/data-driven review.\n`,
  )
  if (process.argv.includes('--list-dynamic'))
    process.stdout.write([...dynamicCalls].sort().join('\n') + '\n')
}
