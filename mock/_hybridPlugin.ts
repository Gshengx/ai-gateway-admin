import type { Plugin } from 'vite'

/** Development only. Authentication and implemented APIs keep using the real proxy. */
export function localMockPlugin(target: string, enabled: boolean): Plugin {
  return {
    name: 'local-hybrid-mock',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/v1/')) return next()
        try {
          const runtime = await server.ssrLoadModule('/mock/_hybrid.ts')
          if (!(await runtime.handleHybridRequest(req, res, target))) next()
        } catch (error) {
          const malformed =
            error instanceof SyntaxError || (error as Error).message === 'MALFORMED_REQUEST'
          res.statusCode = malformed ? 400 : 503
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              code: malformed ? 'MALFORMED_REQUEST' : 'AUTHENTICATION_BUSY',
              data: null,
              params: {},
              request_id: 'local-mock-unavailable',
            }),
          )
        }
      })
    },
  }
}
