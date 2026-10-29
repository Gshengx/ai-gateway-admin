/**
 * 与后端约定的统一响应壳与分页结构。
 * 所有接口契约以此为准，Axios 拦截器统一拆壳。
 */

/** 统一响应壳（真实后端契约：code 为字符串，'OK' 表示成功，其余为错误码） */
export interface ApiResult<T = unknown> {
  code: string
  data: T
  params: Record<string, unknown>
  request_id: string
}

/** 页码分页请求参数（page/page_size，二者需同时提供） */
export interface OffsetPageQuery {
  /** 页码，从 1 开始 */
  page: number
  /** 每页条数，默认 20、最大 100 */
  page_size: number
}

/** 页码分页响应数据 */
export interface OffsetPageResult<T> {
  items: T[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

/** 通用选项（下拉/筛选用） */
export interface OptionItem {
  label: string
  value: string | number
}
