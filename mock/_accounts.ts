import { runtimeState } from './_runtime'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Capability } from '../src/api/modules/auth'

interface MockAccount {
  username: string
  password: string
  role: string
  needs_password: boolean
}

function loadAccounts() {
  // Read on the server only; never import account credentials into client code.
  const config: unknown = JSON.parse(readFileSync(resolve('mock/accounts.json'), 'utf8'))
  function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
  if (!record(config) || !Array.isArray(config.users) || !record(config.roles)) {
    throw new Error('mock/accounts.json: expected users array and roles object')
  }
  const mockRoles = new Map<string, Capability[]>()
  for (const [role, capabilities] of Object.entries(config.roles)) {
    if (
      role === 'super_admin' ||
      !Array.isArray(capabilities) ||
      !capabilities.every(
        (item: unknown) =>
          record(item) &&
          typeof item.resource_code === 'string' &&
          typeof item.can_read === 'boolean' &&
          typeof item.can_write === 'boolean' &&
          (!item.can_write || item.can_read),
      )
    ) {
      throw new Error(`mock/accounts.json: invalid role ${role}`)
    }
    mockRoles.set(role, capabilities)
  }
  const mockAccounts = new Map<string, MockAccount>()
  for (const item of config.users) {
    if (
      !record(item) ||
      typeof item.username !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$/.test(item.username) ||
      typeof item.password !== 'string' ||
      !item.password ||
      (item.role !== undefined && typeof item.role !== 'string') ||
      (item.needs_password !== undefined && typeof item.needs_password !== 'boolean')
    ) {
      throw new Error('mock/accounts.json: invalid account')
    }
    const role = item.role === undefined ? 'super_admin' : String(item.role)
    if (mockAccounts.has(item.username) || (role !== 'super_admin' && !mockRoles.has(role))) {
      throw new Error('mock/accounts.json: duplicate username or unknown role')
    }
    mockAccounts.set(item.username, {
      username: item.username,
      password: item.password,
      role,
      needs_password: item.needs_password === true,
    })
  }
  // Retain support for the existing local launcher/environment credentials.
  if (process.env.AIS_MOCK_USERNAME && process.env.AIS_MOCK_PASSWORD) {
    const username = process.env.AIS_MOCK_USERNAME
    mockAccounts.set(username, {
      username,
      password: process.env.AIS_MOCK_PASSWORD,
      role: mockAccounts.get(username)?.role ?? 'super_admin',
      needs_password: process.env.AIS_MOCK_NEEDS_PASSWORD === 'true',
    })
  }

  return { mockAccounts, mockRoles }
}
export const { mockAccounts, mockRoles } = runtimeState('accounts', loadAccounts)
