import request, {
  createIdempotencyKey,
  type NotifiedError,
  type RequestConfig,
} from '@/api/request'
import { i18n } from '@/locales'
import { MessagePlugin } from 'tdesign-vue-next'
import { useUserStore } from '@/stores/modules/user'

const commands = new Map<string, { body: string; key: string; pending: boolean }>()
let sessionScope = ''

// 未知结果保留原幂等键，恢复时与用户原来确认的正文绑定。
async function command<T>(
  method: 'post' | 'put' | 'delete',
  url: string,
  data: unknown,
  config?: RequestConfig,
): Promise<T> {
  const id = `${method}:${url}`
  const session = useUserStore().context.session
  const scope = `${session?.user_id ?? ''}:${session?.expires_at ?? ''}`
  if (scope !== sessionScope) {
    commands.clear()
    sessionScope = scope
  }
  const body = JSON.stringify(data ?? {})
  const previous = commands.get(id)
  if (previous && (previous.body !== body || previous.pending)) {
    const error: NotifiedError = new Error(i18n.global.t('models.commandUnknown'))
    MessagePlugin.warning(error.message)
    error.notified = true
    throw error
  }
  const frozen = previous ?? { body, key: createIdempotencyKey(), pending: false }
  frozen.pending = true
  commands.set(id, frozen)
  try {
    const options = { ...config, idempotencyKey: frozen.key }
    const result =
      method === 'delete'
        ? await request.delete<T>(url, { ...options, data: JSON.parse(frozen.body) })
        : await request[method]<T>(url, JSON.parse(frozen.body), options)
    commands.delete(id)
    return result
  } catch (error) {
    const e = error as NotifiedError
    if (
      e.status &&
      e.status < 500 &&
      ![
        'IDEMPOTENCY_IN_PROGRESS',
        'COMMAND_RECEIPT_EXPIRED',
        'IDEMPOTENCY_CONFLICT',
        'OPERATION_BUSY',
      ].includes(e.code ?? '')
    )
      commands.delete(id)
    throw error
  } finally {
    frozen.pending = false
  }
}

export default {
  get: request.get,
  post<T>(url: string, data: unknown, config?: RequestConfig) {
    return command<T>('post', url, data, config)
  },
  put<T>(url: string, data: unknown, config?: RequestConfig) {
    return command<T>('put', url, data, config)
  },
  delete<T>(url: string, config?: RequestConfig) {
    return command<T>('delete', url, config?.data ?? {}, config)
  },
}
