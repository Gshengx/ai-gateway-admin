# 模型接入 API 接口与字段字典

本文的 V33 协议配置、用户批量增量授权及对应接口小节用于当前联调。标为历史的 V1.4、V1.5 设计保留原有内容，现网字段以 [现行 OpenAPI](../../../contracts/current/openapi.json) 为准。联调步骤见[前端协同指南](07-前端协同对接指南.md)和[多条自定义透传设计](同模型多条自定义透传详细设计.md)。

## V33 协议配置和接口索引

模型写入统一提交有序的 `invocation_apis`，编辑时回传已有行的 `id`，新增行由后端分配 ID。每个标准协议在一个模型内只可保存一行，`path` 是出站路径。模型可保存多条 `CUSTOM_PASSTHROUGH`，首版固定为 POST，每条 `path` 用于网关入站匹配，上游按供应商 `base_url` 的路径前缀追加该路径。模型内的透传路径须唯一，并且不能匹配标准入站路由。

M08 按 `provider_id` 和 `model_id_at_provider` 读取实例支持的候选，选中可信目录型号时加 `catalog_model_version_id`。顶层 `protocol_options[]` 只返回标准协议及默认出站路径。`custom_passthrough_supported` 返回实例模板的配置能力，未指定供应商时为 `null`。M04 的 `invocation_apis[]` 是已保存配置的唯一视图。目录项继续使用 `suggested_invocation_apis` 和 `suggested_custom_invocation_apis` 同序预填。M13/M14 创建前仍用同序重复 GET 参数 `supported_invocation_apis` 与 `upstream_paths`，例如 `supported_invocation_apis=EMBEDDINGS&upstream_paths=%2Fembeddings`。M14 已有模型模式只传 `model_id`。

失败重试通过 `reuse_job_id` 引用同一模型、同一准入代次下的已终结任务。服务端按配置行 ID 和检测类型核对冻结计划、路径和适配内容，只复用完整通过的配置行。仅调整行序更新 `versions.base`，原准入结果保持有效。增删配置行、修改路径或变更实际目标使旧准入失效。C04 查询当前准入代次，无匹配任务时返回 HTTP 200 且 data 为 null。C02/C03 仍可看历史，健康任务从自身快照回显。

每条 `CUSTOM_PASSTHROUGH` 行独立生成一个 `CONNECTIVITY` 项。探针对供应商 base_url 路径前缀追加该行 path 所得地址发送使用供应商认证的无请求体 `HEAD`。收到 `2xx` 或 `405` 且 `Allow` 含 `POST` 时通过。连通性项的 `cost=null`，调用计入 `auxiliary_http_calls`。所有适用项均通过后进入待审核。

| 接口                                                                                | V33 契约和字段                                                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [M03](#api-m03)、[M04](#api-m04)、[M05](#api-m05)、[M07](#api-m07)、[H04](#api-h04) | 模型统一回显已保存的 `invocation_apis`。行包含 `id`、`protocol`、`path` 和只读适配器信息。M03 至少一行。      |
| [D02](#api-d02)                                                                     | 保留行内 `discovery_id` 和混合导入。省略 `invocation_apis` 采用可信建议，显式 `[]` 保存空草稿。               |
| [M08](#api-m08)、[M12](#api-m12)                                                    | M08 返回标准候选和默认路径，另返回透传配置能力。M12 放开 RETIRED 的自身排除。                                 |
| [D03](#api-d03)、[C01](#api-c01)、C02–C04、H01–H05                                  | D03 提交至少一行，C01 使用已保存的配置。按配置行 ID 和检测类型标识检查项。                                    |
| [C05](#api-c05)                                                                     | 对已保存或拟提交的协议预检价格。有计费项时须有适用的已保存价格，无计费项时通过。C01 与 D03 在受理事务内复核。 |
| [D04](#api-d04)、[M07](#api-m07)                                                    | 上架使用当前准入代次的通过记录，并复核适用价格。                                                              |
| [M13](#api-m13)、[M14](#api-m14)、R02/R03                                           | 通过同序路径对或已保存模型解析计量。现有价格历史继续按价格快照展示。                                          |

## 用户批量增量授权与详情计数

用户详情的添加、撤销动作分别通过 [A14](#api-a14)、[A15](#api-a15) 批量修改 1～100 个物理模型的 USER 直授，整批成功或回滚。A04/A11 新增必返的 `authorization_version`，空列表也返回；前端直接使用当前列表版本提交增量，无需先读 A05 全部直授。A05/A06 继续提供完整集合编辑。

`GET /api/v1/users/{user_id}` 的 `data.authorized_model_count` 是同一操作者 A11 的 `total`：用户直授、可见部门继承及可见用户组继承按物理模型去重，包含用户停用、AI 冻结或模型非 ACTIVE 的授权事实。原 `accessible_model_count` 仍对应 A04 `total`，要求用户、AI 访问和模型均 ACTIVE。两数都受当前管理范围约束；无 `model.permissions:READ` 或服务身份不适用时均为 null，正常无模型才为 0。数据库错误不降为零或 null。两字段均必返，不能按来源条数或当前页长度求数量；同一详情快照非空时满足可访问数不大于已授权数。

| 用户详情字段                  | 类型           | 必返/可空 | 统计口径                  |
| ----------------------------- | -------------- | --------- | ------------------------- |
| `data.accessible_model_count` | integer，最小0 | 是/是     | A04 `total`               |
| `data.authorized_model_count` | integer，最小0 | 是/是     | A11 `total`，含不可用模型 |

## 1. 新契约边界与公共约定

所有完整 URI 均从 `/api/v1/model-access` 开始。旧 `/api/v1/providers`、`/api/v1/models` 及身份路径中的旧 model-grants 等模型业务端点全部退役，不提供别名、重定向或双写。此处“v1”是新模块 API 初版，不承诺旧模块兼容。用户/部门/用户组账号主数据仍来自独立身份模块，本文不重建登录或身份 CRUD。

- 认证：使用外部公共会话 Cookie（OpenAPI 的 `ais_session` 仅示意）；所有写操作还要当前 CSRF 和幂等键。每个请求都做当前权限/范围检查。
- 金额、单价和用量统一十进制字符串；`null` 表示未知，不等于 0；日期时间为 RFC3339 UTC，计价时区另有字段。
- 普通对象拒绝未知键；动态模板字段由本版 P01 的 `fields/balance_fields` 明确定义。动态并不意味着接受任意字段。
- 写请求 JSON：省略字段、显式 null、空数组含义不同；以下表列出是否必填/可空/默认，条件规则同样必须执行。请求无需包含响应专有字段。
- 所有新模型写请求的幂等事实写入全新 `ma_command_requests`；不复用旧 `control_command_requests` 的模型命令记录。公共审计由独立审计模块承载。
- 本文 `P01` 等是评审追踪编号，`operationId=modelAccessV14…` 是新机器标识；不继承旧 M1/M2 模型 operationId。

### 1.1 响应封装

| 字段       | 类型           | 必填 | 可空           | 说明                                                                                                                                     |
| ---------- | -------------- | ---- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| code       | string         | 是   | 否             | 成功为 OK；失败为稳定业务错误码，不随语言变化                                                                                            |
| data       | 各接口结果组件 | 是   | 仅指定接口允许 | 完整字段见具体接口；错误时恒为 null；C04/H03 无历史时成功 data=null                                                                      |
| params     | object         | 是   | 否             | 成功通常为 {}；失败按 [ErrorParams](#schema-errorparams) 白名单，M05 另见 [ModelEditErrorParams](#schema-modelediterrorparams)；不含秘密 |
| request_id | string UUID    | 是   | 否             | 本次控制面请求跟踪标识                                                                                                                   |

所有写请求的 202 只代表受理，任务结果须 GET；任务上游失败保存在 data.status/result，不伪装成管理会话 401。成功对象的未必填字段表示有条件省略，不表示可随意缺少必填字段。

### 1.2 通用错误

| HTTP | 错误码                                                                                                                                                                                 | 处理语义                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | MALFORMED_REQUEST                                                                                                                                                                      | 无效 JSON 语法、请求体超过声明字节上限等边界错误；A14/A15 合法 JSON 的未知键、结构和类型问题使用 422                                        |
| 401  | UNAUTHENTICATED                                                                                                                                                                        | 按共享身份登录处理，不自动重放模型检测                                                                                                      |
| 403  | FORBIDDEN / CSRF_INVALID / OUT_OF_SCOPE / RESOURCE_DISABLED / PASSWORD_CHANGE_REQUIRED / TERMS_ACCEPTANCE_REQUIRED                                                                     | 当前会话、权限、范围或共享账号限制                                                                                                          |
| 404  | NOT_FOUND                                                                                                                                                                              | 不存在或不可见，路径子资源必须属于其父对象                                                                                                  |
| 409  | VERSION_CONFLICT / STATE_CONFLICT / IDEMPOTENCY_CONFLICT / IDEMPOTENCY_IN_PROGRESS / CHECK_IN_PROGRESS / OPERATION_BUSY / DISCOVERY_STALE / OPERATION_RESULT_UNKNOWN / CATALOG_CHANGED | 重新读取受影响对象；禁止自动覆盖或换键重试                                                                                                  |
| 409  | PRICE_NOT_CONFIGURED                                                                                                                                                                   | C01 发现有计费项且未配置价格。先保存适用价格再发起准入。D03 用同一业务码逐项拒绝。                                                          |
| 410  | DISCOVERY_EXPIRED                                                                                                                                                                      | 发现快照过期，重新获取或手工录入                                                                                                            |
| 422  | VALIDATION_FAILED 及各接口业务字段错误                                                                                                                                                 | 按 params.fields 定位字段；不向上游补发猜测请求                                                                                             |
| 422  | VALIDATION_FAILED，字段规则 `STANDARD_ROUTE_CONFLICT`                                                                                                                                  | 按 `params.fields` 定位路径字段。用 `params.standard_route` 的 `method`、`path` 提示冲突的标准入口。D02、D03 在各自批量回执的拒绝项中返回。 |
| 422  | CATALOG_INCOMPATIBLE                                                                                                                                                                   | 模板/型号/价格版本关联不匹配，保留草稿并重新选择正确目录来源；不自动混版                                                                    |
| 503  | CATALOG_UNAVAILABLE                                                                                                                                                                    | 目录数据不可用或代码不支持；不回退代码目录，由运维恢复后明确继续                                                                            |
| 500  | INTERNAL_ERROR                                                                                                                                                                         | 保留 request_id；先确认原动作结果，不自动发起第二次探测                                                                                     |

`CUSTOM_PASSTHROUGH` 路径 `/v1/chat/completions` 与固定标准入口冲突。路径 `/v1beta/models/foo:generateContent` 与参数化标准入口冲突，以下是该例的错误参数。M03、M05 和 C05 返回 HTTP 422，M05 字段路径以 `base.` 开头。D02 的 HTTP 200 与 D03 的 HTTP 202 回执在对应 `REJECTED` 项的 `params` 返回相同结构，字段路径相对于该项。

```json
{
  "fields": { "invocation_apis[0].path": "STANDARD_ROUTE_CONFLICT" },
  "standard_route": { "method": "POST", "path": "/v1beta/models/{model}:generateContent" }
}
```

错误体完整组件：[Error](#schema-error)。每个接口均列出完整错误码集合；含 body 的写请求使用 `Content-Type: application/json`，GET/DELETE 无请求体。`Accept: application/json` 可省略。Cookie/CSRF 真实名称在正式开发后与公共认证接口一起校准，不把示意名当上线契约。

### 1.3 页面展示与字段来源规则（本轮修正）

项目实施、调研核对、设计评审与本轮是否实测不属于产品响应。接口只返回实际业务配置、已发布能力、权限、运行结果及必要追溯依据；内置规格不携带项目核对摘要。已发布目录版本和真实检测/型号绑定状态按各自业务语义解释，不与设计审批混用。

2026-11-09用户纠正：供应商P0/P1仅表示项目实施优先级，原型中的供应商优先级为错误。接口不提供该优先级属性，系统不展示、不筛选、不按其排序；实施调研与验收计划仍保留P0/P1分级。

读响应按列表、详情、候选、写入结果和历史快照分别设计。页面必需字段直接返回；不因内部已有key/id就把名称补查责任转给前端。点击某对象打开详情、价格或历史分区时的正常读取仍允许；禁止为了列表每行的模板名/余额/触发人再发一组详情请求。

| 字段类别       | 返回及展示规则                                                                       | 不应采用的做法                                                  |
| -------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 管理员业务名称 | 实例name、模型model_id_at_gateway、人员/部门/组名、时段名按输入原文显示              | 另造可独立修改的model.name；自动翻译业务输入                    |
| 动态目录显示   | 模板名、认证选项、动态字段、指标名/单位标签随相应读取响应返回，按当前用户语言协商    | 只有template_key/metric_key，要求前端另维护动态字典或逐行查目录 |
| 固定产品枚举   | 生命周期、模态、健康状态、渠道等固定值由前端本地化；身份和数值保持原值               | 为每个enum复制一套可写名称或将译文当提交值                      |
| 图标           | 只返回受控icon_key；前端本地映射，未知用通用图标                                     | 接受/加载供应商任意远端图标URL                                  |
| 历史展示       | 价格创建人/指标标签、检测模型/接口/触发人、生命周期actor取对应事件快照               | JOIN当前用户/模板后冒充事件时事实，或依赖被删除的模型/价格表    |
| 空值与范围     | 页面必需键必返；未知用null/[]；不可见已选人只给配置中原已知ID和通用不可用占位        | UUID当显示名称；越界选中ID自动补查资料；unknown当0              |
| 列表与详情     | ProviderListItem、ModelListItem、CheckJobSummary只含该表需要字段；详情接口按点击读取 | 整页为补显示发N次详情；把所有完整配置塞入每个列表行             |

既有M09/M10/M11/A13/B06五项只读接口补齐供应商选项、标签目录、生命周期时间线、已上架模型授权选择器和余额接收人选择器。A14/A15补齐用户详情的批量增量添加与撤销，复用现有身份与模型授权资源。模型选择器不要求供应商管理权限，授权选择器不要求模型详情权限，余额选人不借用模型授权的主体范围。

## 2. 全量接口索引

| 编号            | 方法与全新路径                                                                      | 请求体组件                                               | 成功 data 组件                                                         | HTTP |
| --------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- | ---- |
| [P01](#api-p01) | `GET /api/v1/model-access/provider-templates`                                       | 无                                                       | [TemplateList](#schema-templatelist)                                   | 200  |
| [P02](#api-p02) | `GET /api/v1/model-access/providers`                                                | 无                                                       | [ProviderPage](#schema-providerpage)                                   | 200  |
| [P03](#api-p03) | `POST /api/v1/model-access/providers`                                               | [ProviderCreate](#schema-providercreate)                 | [Provider](#schema-provider)                                           | 201  |
| [P04](#api-p04) | `GET /api/v1/model-access/providers/{provider_id}`                                  | 无                                                       | [Provider](#schema-provider)                                           | 200  |
| [P05](#api-p05) | `PUT /api/v1/model-access/providers/{provider_id}`                                  | [ProviderUpdate](#schema-providerupdate)                 | [Provider](#schema-provider)                                           | 200  |
| [P06](#api-p06) | `DELETE /api/v1/model-access/providers/{provider_id}`                               | 无                                                       | [Deleted](#schema-deleted)                                             | 200  |
| [D01](#api-d01) | `POST /api/v1/model-access/providers/{provider_id}/models/discover`                 | [DiscoveryInput](#schema-discoveryinput)                 | [Discovery](#schema-discovery)                                         | 200  |
| [D02](#api-d02) | `POST /api/v1/model-access/providers/{provider_id}/models/import`                   | [ImportInput](#schema-importinput)                       | [ImportBatchResult](#schema-importbatchresult)                         | 200  |
| [D03](#api-d03) | `POST /api/v1/model-access/providers/{provider_id}/models/admission-tests`          | [ProviderAdmissionInput](#schema-provideradmissioninput) | [BatchResult](#schema-batchresult)                                     | 202  |
| [D04](#api-d04) | `POST /api/v1/model-access/providers/{provider_id}/models/publish`                  | [PublishInput](#schema-publishinput)                     | [BatchResult](#schema-batchresult)                                     | 200  |
| [D05](#api-d05) | `GET /api/v1/model-access/providers/{provider_id}/model-discoveries/{discovery_id}` | 无                                                       | [Discovery](#schema-discovery)                                         | 200  |
| [M01](#api-m01) | `GET /api/v1/model-access/models`                                                   | 无                                                       | [ModelPage](#schema-modelpage)                                         | 200  |
| [M02](#api-m02) | `GET /api/v1/model-access/models/summary`                                           | 无                                                       | [Summary](#schema-summary)                                             | 200  |
| [M03](#api-m03) | `POST /api/v1/model-access/models`                                                  | [ModelCreate](#schema-modelcreate)                       | [Model](#schema-model)                                                 | 201  |
| [M04](#api-m04) | `GET /api/v1/model-access/models/{model_id}`                                        | 无                                                       | [Model](#schema-model)                                                 | 200  |
| [M05](#api-m05) | `PUT /api/v1/model-access/models/{model_id}`                                        | [ModelUpdate](#schema-modelupdate)                       | [Model](#schema-model)                                                 | 200  |
| [M06](#api-m06) | `DELETE /api/v1/model-access/models/{model_id}`                                     | 无                                                       | [Deleted](#schema-deleted)                                             | 200  |
| [M07](#api-m07) | `PUT /api/v1/model-access/models/{model_id}/status`                                 | [StatusCommand](#schema-statuscommand)                   | [Model](#schema-model)                                                 | 200  |
| [M08](#api-m08) | `GET /api/v1/model-access/models/templates`                                         | 无                                                       | [ModelTemplatePage](#schema-modeltemplatepage)                         | 200  |
| [M09](#api-m09) | `GET /api/v1/model-access/model-options/providers`                                  | 无                                                       | [ProviderOptionPage](#schema-provideroptionpage)                       | 200  |
| [M10](#api-m10) | `GET /api/v1/model-access/model-options/tags`                                       | 无                                                       | [TagOptionPage](#schema-tagoptionpage)                                 | 200  |
| [M11](#api-m11) | `GET /api/v1/model-access/models/{model_id}/lifecycle-events`                       | 无                                                       | [LifecycleEventPage](#schema-lifecycleeventpage)                       | 200  |
| [M12](#api-m12) | `GET /api/v1/model-access/model-options/model-id-availability`                      | 无                                                       | [ModelIdAvailability](#schema-modelidavailability)                     | 200  |
| [M13](#api-m13) | `GET /api/v1/model-access/model-options/pricing-preparation`                        | 无                                                       | [PricingPreparation](#schema-pricingpreparation)                       | 200  |
| [M14](#api-m14) | `GET /api/v1/model-access/model-options/default-pricing`                            | 无                                                       | [DefaultPricingPreparation](#schema-defaultpricingpreparation)         | 200  |
| [C01](#api-c01) | `POST /api/v1/model-access/models/{model_id}/admission-tests`                       | [CheckInput](#schema-checkinput)                         | [CheckJob](#schema-checkjob)                                           | 202  |
| [C02](#api-c02) | `GET /api/v1/model-access/models/{model_id}/admission-tests`                        | 无                                                       | [CheckJobPage](#schema-checkjobpage)                                   | 200  |
| [C03](#api-c03) | `GET /api/v1/model-access/models/{model_id}/admission-tests/{test_id}`              | 无                                                       | [CheckJob](#schema-checkjob)                                           | 200  |
| [C04](#api-c04) | `GET /api/v1/model-access/models/{model_id}/admission-tests/latest`                 | 无                                                       | [CheckJob](#schema-checkjob)                                           | 200  |
| [C05](#api-c05) | `POST /api/v1/model-access/models/{model_id}/admission-tests/pricing-check`         | [预检请求](#c05-request)                                 | [预检结果](#c05-response)                                              | 200  |
| [H01](#api-h01) | `POST /api/v1/model-access/models/{model_id}/health-checks`                         | [HealthCheckInput](#schema-healthcheckinput)             | [CheckJob](#schema-checkjob)                                           | 202  |
| [H02](#api-h02) | `GET /api/v1/model-access/models/{model_id}/health-checks`                          | 无                                                       | [CheckJobPage](#schema-checkjobpage)                                   | 200  |
| [H03](#api-h03) | `GET /api/v1/model-access/models/{model_id}/health-checks/latest`                   | 无                                                       | [CheckJob](#schema-checkjob)                                           | 200  |
| [H04](#api-h04) | `PUT /api/v1/model-access/models/{model_id}/health-config`                          | [HealthConfigUpdate](#schema-healthconfigupdate)         | [Model](#schema-model)                                                 | 200  |
| [H05](#api-h05) | `GET /api/v1/model-access/models/{model_id}/health-checks/{test_id}`                | 无                                                       | [CheckJob](#schema-checkjob)                                           | 200  |
| [A01](#api-a01) | `GET /api/v1/model-access/models/{model_id}/permissions`                            | 无                                                       | [GrantPage](#schema-grantpage)                                         | 200  |
| [A02](#api-a02) | `PUT /api/v1/model-access/models/{model_id}/permissions`                            | [GrantDelta](#schema-grantdelta)                         | [GrantResult](#schema-grantresult)                                     | 200  |
| [A03](#api-a03) | `POST /api/v1/model-access/models/permissions/batch`                                | [BatchGrantInput](#schema-batchgrantinput)               | [BatchGrantResult](#schema-batchgrantresult)                           | 200  |
| [A04](#api-a04) | `GET /api/v1/model-access/users/{user_id}/accessible-models`                        | 无                                                       | [AccessibleModelPage](#schema-accessiblemodelpage)                     | 200  |
| [A05](#api-a05) | `GET /api/v1/model-access/users/{user_id}/model-grants`                             | 无                                                       | [SubjectGrantPage](#schema-subjectgrantpage)                           | 200  |
| [A06](#api-a06) | `PUT /api/v1/model-access/users/{user_id}/model-grants`                             | [SubjectGrantReplace](#schema-subjectgrantreplace)       | [SubjectGrantResult](#schema-subjectgrantresult)                       | 200  |
| [A07](#api-a07) | `GET /api/v1/model-access/departments/{department_id}/model-grants`                 | 无                                                       | [SubjectGrantPage](#schema-subjectgrantpage)                           | 200  |
| [A08](#api-a08) | `PUT /api/v1/model-access/departments/{department_id}/model-grants`                 | [SubjectGrantReplace](#schema-subjectgrantreplace)       | [SubjectGrantResult](#schema-subjectgrantresult)                       | 200  |
| [A09](#api-a09) | `GET /api/v1/model-access/groups/{group_id}/model-grants`                           | 无                                                       | [SubjectGrantPage](#schema-subjectgrantpage)                           | 200  |
| [A10](#api-a10) | `PUT /api/v1/model-access/groups/{group_id}/model-grants`                           | [SubjectGrantReplace](#schema-subjectgrantreplace)       | [SubjectGrantResult](#schema-subjectgrantresult)                       | 200  |
| [A11](#api-a11) | `GET /api/v1/model-access/users/{user_id}/model-grant-sources`                      | 无                                                       | [AccessibleModelPage](#schema-accessiblemodelpage)                     | 200  |
| [A12](#api-a12) | `GET /api/v1/model-access/model-permission-subjects`                                | 无                                                       | [SubjectViewPage](#schema-subjectviewpage)                             | 200  |
| [A13](#api-a13) | `GET /api/v1/model-access/model-permission-models`                                  | 无                                                       | [ModelAuthorizationSummaryPage](#schema-modelauthorizationsummarypage) | 200  |
| [A14](#api-a14) | `POST /api/v1/model-access/users/{user_id}/model-grants/add`                        | [UserGrantDelta](#schema-usergrantdelta)                 | [UserGrantDeltaResult](#schema-usergrantdeltaresult)                   | 200  |
| [A15](#api-a15) | `POST /api/v1/model-access/users/{user_id}/model-grants/remove`                     | [UserGrantDelta](#schema-usergrantdelta)                 | [UserGrantDeltaResult](#schema-usergrantdeltaresult)                   | 200  |
| [R01](#api-r01) | `GET /api/v1/model-access/models/{model_id}/pricing`                                | 无                                                       | [PricingVersionPage](#schema-pricingversionpage)                       | 200  |
| [R02](#api-r02) | `POST /api/v1/model-access/models/{model_id}/pricing`                               | [PricingInput](#schema-pricinginput)                     | [PricingVersion](#schema-pricingversion)                               | 201  |
| [R03](#api-r03) | `GET /api/v1/model-access/models/{model_id}/pricing/current`                        | 无                                                       | [CurrentPricing](#schema-currentpricing)                               | 200  |
| [B01](#api-b01) | `GET /api/v1/model-access/providers/{provider_id}/balance-config`                   | 无                                                       | [BalanceConfig](#schema-balanceconfig)                                 | 200  |
| [B02](#api-b02) | `PUT /api/v1/model-access/providers/{provider_id}/balance-config`                   | [BalanceConfigUpdate](#schema-balanceconfigupdate)       | [BalanceConfig](#schema-balanceconfig)                                 | 200  |
| [B03](#api-b03) | `POST /api/v1/model-access/providers/{provider_id}/balance-query`                   | `{}`                                                     | [BalanceQueryReceipt](#schema-balancequeryreceipt)                     | 202  |
| [B04](#api-b04) | `GET /api/v1/model-access/providers/{provider_id}/balance`                          | 无                                                       | [BalanceState](#schema-balancestate)                                   | 200  |
| [B05](#api-b05) | `GET /api/v1/model-access/providers/{provider_id}/balance-queries/{run_id}`         | 无                                                       | [BalanceRun](#schema-balancerun)                                       | 200  |
| [B06](#api-b06) | `GET /api/v1/model-access/balance-recipient-options`                                | 无                                                       | [BalanceRecipientOptionPage](#schema-balancerecipientoptionpage)       | 200  |

## 3. 逐接口规范

<a id="api-p01"></a>

### P01 只读供应商动态模板

`GET /api/v1/model-access/provider-templates`；operationId：`modelAccessV14P01`。

权限：`model.providers:READ`。

业务、并发与事务规则：只读数据库已发布模板；默认当前批次，可按catalog_release_id固定读取；provider_id模式仅返回该实例绑定模板及原字段/认证规格，显式批次必须匹配。enabled仅指新采用资格，不能据旧版非current禁止普通编辑。运行数据无代码/配置目录兜底；不返回实施排序、研究台账或项目审批状态。 字段label、description、auth_modes/options.label均按Accept-Language（省略按会话语言）从实例固定版本语言集投影；至少zh-CN/en，缺译按版本fallback_locale回退。key/value/认证协议和实际凭据不翻译，语言变化不改变模板版本或输入值。

| 位置   | 参数                 | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                                           |
| ------ | -------------------- | ------ | ---- | ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| query  | `provider_id`        | string | 否   | 否   | format="uuid"                          | 可见供应商实例UUID；提供时只读取该实例固定模板旧版本，不能用当前模板重画编辑表单                                   |
| query  | `catalog_release_id` | string | 否   | 否   | format="uuid"                          | 固定目录批次UUID；无provider_id时省略取当前批次，有provider_id时如提供必须等于该实例固定批次。历史读取不授权新绑定 |
| header | `Accept-Language`    | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                                                 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [TemplateList](#schema-templatelist)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[Template](#schema-template)。

<a id="api-p02"></a>

### P02 供应商列表

`GET /api/v1/model-access/providers`；operationId：`modelAccessV14P02`。

权限：`model.providers:READ`。

业务、并发与事务规则：；列表直接返回模板名/图标和本地余额摘要，不依赖P01名称拼接或逐行B04；model_count仅可见数量。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                                                                                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                                                                                      |
| query  | `q`               | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 可选搜索关键字；供应商按名称/API地址/备注，模型按两类模型ID/说明，授权主体按显示名。去首尾空白；空字符串等同未传。 |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                                                 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [ProviderPage](#schema-providerpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[ProviderListItem](#schema-providerlistitem)。

<a id="api-p03"></a>

### P03 创建供应商

`POST /api/v1/model-access/providers`；operationId：`modelAccessV14P03`。

权限：`model.providers:WRITE`。

业务、并发与事务规则：template_key和template_version_id必填且一致；新绑定必须为当前发布批次允许采用的准确模板，否则CATALOG_CHANGED/INCOMPATIBLE。首次受理固化目录上下文；配置/秘密/可选余额同事务，不静默推理；EMAIL接收资格按原规则，本版不投递。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [ProviderCreate](#schema-providercreate)。

成功：HTTP **201**，封装字段见 §1.1；`data` 完整字段见 [Provider](#schema-provider)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`NAME_CONFLICT`、`TEMPLATE_UNAVAILABLE`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[BalanceConfigInput](#schema-balanceconfiginput), [ProviderBalanceSummary](#schema-providerbalancesummary), [ProviderPublicConfig](#schema-providerpublicconfig), [SecretInput](#schema-secretinput)。

<a id="api-p04"></a>

### P04 供应商详情

`GET /api/v1/model-access/providers/{provider_id}`；operationId：`modelAccessV14P04`。

权限：`model.providers:READ`。

业务、并发与事务规则：关联模型通过M01 provider_id分页读取；不回显秘密；模板名及余额摘要自足；关联模型分页可用M01，不为列表每行追加M01。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Provider](#schema-provider)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[ProviderBalanceSummary](#schema-providerbalancesummary), [ProviderPublicConfig](#schema-providerpublicconfig)。

<a id="api-p05"></a>

### P05 编辑供应商

`PUT /api/v1/model-access/providers/{provider_id}`；operationId：`modelAccessV14P05`。

权限：`model.providers:WRITE`。

业务、并发与事务规则：expected_version必填；模板key及版本创建后固定。P05不接受template_key/template_version_id，按实例固定模板校验公开配置、秘密与余额；目录新版不改变原绑定，版本/CSRF/幂等与省略语义保持。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                                                           |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [ProviderUpdate](#schema-providerupdate)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Provider](#schema-provider)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`VERSION_CONFLICT`、`NAME_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[BalanceConfigInput](#schema-balanceconfiginput), [ProviderBalanceSummary](#schema-providerbalancesummary), [ProviderPublicConfig](#schema-providerpublicconfig), [SecretInput](#schema-secretinput)。

<a id="api-p06"></a>

### P06 删除供应商及关联运行对象

`DELETE /api/v1/model-access/providers/{provider_id}`；operationId：`modelAccessV14P06`。

权限：`model.providers:WRITE,model.models:WRITE`。

业务、并发与事务规则：全部模型先满足DRAFT/RETIRED且无在途检测；整体删除，费用审计独立保留；不能以可见model_count代替完整依赖判断；存在无法授权删除的关联对象时整体阻断，安全错误不泄露范围外数量/身份。

| 位置   | 参数               | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ------------------ | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `provider_id`      | string  | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                                                           |
| query  | `expected_version` | integer | 是   | 否   | minimum=1                              | 删除供应商时必传当前 P04.version。                                                           |
| header | `Accept-Language`  | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key`  | string  | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`     | string  | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Deleted](#schema-deleted)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`STATE_CONFLICT`、`CHECK_IN_PROGRESS`、`VERSION_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：无。

<a id="api-d01"></a>

### D01 获取或继续模型发现

`POST /api/v1/model-access/providers/{provider_id}/models/discover`；operationId：`modelAccessV14D01`。

权限：`model.providers:WRITE`。

业务、并发与事务规则：首次{}固定provider_version/template_version_id/catalog_release_id，目录元信息只取同批；续页仅继续该快照，供应商改变为DISCOVERY_STALE，单纯目录发布不改变快照。不发推理。上游失败仍200带FAILED/原因/手工入口，管理鉴权和输入错误用4xx；返回已加载第一页，其余D05分页。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                                                           |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [DiscoveryInput](#schema-discoveryinput)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Discovery](#schema-discovery)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`DISCOVERY_STALE`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[DiscoveryItem](#schema-discoveryitem), [ErrorParams](#schema-errorparams)。

<a id="api-d02"></a>

### D02 批量导入物理模型草稿

`POST /api/v1/model-access/providers/{provider_id}/models/import`；operationId：`modelAccessV14D02`。

权限：`model.providers:WRITE AND model.models:WRITE`。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                             |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                                                                   |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；结果未确认时按下文用原键和原请求恢复。 |
| header | `Origin`          | string | 是   | 否   | 当前站点来源                           | 用于会话写请求的来源校验，由浏览器设置。                                                             |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。         |

请求体见 [ImportInput](#schema-importinput) 和 [ImportItem](#schema-importitem)。HTTP 200 的 `data` 见 [ImportBatchResult](#schema-importbatchresult)。

同一页面可以同时勾选发现项和添加手工项。用户确认一次，前端提交一次 D02，并为该次提交生成一个 `Idempotency-Key`。提交时固定请求中的行序和页面行映射，后续按 `input_index`（从 0 开始）回填，即使页面已经排序或翻页也使用发送时的映射。

- 从 D01/D05 勾选的行保留原快照的 `models[].discovery_id` 和 `model_id_at_provider`。同一供应商的不同有效快照可以出现在同一批。快照过期、归属或版本不符、候选不存在时，保留这一行并提示重新发现。
- 手工行省略 `discovery_id`。行级 `null` 或非字符串属于整批结构错误，返回 422，定位 `models[n].discovery_id`。字符串为空或不是有效的 UUID 时，仅拒绝该行。顶层 `discovery_id` 已移除，任何值（包括 `null`）均导致整批 422，并定位至 `params.fields.discovery_id`。只有发现项或只有手工项时也提交同一结构。
- `model_id_at_provider` 是供应商内上游 ID 或部署名，用于匹配快照和判断已有物理模型。`model_id_at_gateway` 是用户编辑的网关对外调用 ID，按服务端规范化结果全局唯一，区分大小写。
- 提交该供应商当前 `expected_provider_version`（如 P04 `version`）以及 1 至 100 行。目录型号来源未明确选择时省略 `catalog_model_version_id`，不要发送 `null`。D02 不依赖 M13。
- D02 行内省略 `invocation_apis` 时采用可信目录建议，没有建议则保留空草稿。显式 `[]` 保留空草稿。非空时逐条提交 `{protocol,path}`，由后端分配行 ID。路径冲突等配置值错误只拒绝该模型行，`params.fields` 使用相对于本行的路径。数组为 `null`、元素类型无效或包含未知键会触发整批结构校验。成功创建 DRAFT，价格版本为 0。导入不会发起检测，`pricing` 只接受省略或 `null`。

示例请求使用一个合法发现项、一个合法手工项和一个过期发现项。示例 ID 和版本仅演示结构，实际值来自当前读取结果。

```http
POST /api/v1/model-access/providers/20000000-0000-4000-8000-000000000001/models/import
Content-Type: application/json
Origin: https://ais.example
X-CSRF-Token: <当前会话的 CSRF 值>
Idempotency-Key: d02-import-20261116-example
```

```json
{
  "expected_provider_version": 7,
  "models": [
    {
      "discovery_id": "50000000-0000-4000-8000-000000000001",
      "model_id_at_provider": "mock-chat",
      "model_id_at_gateway": "研发对话模型",
      "invocation_apis": []
    },
    {
      "model_id_at_provider": "mock-test",
      "model_id_at_gateway": "手工测试模型",
      "invocation_apis": []
    },
    {
      "discovery_id": "50000000-0000-4000-8000-000000000002",
      "model_id_at_provider": "mock-embedding",
      "model_id_at_gateway": "研发向量模型",
      "invocation_apis": []
    }
  ]
}
```

HTTP 200 代表返回了完整的逐行回执。分别展示 `CREATED`、`SKIPPED_EXISTING`、`REJECTED` 和三个服务端计数。前两种行的 `code` 都是 `OK`。已存在项不覆盖原模型，不计入新建数量，当对象不可见或已删除时模型详情可为空。失败行的 `params.reason_code` 必填，`params.fields` 使用相对于该行的路径，例如 `discovery_id` 或 `model_id_at_gateway`。示例中，过期发现项没有影响前两行创建。

```json
{
  "code": "OK",
  "data": {
    "items": [
      {
        "input_index": 0,
        "physical_model_id": "10000000-0000-4000-8000-000000000001",
        "status": "CREATED",
        "code": "OK",
        "params": {},
        "model": {
          "physical_model_id": "10000000-0000-4000-8000-000000000001",
          "model_id_at_gateway": "研发对话模型",
          "model_id_at_provider": "mock-chat",
          "provider_id": "20000000-0000-4000-8000-000000000001",
          "provider_name": "研发模型供应商",
          "status": "DRAFT",
          "versions": {
            "base": 1,
            "state": 1,
            "grants": 1,
            "health": 1,
            "price": 0,
            "metadata": 1
          },
          "invocation_apis": [],
          "catalog_model_version_id": null
        }
      },
      {
        "input_index": 1,
        "physical_model_id": "10000000-0000-4000-8000-000000000002",
        "status": "CREATED",
        "code": "OK",
        "params": {},
        "model": {
          "physical_model_id": "10000000-0000-4000-8000-000000000002",
          "model_id_at_gateway": "手工测试模型",
          "model_id_at_provider": "mock-test",
          "provider_id": "20000000-0000-4000-8000-000000000001",
          "provider_name": "研发模型供应商",
          "status": "DRAFT",
          "versions": {
            "base": 1,
            "state": 1,
            "grants": 1,
            "health": 1,
            "price": 0,
            "metadata": 1
          },
          "invocation_apis": [],
          "catalog_model_version_id": null
        }
      },
      {
        "input_index": 2,
        "physical_model_id": null,
        "status": "REJECTED",
        "code": "DISCOVERY_EXPIRED",
        "params": {
          "reason_code": "DISCOVERY_EXPIRED",
          "fields": {
            "discovery_id": "EXPIRED"
          }
        },
        "model": null
      }
    ],
    "succeeded_count": 2,
    "skipped_count": 0,
    "failed_count": 1
  },
  "params": {},
  "request_id": "90000000-0000-4000-8000-000000000003"
}
```

| 发现行 `code / params.reason_code`                                                                       | 字段                       | 前端处理                                                                              |
| -------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| `DISCOVERY_EXPIRED / DISCOVERY_EXPIRED`                                                                  | `discovery_id`             | 提示快照过期，重新获取候选。                                                          |
| `NOT_FOUND / DISCOVERY_NOT_AVAILABLE`                                                                    | `discovery_id`             | 提示快照不可用。不存在和不属于路径供应商使用同一提示。                                |
| `VERSION_CONFLICT / DISCOVERY_PROVIDER_VERSION_MISMATCH`、`CATALOG_CHANGED / DISCOVERY_CATALOG_MISMATCH` | `discovery_id`             | 刷新当前供应商并重新发现。只有该行的快照已过时，区别于 D02 外层的供应商整体版本冲突。 |
| `VALIDATION_FAILED / DISCOVERY_STATUS_INVALID`                                                           | `discovery_id`             | 提示发现未形成可导入结果，重新获取。                                                  |
| `VALIDATION_FAILED / MODEL_NOT_IN_DISCOVERY`                                                             | `model_id_at_provider`     | 提示该上游 ID 不在该行快照中，重新选择候选。                                          |
| `CATALOG_CHANGED / DISCOVERY_MODEL_CATALOG_MISMATCH`                                                     | `catalog_model_version_id` | 刷新发现候选的可信目录版本。                                                          |
| `CATALOG_INCOMPATIBLE / DISCOVERY_BINDING_INVALID`                                                       | `discovery_id`             | 提示快照绑定不可用，保留该行与请求追踪标识。                                          |

同批候选的网关调用 ID 规范化后相同，参与冲突的行都返回 `NAME_CONFLICT / DUPLICATE_GATEWAY_ID_IN_BATCH`；若调用 ID 已在系统中占用，返回 `NAME_CONFLICT / GATEWAY_ID_TAKEN`。两者均定位 `model_id_at_gateway`，由用户改名后再提交。同一供应商的相同上游 ID 在网关名称不同且其他校验通过时，按行序创建一次，后续行返回 `SKIPPED_EXISTING / OK`。若提交过程中被其他批次抢先创建并发生上游唯一键冲突，该行可返回 `PROVIDER_MODEL_CONFLICT / PROVIDER_MODEL_ALREADY_CREATED`，定位 `model_id_at_provider`，刷新对象后再决定是否重试。

| 其他行原因 `params.reason_code`                                                                                                                  | 前端处理                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `ROW_FIELDS_INVALID`、`INVALID_PROVIDER_MODEL_ID`、`INVALID_GATEWAY_MODEL_ID`、`INVALID_DISCOVERY_ID`、`INVALID_CATALOG_MODEL_VERSION_ID`        | 按 `fields` 高亮缺失或无效的标识和输入。                           |
| `TOO_MANY_INVOCATION_APIS`、`DUPLICATE_STANDARD_INVOCATION_API`、`DUPLICATE_CUSTOM_INVOCATION_PATH`                                              | 将接口总数限制在 32 项以内，移除重复项。                           |
| `INVALID_STANDARD_INVOCATION_API`、`INVALID_CUSTOM_INVOCATION_PATH`、`STANDARD_INVOCATION_API_UNSUPPORTED`、`CUSTOM_INVOCATION_PATH_UNSUPPORTED` | 定位接口或相对路径，提示修改或清空无效配置。                       |
| `CATALOG_MODEL_MISMATCH`、`PINNED_CATALOG_CHANGED`、`PROVIDER_CHANGED_DURING_IMPORT`                                                             | 提示供应商或所选目录已变化，刷新后仅重新提交失败行。               |
| `CATALOG_MODEL_INVALID`、`CATALOG_SUGGESTED_INVOCATION_API_UNSUPPORTED`                                                                          | 提示固定目录或目录建议异常，保留输入，附 `request_id` 联系管理员。 |

#### 整批错误与恢复

首次提交时，请求结构、会话、权限与 CSRF 校验失败会阻止受理。供应商不可用返回整批 HTTP 404（`NOT_FOUND / PROVIDER_NOT_AVAILABLE`，定位 `provider_id`）。当前供应商版本与 `expected_provider_version` 不同返回整批 HTTP 409（`VERSION_CONFLICT / PROVIDER_VERSION_MISMATCH`，定位 `expected_provider_version`）。已经受理的同键请求先按幂等记录重放或恢复。单条快照或模型校验失败返回逐行结果，外层仍为 HTTP 200。

非 200 响应沿用 `code/data/params/request_id` 封套，`data` 为 `null`。以 `params.reason_code` 给出本地化提示，按 `params.fields` 精确标注输入或请求头，例如 `models[2].invocation_apis`、`expected_provider_version` 或 `headers.Idempotency-Key`。无可定位字段时在批次级展示原因和 `request_id`。

例如，传入旧的顶层发现字段：

```json
{
  "code": "VALIDATION_FAILED",
  "data": null,
  "params": {
    "reason_code": "TOP_LEVEL_DISCOVERY_ID_UNSUPPORTED",
    "result_state": "NOT_STARTED",
    "fields": { "discovery_id": "UNSUPPORTED_FIELD" }
  },
  "request_id": "90000000-0000-4000-8000-000000000004"
}
```

| 结果                                                          | 前端处理                                                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `params.result_state=NOT_STARTED`                             | 本次请求未开始批次写入。若此前同键提交结果未知，先核对原批次。首次提交遇到明确的入参拒绝时，保留输入并按原因修正，经用户确认后再提交。 |
| `params.result_state=UNCONFIRMED`、请求超时、断网或拿不到回执 | 可能已有部分行提交。保留原请求体、行序和幂等键，用相同请求恢复结果。若返回幂等冲突，先核对该键实际关联的原请求。                       |
| 收到完整 HTTP 200 且用户修正失败项                            | 保留已完成的行，用户确认后用新幂等键只提交需重试的行。过期或失效的发现项先取得新快照，再由用户选择该发现项。                           |

幂等记录按操作者、操作和键关联，并校验原请求摘要。首次受理由服务端绑定供应商、固定目录和逐行快照候选，保留所需的 Azure 部署来源证据。中断恢复校验已保存的计划并继续未完成行，已持久化的行复用其结果。恢复使用已绑定的发现证据，不重新发现或因快照到期重新解释；尚未完成的写入仍校验当前权限及供应商、目录变更。已完成的同键同请求通过当前鉴权后返回固化回执，并按当前可见性过滤模型信息。快照后来过期不会改变原行结果。若旧版已保存的内部计划或回执被误用，接口返回 `OPERATION_RESULT_UNKNOWN`；请根据原请求及模型列表核对已写入的结果。

收到 `IDEMPOTENCY_IN_PROGRESS` 或 `AUTHENTICATION_BUSY` 时，按返回的 `Retry-After` 秒数等待后使用原键查询。遇 `IDEMPOTENCY_REQUEST_MISMATCH` 核对原请求，遇 `IMPORT_PLAN_OR_RECEIPT_UNVERIFIED` 保留原请求和追踪标识供排查。

服务端会区分导入准备、恢复、逐行处理、保存回执和读取回执阶段的异常，对应 `IMPORT_PREPARATION_FAILED`、`IMPORT_RESUME_FAILED`、`IMPORT_ROW_EXECUTION_FAILED`、`IMPORT_RECEIPT_WRITE_FAILED`、`IMPORT_RECEIPT_READ_FAILED`。如果不能确定失败阶段则使用 `IMPORT_RESULT_UNCONFIRMED`。失败状态和字段路径决定页面提示；统一保留 `request_id`，无需展示接口或上游异常原文。前端遇到尚未收录的原因码时，用对应业务码的通用提示。

<a id="api-d03"></a>

### D03 引导保存接口并逐模型提交检测

`POST /api/v1/model-access/providers/{provider_id}/models/admission-tests`；operationId：`modelAccessV14D03`。

权限：`model.models:WRITE,model.admission:WRITE`。

逐模型校验 DRAFT、基础版本、作用域及准入权限。提交有序 `invocation_apis`，至少一行。触发标准入站冲突时拒绝该行，并返回 `params.fields` 和 `params.standard_route`。客户端可用 [C05](#api-c05) 对拟提交的协议预检。D03 在正式事务中按实际协议复核计量指标和适用的当前价格。有指标但未保存价格时，该行返回 `REJECTED / PRICE_NOT_CONFIGURED`，该行协议修改一并回滚。协议合法且无指标时可继续检测。有指标且价格适用时冻结检测价格。接口保存、任务与审计同事务，提交后才调用供应商。复用任务仍核验源计划、全部项目及探针语义。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                                                           |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [ProviderAdmissionInput](#schema-provideradmissioninput)。

成功：HTTP **202**，封装字段见 §1.1；`data` 完整字段见 [BatchResult](#schema-batchresult)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[AdmissionModelInput](#schema-admissionmodelinput), [BatchItem](#schema-batchitem)。

<a id="api-d04"></a>

### D04 引导批量确认上架

> **40修订设计（未实施）**：D04不首建价格。逐项同事务复核当前有效价格或经服务端确认的真实无metric未定价例外，以及当前配置对应的准入PASS，再更新ACTIVE、审计和幂等结果；失败保持本项原状态，其他项按批量契约处理。M07 APPROVE复用相同内部服务，不能绕过价格复核。

`POST /api/v1/model-access/providers/{provider_id}/models/publish`；operationId：`modelAccessV14D04`。

权限：`model.review:WRITE`。

业务、并发与事务规则：逐项PENDING_REVIEW校验与审核；不能信任前端PASS

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                                                           |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [PublishInput](#schema-publishinput)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [BatchResult](#schema-batchresult)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[BatchItem](#schema-batchitem), [ModelVersionRef](#schema-modelversionref)。

<a id="api-d05"></a>

### D05 读取发现快照

`GET /api/v1/model-access/providers/{provider_id}/model-discoveries/{discovery_id}`；operationId：`modelAccessV14D05`。

权限：`model.providers:READ`。

业务、并发与事务规则：只读分页，过期410，provider与discovery必须一致

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `provider_id`     | string  | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                 |
| path   | `discovery_id`    | string  | 是   | 否   | format="uuid"                          | 发现快照UUID，必须属于路径供应商                   |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                      |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Discovery](#schema-discovery)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`DISCOVERY_EXPIRED`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[DiscoveryItem](#schema-discoveryitem), [ErrorParams](#schema-errorparams)。

<a id="api-m01"></a>

### M01 物理模型列表

`GET /api/v1/model-access/models`；operationId：`modelAccessV14M01`。

权限：`model.models:READ`。

业务、并发与事务规则：同字段多选OR，不同字段AND；稳定created_at DESC,id DESC；无逻辑模型type筛选；q同时匹配模型名称、上游ID、说明、供应商实例名称；M01/M02除provider_id维度外其余筛选和范围一致。

| 位置   | 参数                | 类型                | 必填 | 可空 | 默认/限制                                                                     | 参数说明                                                                       |
| ------ | ------------------- | ------------------- | ---- | ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| query  | `page`              | integer             | 否   | 否   | default=1；minimum=1                                                          | 页码，从 1 开始；省略为 1。                                                    |
| query  | `page_size`         | integer             | 否   | 否   | default=20；minimum=1；maximum=100                                            | 每页条数，省略 20，上限 100。                                                  |
| query  | `q`                 | string              | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则                                        | 模型名称、供应商侧ID、说明或所属供应商实例名；去首尾空白，空字符串视为未筛选。 |
| query  | `provider_id`       | string              | 否   | 否   | format="uuid"                                                                 | 仅筛选该新供应商实例下模型，UUID 必须在可见范围内。                            |
| query  | `status`            | string              | 否   | 否   | enum=["DRAFT", "TESTING", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "RETIRED"] | 按模型生命周期精确筛选。                                                       |
| query  | `input_modalities`  | array&lt;string&gt; | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则                                        | 输入模态多选，同字段 OR；重复 query 参数，不用逗号拆分。                       |
| query  | `output_modalities` | array&lt;string&gt; | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则                                        | 输出模态多选，同字段 OR；重复 query 参数，不用逗号拆分。                       |
| header | `Accept-Language`   | string              | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则                                        | 当前用户偏好的支持语言；省略时按现有会话语言协商。                             |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [ModelPage](#schema-modelpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[ModelListItem](#schema-modellistitem)。

<a id="api-m02"></a>

### M02 模型列表供应商标签计数

`GET /api/v1/model-access/models/summary`；operationId：`modelAccessV14M02`。

权限：`model.models:READ`。

业务、并发与事务规则：在同一管理可见范围内统计；统计不含当前provider筛选，其他搜索/状态/模态筛选与M01一致；q同时匹配模型名称、上游ID、说明、供应商实例名称；M01/M02除provider_id维度外其余筛选和范围一致。

| 位置   | 参数                | 类型                | 必填 | 可空 | 默认/限制                                                                     | 参数说明                                                                       |
| ------ | ------------------- | ------------------- | ---- | ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| query  | `q`                 | string              | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则                                        | 模型名称、供应商侧ID、说明或所属供应商实例名；去首尾空白，空字符串视为未筛选。 |
| query  | `status`            | string              | 否   | 否   | enum=["DRAFT", "TESTING", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "RETIRED"] | 按模型生命周期精确筛选。                                                       |
| query  | `input_modalities`  | array&lt;string&gt; | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则                                        | 输入模态多选，同字段 OR；重复 query 参数，不用逗号拆分。                       |
| query  | `output_modalities` | array&lt;string&gt; | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则                                        | 输出模态多选，同字段 OR；重复 query 参数，不用逗号拆分。                       |
| header | `Accept-Language`   | string              | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则                                        | 当前用户偏好的支持语言；省略时按现有会话语言协商。                             |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Summary](#schema-summary)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：无。

<a id="api-m03"></a>

### M03 手动创建物理模型

`POST /api/v1/model-access/models`；operationId：`modelAccessV14M03`。

权限：`model.models:WRITE；有计量规格并提交pricing对象需model.pricing:WRITE；提交initial_grants另需model.permissions:WRITE`。

业务、并发与事务规则：全部创建域同一事务，不触发检测。40修订：expected_provider_version仍必填；pricing省略/null不配置，不再要求必须确无metric；主动提交对象时仍须完整内部价及价格写权限，首次expected_price_version=0。M13只准备建议，保存才确认内部价；官方参考数字不是换汇或已生效费用。服务端重验目录/可信型号、提供商版本、预算币种及适配指标；有可用官方参考时回传准确参考ID并冻结原币快照。首次无适用产品默认、有metric、真实缺价且确认FIXED全指标0记BUILT_IN/ENTERPRISE_DEFAULT_ZERO；有适用默认按本文默认确认规则，其他记ENTERPRISE_CUSTOM；复杂官方规则无法表达且有metric、无适用企业默认时按F40-02形成完整零价，不修改官方事实。调用ID同M12规范化、全局区分大小写，由数据库唯一约束兜底409 NAME_CONFLICT；提交 `invocation_apis` 至少一行，创建时由后端分配行 ID。 首次内部价格按M13默认优先规则：适用产品默认及官方参考ID分别回传并冻结；原样确认完整默认可为非零或分时BUILT_IN/ENTERPRISE_DEFAULT_CONFIRMED，修改默认仍保留引用而记ENTERPRISE_CUSTOM/ENTERPRISE_CONFIGURED；不能将默认0当缺配置。 首次是否原样采用默认：先按is_fallback及规范化conditions定位对应时段，再比较完整指标/Decimal费率/模式；name可为该同一时段已发布的任一语言标签，同语言下时段标签发布时必须唯一，不能以当前请求语言变化误判自定义。非已发布别名或改规则/费率记ENTERPRISE_CUSTOM。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [ModelCreate](#schema-modelcreate)。

成功：HTTP **201**，封装字段见 §1.1；`data` 完整字段见 [Model](#schema-model)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`NAME_CONFLICT`、`PROVIDER_MODEL_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`、`BILLING_CURRENCY_CHANGED`、`PRICE_RULE_INVALID`、`METRIC_UNSUPPORTED`、`VERSION_CONFLICT`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[InvocationAPIInput](#schema-invocationapiinput), [HealthInput](#schema-healthinput), [InvocationAPI](#schema-invocationapi), [ModelVersions](#schema-modelversions), [OfficialModelBinding](#schema-officialmodelbinding), [PricingInput](#schema-pricinginput), [Subject](#schema-subject)。

<a id="api-m04"></a>

### M04 物理模型详情

`GET /api/v1/model-access/models/{model_id}`；operationId：`modelAccessV14M04`。

权限：`model.models:READ`。

业务、并发与事务规则：授权、价格和检查历史由各自的 READ 权限接口读取。`invocation_apis` 按保存顺序回显。未配置透传时数组没有 `CUSTOM_PASSTHROUGH` 行。没有任何配置的草稿返回 `invocation_apis: []`。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID       |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Model](#schema-model)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[HealthInput](#schema-healthinput), [InvocationAPI](#schema-invocationapi), [ModelVersions](#schema-modelversions), [OfficialModelBinding](#schema-officialmodelbinding)。

<a id="api-m05"></a>

### M05 复合表单保存修改域

`PUT /api/v1/model-access/models/{model_id}`；operationId：`modelAccessV14M05`。

权限：`按提交域model.models/permissions/pricing:WRITE`。

业务规则：按修改域和各自预期版本提交，同一请求整体事务。TESTING、PENDING_REVIEW 拒绝 M05。RETIRED 可以改网关名称、协议及路径，供应商和上游标识必须保持原值。只有 DRAFT 可以改上游，或显式传 `base.invocation_apis: []` 清空配置。RETIRED 保存协议时至少保留一行，可以同次替换。编辑配置时提交完整有序数组，已有行回传 ID。配置发生实际变化时重新准入，仅顺序变化保持原准入代次。

配置行 ID 与协议绑定：保留行、修改路径或排序时回传 M04 中该行的原 ID 和原协议。切换协议须在完整 `base.invocation_apis` 中移除旧行，提交不含 ID 的新协议行；其他保留行仍带原 ID。保存成功后，未保留的旧行被删除，新行由后端分配 ID，删除和新增在同一事务中完成。不要先单独删除再新增；RETIRED 同次替换后仍须至少一行。完整请求示例见[前端指南 §5.4](07-前端协同对接指南.md#invocation-row-identity)。

显式 ID 不属于当前模型，或该 ID 已有协议与请求协议不一致，均返回 HTTP 422 `VALIDATION_FAILED`，`params.fields["base.invocation_apis[i].id"]` 为 `NOT_MODEL_INVOCATION`（`i` 为实际下标）。因此该错误不只表示“配置不存在”。失败时本请求全部修改域回滚；成功后用返回 Model 更新配置行 ID 和版本，不再使用被替换行的旧 ID。

| 状态                    | 供应商实例、供应商侧模型标识 | 网关名称、协议与路径                 | 其他 M05 域 |
| ----------------------- | ---------------------------- | ------------------------------------ | ----------- |
| DRAFT                   | 按权限可改                   | 可改，允许提交 `invocation_apis: []` | 按权限可改  |
| TESTING、PENDING_REVIEW | 锁定                         | 锁定                                 | 全部锁定    |
| ACTIVE、SUSPENDED       | 锁定                         | 锁定                                 | 按权限可改  |
| RETIRED                 | 锁定                         | 可改，至少保留一行                   | 按权限可改  |

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                                                         |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                                                     |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 非空优先匹配启用语言，未匹配或语法无效时回退系统默认；省略时按有效会话启用偏好再回退系统默认。错误原因支持 zh-CN/en/fr，见下文。 |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。                                                   |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。                                     |

请求体：必填 JSON 对象，完整字段见 [ModelUpdate](#schema-modelupdate)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Model](#schema-model)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`STATE_CONFLICT`、`VERSION_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`、`NAME_CONFLICT`、`PROVIDER_MODEL_CONFLICT`、`BILLING_CURRENCY_CHANGED`、`PRICE_RULE_INVALID`、`METRIC_UNSUPPORTED`、`CUSTOM_API_UNSUPPORTED`、`ORIGIN_REJECTED`、`AUTHENTICATION_BUSY`、`UNSUPPORTED_MEDIA_TYPE`、`COMMAND_HMAC_KEY_UNAVAILABLE`；HTTP 与恢复语义见 §1.2，错误封套见 [Error](#schema-error)，本操作的 `params` 使用 [ModelEditErrorParams](#schema-modelediterrorparams)。

错误原因与语言：顶层 `params.reason_code=code`，`params.reason` 与 `params.errors[].reason` 使用同一协商语言。非空 `Accept-Language` 按权重匹配已启用语言（包括既有 `en-US` / `en-GB` → `en`、`fr-FR` → `fr` 映射）；未匹配或格式无效时直接使用系统默认，不再采用用户偏好。省略请求头时使用有效会话的启用偏好，否则使用系统默认。无法取得权威语言事实时仅安全回退到内置 `zh-CN`，不以翻译失败覆盖原业务码或 HTTP 状态。支持的原因词条为中文、英文、法文；机器原因码和结构化定位信息不翻译。

| 已匹配 M05 路由的失败响应头 | 类型                          | 说明                                                             |
| --------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| `Content-Language`          | string，`zh-CN` / `en` / `fr` | 本次顶层及逐项 `reason` 的实际语言；不可按请求头猜测实际回退结果 |
| `Vary`                      | string                        | 合并 `Accept-Language` 并保留已有值                              |
| `Cache-Control`             | string                        | 继续为 `no-store`                                                |

协议校验进入后，`errors[]` 汇总已能确认的输入、归属和适配问题；不跨越认证、权限、状态及版本守卫推测后续错误。前置失败没有 `errors` 不代表配置全部合法；已确认的输入诊断可以随已知目录失败一起返回。参数、目录或数据库错误不能导致部分修改域写入或自动调用供应商。`OPERATION_RESULT_UNKNOWN` 仍按原结果核对规则处理，不能假定未保存。切换界面语言只更新后续请求头或按稳定原因码重绘已有错误，不自动重放写请求。三语言同码示例见[前端指南](07-前端协同对接指南.md#保存失败的原因与协议逐项诊断)。

同一个缺绑定错误在三种语言下保持 `code=params.reason_code=METRIC_UNSUPPORTED`、逐项 `reason_code=PROTOCOL_NOT_BOUND`、字段位置及支持协议不变，只改变下列说明文案。表中以请求语言已启用并成功匹配为前提，实际结果以 `Content-Language` 为准：

| `Accept-Language` / `Content-Language` | `params.reason`                                                                                                                                                                                                | `params.errors[0].reason`                                                                                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zh-CN`                                | 所提交的标准协议缺少可用适配绑定，或协议与路径配置不受支持，请查看 errors 中的具体原因。                                                                                                                       | 该标准协议未在当前固定供应商模板或关联目录型号中绑定可用适配器；supported_protocols 列出当前允许的标准协议。                                                                                                                               |
| `en`                                   | A submitted standard protocol has no usable adapter binding, or the protocol and path configuration is unsupported. See errors for the specific reasons.                                                       | This standard protocol has no usable adapter binding in the current pinned provider template or linked catalog model. The supported_protocols field lists the standard protocols currently allowed.                                        |
| `fr`                                   | Un protocole standard soumis ne possède aucune liaison d’adaptateur utilisable, ou la configuration du protocole et du chemin n’est pas prise en charge. Consultez errors pour connaître les raisons précises. | Ce protocole standard ne possède aucune liaison d’adaptateur utilisable dans le modèle de fournisseur figé actuel ou le modèle associé du catalogue. Le champ supported_protocols indique les protocoles standards actuellement autorisés. |

该接口使用的嵌套组件：[ModelEditErrorParams](#schema-modelediterrorparams), [ModelEditErrorDetail](#schema-modelediterrordetail), [InvocationAPIInput](#schema-invocationapiinput), [GrantDelta](#schema-grantdelta), [HealthInput](#schema-healthinput), [InvocationAPI](#schema-invocationapi), [ModelIdentityInput](#schema-modelidentityinput), [ModelMetadataInput](#schema-modelmetadatainput), [ModelVersions](#schema-modelversions), [OfficialModelBinding](#schema-officialmodelbinding), [PricingInput](#schema-pricinginput)。

<a id="api-m06"></a>

### M06 物理删除模型及所有价格历史

`DELETE /api/v1/model-access/models/{model_id}`；operationId：`modelAccessV14M06`。

权限：`model.models:WRITE`。

业务、并发与事务规则：DRAFT或RETIRED，无运行任务；其他状态按生命周期先处理；历史费用审计保留

| 位置   | 参数                     | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ------------------------ | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `model_id`               | string  | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                 |
| query  | `expected_base_version`  | integer | 是   | 否   | minimum=1                              | 删除模型时必传当前 M04.versions.base。                                                       |
| query  | `expected_state_version` | integer | 是   | 否   | minimum=1                              | 删除模型时必传当前 M04.versions.state。                                                      |
| header | `Accept-Language`        | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key`        | string  | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`           | string  | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Deleted](#schema-deleted)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`STATE_CONFLICT`、`CHECK_IN_PROGRESS`、`VERSION_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：无。

<a id="api-m07"></a>

### M07 模型生命周期命令

> **40修订设计（未实施）**：APPROVE与D04共用价格和准入复核，不在上架时首次建价。其他生命周期动作不因本次设计自动扩大范围。

`PUT /api/v1/model-access/models/{model_id}/status`；operationId：`modelAccessV14M07`。

权限：`APPROVE/REJECT:model.review:WRITE；其余model.models:WRITE`。

业务、并发与事务规则：状态转换矩阵见03；发起检测走C01；无任意status写入

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [StatusCommand](#schema-statuscommand)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Model](#schema-model)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`STATE_CONFLICT`、`VERSION_CONFLICT`、`ADMISSION_STALE`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[HealthInput](#schema-healthinput), [InvocationAPI](#schema-invocationapi), [ModelVersions](#schema-modelversions), [OfficialModelBinding](#schema-officialmodelbinding)。

<a id="api-m08"></a>

### M08 模型内置规格

`GET /api/v1/model-access/models/templates`；operationId：`modelAccessV14M08`。

权限：`model.models:READ OR model.models:WRITE`。

业务、并发与事务规则：只读数据库固定批次内置型号。默认无provider取当前；provider_id取该可见实例固定模板批次，显式catalog_release_id必须一致；续页回传固定批次，不能混合新发布。返回型号/模板/批次准确关联、元信息和适配计量规格；目录不代表实例型号已VERIFIED。只有pricing READ返回builtin_pricing，其他HIDDEN/null；提交自定义价仍须pricing WRITE。不提供目录管理功能。 builtin_pricing仅官方原币参考，不按总部币种筛选；多币种按目录首选。首次创建另用M13完整准备并显式保存pricing，HIDDEN/null不代表企业免费资格。 builtin_pricing严格只投影OFFICIAL_REFERENCE；企业默认规则另由M14读取，M13负责默认优先预填，不以官方null表示无企业默认。 默认paginate=true，page默认1、page_size默认20且上限100，单独page_size合法；paginate=false返回当前合法可见范围及筛选下全部匹配项，不静默截断。false时不得显式提供page/page_size，否则422 VALIDATION_FAILED；paginate空值、非true/false或重复参数为400 MALFORMED_REQUEST。分页与不分页使用同一权限/筛选谓词及稳定排序；items、total及关联展示字段来自同一数据库一致性快照，total不泄露不可见项数量。不分页时page/page_size成对为null且total=items.length，空结果为items=[]、total=0。 两种模式均固定同一catalog_release_id/catalog_revision，稳定按template_key、model_id_at_provider、catalog_model_version_id升序。provider_id继续可选；模型表单建议先选择供应商再读取该实例目录，仅为单型号预填时按model_id_at_provider筛选。只读本地数据库目录，不触发上游模型发现或供应商调用；全量不放宽pricing:READ保护。

| 位置   | 参数                       | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                                 |
| ------ | -------------------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| query  | `paginate`                 | boolean | 否   | 否   | default=true                           | 只接受true/false；false不分页且禁止同时传page/page_size；不改变权限范围。                                |
| query  | `page`                     | integer | 否   | 否   | default=1；minimum=1                   | 分页模式页码，从1开始，省略为1；paginate=false时不得显式提供。                                           |
| query  | `page_size`                | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 分页模式每页条数，省略20，上限100；单独提供按page=1。paginate=false时不得显式提供。                      |
| query  | `template_key`             | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 供应商模板稳定键；与provider_id同时提供时必须匹配该实例固定模板                                          |
| query  | `model_id_at_provider`     | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 按上游模型ID或可信官方绑定筛选该固定批次的内置型号；不从部署名猜官方型号                                 |
| query  | `provider_id`              | string  | 否   | 否   | format="uuid"                          | 模型表单当前可见供应商实例UUID；仅按模型用途范围校验，不要求完整供应商管理权限；提供时使用其固定模板批次 |
| query  | `catalog_release_id`       | string  | 否   | 否   | format="uuid"                          | 首次响应返回的固定批次UUID，续页原样回传；与provider_id同时提供时必须匹配实例固定批次，禁止混批次        |
| query  | `catalog_model_version_id` | string  | 否   | 否   | UUID                                   | 同时提供 `provider_id` 与 `model_id_at_provider` 时可选，用于按可信目录型号细化协议选择。                |
| header | `Accept-Language`          | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                                       |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [ModelTemplatePage](#schema-modeltemplatepage)。

分页参数只影响 `items`。未传 `provider_id` 时 `protocol_options` 为空且 `custom_passthrough_supported` 为 `null`。有供应商时，即使 `items` 为空，照常返回该实例的标准候选和透传配置能力。模型实际已配置的行由 M04 回显。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[ModelTemplate](#schema-modeltemplate)。

<a id="api-m09"></a>

### M09 模型表单可选供应商

`GET /api/v1/model-access/model-options/providers`；operationId：`modelAccessV14M09`。

权限：`model.models:READ OR model.models:WRITE`。

业务、并发与事务规则：满足model.models READ或WRITE任一即可；仍校验当前模型管理范围。只返回ProviderOption的公开字段，不能读取供应商秘密/完整配置，无需providers:READ。按实例名/模板名搜索，稳定分页；已有选中供应商由M04直接回显，不要求选项出现在第一页。；稳定排序为实例name、id升序。 默认paginate=true，page默认1、page_size默认20且上限100，单独page_size合法；paginate=false返回当前合法可见范围及筛选下全部匹配项，不静默截断。false时不得显式提供page/page_size，否则422 VALIDATION_FAILED；paginate空值、非true/false或重复参数为400 MALFORMED_REQUEST。分页与不分页使用同一权限/筛选谓词及稳定排序；items、total及关联展示字段来自同一数据库一致性快照，total不泄露不可见项数量。不分页时page/page_size成对为null且total=items.length，空结果为items=[]、total=0。 两种模式只读当前模型管理范围的供应商最小展示投影，q过滤继续有效，不返回认证信息、完整配置或余额。全量候选不替代M04已选供应商回显；搜索、空结果或失败均不能清空已有选择。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                                                            |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| query  | `paginate`        | boolean | 否   | 否   | default=true                           | 只接受true/false；false不分页且禁止同时传page/page_size；不改变权限范围。           |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 分页模式页码，从1开始，省略为1；paginate=false时不得显式提供。                      |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 分页模式每页条数，省略20，上限100；单独提供按page=1。paginate=false时不得显式提供。 |
| query  | `q`               | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 搜索本用途可见选项，去首尾空白；空字符串视为未筛选。                                |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                  |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [ProviderOptionPage](#schema-provideroptionpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[ProviderOption](#schema-provideroption)。

<a id="api-m10"></a>

### M10 模型表单已有标签目录

`GET /api/v1/model-access/model-options/tags`；operationId：`modelAccessV14M10`。

权限：`model.models:READ OR model.models:WRITE`。

业务、并发与事务规则：满足model.models READ或WRITE任一即可。内置标签与当前可见模型的已有自定义标签去重后分页；按value/当前语言label搜索。只读建议目录，新增自定义值仍由原模型保存接受，不创建独立标签维护功能。编辑已选值来自M04.tags，不能仅用当前页选项覆盖原值。；先内置后自定义，同类按value稳定升序。 默认paginate=true，page默认1、page_size默认20且上限100，单独page_size合法；paginate=false返回当前合法可见范围及筛选下全部匹配项，不静默截断。false时不得显式提供page/page_size，否则422 VALIDATION_FAILED；paginate空值、非true/false或重复参数为400 MALFORMED_REQUEST。分页与不分页使用同一权限/筛选谓词及稳定排序；items、total及关联展示字段来自同一数据库一致性快照，total不泄露不可见项数量。不分页时page/page_size成对为null且total=items.length，空结果为items=[]、total=0。 两种模式均先确定内置标签及当前可见模型标签这些合法来源，再按稳定value去重并应用q筛选；不从不可见模型推断自定义标签。内置label按Accept-Language/会话语言投影，自定义value/label保留原文。全量候选不替代M04.tags；候选缺失或失败不删除已选值，自定义新增仍由模型保存完成。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                                                            |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| query  | `paginate`        | boolean | 否   | 否   | default=true                           | 只接受true/false；false不分页且禁止同时传page/page_size；不改变权限范围。           |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 分页模式页码，从1开始，省略为1；paginate=false时不得显式提供。                      |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 分页模式每页条数，省略20，上限100；单独提供按page=1。paginate=false时不得显式提供。 |
| query  | `q`               | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 搜索本用途可见选项，去首尾空白；空字符串视为未筛选。                                |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                  |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [TagOptionPage](#schema-tagoptionpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[TagOption](#schema-tagoption)。

<a id="api-m11"></a>

### M11 模型生命周期时间线

`GET /api/v1/model-access/models/{model_id}/lifecycle-events`；operationId：`modelAccessV14M11`。

权限：`model.models:READ`。

业务、并发与事务规则：仅当前可见模型的生命周期审计投影，按occurred_at DESC,id DESC稳定分页；不要求audit:READ，不返回原始审计payload/其他业务事件。操作者/from/to/reason/time均源于当时固化事件。模型删除后原审计仍由公共审计读取，本路径不提供已删模型旁路。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string  | 是   | 否   | format="uuid"                          | 当前管理范围内的新版物理模型UUID                   |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                      |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [LifecycleEventPage](#schema-lifecycleeventpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[LifecycleEvent](#schema-lifecycleevent)。

<a id="api-c01"></a>

### C01 提交准入检测

C01 在受理事务内按已保存协议复核价格门槛，有计费项但缺价时返回 HTTP 409 `PRICE_NOT_CONFIGURED`。价格失配沿用 `PRICE_RULE_INVALID` 或 `BILLING_CURRENCY_CHANGED`。页面可先调用 [C05](#api-c05) 取得价格判定。

`POST /api/v1/model-access/models/{model_id}/admission-tests`；operationId：`modelAccessV14C01`。

权限：`model.admission:WRITE`。

业务、并发与事务规则：DRAFT、同模型互斥；每配置行每检测类型一次，无自动重试；未执行项 result_detail=null、cost=null；等待项计数按计划返回，不能以空对象假充结果。；triggered_by_display/model_display及每项invocation_api与detail_text/suggestion_text独立于pricing权限，从任务时快照投影。 显式reuse_job_id还须比较当前所需接口计划、全部检测项目与源任务冻结探针输入语义；新加流式不能复用缺STREAMING的旧完整接口PASS。metadata_version差异本身不使复用或审核失效，纯描述修改可复用；计划/有效探针不同返回409 STATE_CONFLICT，要求管理员明确新检测，不自动补发。 连续复用按内部冻结六字段元信息及实际探针/计划事实验证；内部源快照完整扁平复制，不依赖API最小投影、当前模型或已清理源任务补值。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [CheckInput](#schema-checkinput)。

成功：HTTP **202**，封装字段见 §1.1；`data` 完整字段见 [CheckJob](#schema-checkjob)。

除上述价格错误外，常见错误包括 `UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`STATE_CONFLICT`、`CHECK_IN_PROGRESS`、`VERSION_CONFLICT`、`CUSTOM_API_UNSUPPORTED`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`。完整契约见 [实际 OpenAPI](../../../contracts/current/openapi.json)。

该接口使用的嵌套组件：[CheckItem](#schema-checkitem), [CheckSummary](#schema-checksummary), [IdentitySnapshot](#schema-identitysnapshot), [InvocationAPIDisplay](#schema-invocationapidisplay), [ModelDisplaySnapshot](#schema-modeldisplaysnapshot)。

<a id="api-c02"></a>

### C02 准入历史最近50次

`GET /api/v1/model-access/models/{model_id}/admission-tests`；operationId：`modelAccessV14C02`。

权限：`model.admission:READ`。

业务、并发与事务规则：；每行CheckJobSummary直接给触发人/历史接口上下文的入口，不携带完整items/费用；详情按C03/H05读取。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string  | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID       |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                      |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [CheckJobPage](#schema-checkjobpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[CheckJobSummary](#schema-checkjobsummary)。

<a id="api-c03"></a>

### C03 准入进度和完整结果

`GET /api/v1/model-access/models/{model_id}/admission-tests/{test_id}`；operationId：`modelAccessV14C03`。

权限：`model.admission:READ`。

业务、并发与事务规则：test_id必须属于path模型及ADMISSION；GET不探测；未执行项 result_detail=null、cost=null；等待项计数按计划返回，不能以空对象假充结果。；triggered_by_display/model_display及每项invocation_api与detail_text/suggestion_text独立于pricing权限，从任务时快照投影。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID       |
| path   | `test_id`         | string | 是   | 否   | format="uuid"                          | 检测任务UUID，必须属于路径模型及指定准入/健康类型  |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [CheckJob](#schema-checkjob)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[CheckItem](#schema-checkitem), [CheckSummary](#schema-checksummary), [IdentitySnapshot](#schema-identitysnapshot), [InvocationAPIDisplay](#schema-invocationapidisplay), [ModelDisplaySnapshot](#schema-modeldisplaysnapshot)。

<a id="api-c04"></a>

### C04 最新准入结果

`GET /api/v1/model-access/models/{model_id}/admission-tests/latest`；operationId：`modelAccessV14C04`。

权限：`model.admission:READ`。

业务、并发与事务规则：无记录返回200 data=null；不能借GET触发检测；未执行项 result_detail=null、cost=null；等待项计数按计划返回，不能以空对象假充结果。；triggered_by_display/model_display及每项invocation_api与detail_text/suggestion_text独立于pricing权限，从任务时快照投影。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID       |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [CheckJob](#schema-checkjob)；无历史时为 null。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[CheckItem](#schema-checkitem), [CheckSummary](#schema-checksummary), [IdentitySnapshot](#schema-identitysnapshot), [InvocationAPIDisplay](#schema-invocationapidisplay), [ModelDisplaySnapshot](#schema-modeldisplaysnapshot)。

<a id="api-c05"></a>

### C05 准入价格预检

`POST /api/v1/model-access/models/{model_id}/admission-tests/pricing-check`，operationId 为 `modelAccessV14C05`。

需要完整会话和 `model.admission:WRITE`。提交拟变更的协议时再校验 `model.models:WRITE`。预检只读取数据，调用时无需幂等键或价格读取权限。

<a id="c05-request"></a>

#### 请求字段

| 位置   | 字段                    | 类型                                               | 必填 | 约束与说明                                     |
| ------ | ----------------------- | -------------------------------------------------- | ---- | ---------------------------------------------- |
| 路径   | `model_id`              | string (UUID)                                      | 是   | 物理模型 ID                                    |
| 请求头 | `Origin`                | string                                             | 是   | 与控制面配置匹配的请求来源                     |
| 请求头 | `X-CSRF-Token`          | string                                             | 是   | 当前会话的 CSRF 令牌                           |
| JSON   | `expected_base_version` | integer (int64)                                    | 是   | 当前模型 `versions.base`，最小为 1             |
| JSON   | `invocation_apis`       | [InvocationAPIInput](#schema-invocationapiinput)[] | 否   | 拟检测的 1 至 32 条有序配置。已有行可回传 ID。 |

模型须处于 DRAFT。省略 `invocation_apis` 时按已保存配置预检，提供时按拟提交配置预检。数组须非空且不可为 `null`。配置路径与标准入站路由冲突时，返回 422 并在 `params.standard_route` 中报告冲突入口。

<a id="c05-response"></a>

#### 返回字段

完成判定时返回 HTTP 200（`code=OK`），通过和未通过都使用下列字段。结果仅表示价格门槛。

| `data` 字段            | 类型    | 必填 | 说明                         |
| ---------------------- | ------- | ---- | ---------------------------- |
| `pricing_check_passed` | boolean | 是   | 本次配置是否满足准入价格要求 |
| `reason`               | string  | 是   | 下表定义的稳定判定枚举       |

| `reason`               | 是否通过 | 条件                                   |
| ---------------------- | -------- | -------------------------------------- |
| `PRICE_CONFIGURED`     | true     | 有计费项且存在完整适用的已保存价格     |
| `NO_BILLING_ITEMS`     | true     | 协议配置合法且没有适用计费项           |
| `PRICE_NOT_CONFIGURED` | false    | 有计费项但没有已保存价格               |
| `PRICE_NOT_APPLICABLE` | false    | 已保存价格与当前计费项或预算币种不匹配 |

| HTTP | 业务码                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `MALFORMED_REQUEST`                                                                                                                          |
| 401  | `UNAUTHENTICATED`                                                                                                                            |
| 403  | `CSRF_INVALID`、`FORBIDDEN`、`ORIGIN_REJECTED`、`OUT_OF_SCOPE`、`PASSWORD_CHANGE_REQUIRED`、`RESOURCE_DISABLED`、`TERMS_ACCEPTANCE_REQUIRED` |
| 404  | `NOT_FOUND`                                                                                                                                  |
| 409  | `VERSION_CONFLICT`（基础版本变化）、`CHECK_IN_PROGRESS`（检测中）、`STATE_CONFLICT`（其他非 DRAFT 状态）、`CATALOG_CHANGED`                  |
| 415  | `UNSUPPORTED_MEDIA_TYPE`                                                                                                                     |
| 422  | `VALIDATION_FAILED`（例如无有效配置或透传路径与标准入口冲突）、`CATALOG_INCOMPATIBLE`、`CUSTOM_API_UNSUPPORTED`、`METRIC_UNSUPPORTED`        |
| 500  | `INTERNAL_ERROR`                                                                                                                             |
| 503  | `AUTHENTICATION_BUSY`、`CATALOG_UNAVAILABLE`                                                                                                 |

<a id="api-h01"></a>

### H01 手动健康检查

`POST /api/v1/model-access/models/{model_id}/health-checks`；operationId：`modelAccessV14H01`。

权限：`model.admission:WRITE`。

业务、并发与事务规则：ACTIVE/SUSPENDED；只更新健康状态；无reuse；未执行项 result_detail=null、cost=null；等待项计数按计划返回，不能以空对象假充结果。；triggered_by_display/model_display及每项invocation_api与detail_text/suggestion_text独立于pricing权限，从任务时快照投影。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [HealthCheckInput](#schema-healthcheckinput)。

成功：HTTP **202**，封装字段见 §1.1；`data` 完整字段见 [CheckJob](#schema-checkjob)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`STATE_CONFLICT`、`CHECK_IN_PROGRESS`、`VERSION_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[CheckItem](#schema-checkitem), [CheckSummary](#schema-checksummary), [IdentitySnapshot](#schema-identitysnapshot), [InvocationAPIDisplay](#schema-invocationapidisplay), [ModelDisplaySnapshot](#schema-modeldisplaysnapshot)。

<a id="api-h02"></a>

### H02 健康历史最近5次

`GET /api/v1/model-access/models/{model_id}/health-checks`；operationId：`modelAccessV14H02`。

权限：`model.admission:READ`。

业务、并发与事务规则：；每行CheckJobSummary直接给触发人/历史接口上下文的入口，不携带完整items/费用；详情按C03/H05读取。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string  | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID       |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                      |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [CheckJobPage](#schema-checkjobpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[CheckJobSummary](#schema-checkjobsummary)。

<a id="api-h03"></a>

### H03 最近健康结果

`GET /api/v1/model-access/models/{model_id}/health-checks/latest`；operationId：`modelAccessV14H03`。

权限：`model.admission:READ`。

业务、并发与事务规则：无记录200 data=null，模型当前health_status仍由M04返回；未执行项 result_detail=null、cost=null；等待项计数按计划返回，不能以空对象假充结果。；triggered_by_display/model_display及每项invocation_api与detail_text/suggestion_text独立于pricing权限，从任务时快照投影。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID       |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [CheckJob](#schema-checkjob)；无历史时为 null。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[CheckItem](#schema-checkitem), [CheckSummary](#schema-checksummary), [IdentitySnapshot](#schema-identitysnapshot), [InvocationAPIDisplay](#schema-invocationapidisplay), [ModelDisplaySnapshot](#schema-modeldisplaysnapshot)。

<a id="api-h04"></a>

### H04 保存健康开关周期

`PUT /api/v1/model-access/models/{model_id}/health-config`；operationId：`modelAccessV14H04`。

权限：`model.models:WRITE`。

业务、并发与事务规则：不受DRAFT限制；当前运行任务保持；只ACTIVE调度

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [HealthConfigUpdate](#schema-healthconfigupdate)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Model](#schema-model)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`VERSION_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[HealthInput](#schema-healthinput), [InvocationAPI](#schema-invocationapi), [ModelVersions](#schema-modelversions), [OfficialModelBinding](#schema-officialmodelbinding)。

<a id="api-h05"></a>

### H05 健康进度及完整结果

`GET /api/v1/model-access/models/{model_id}/health-checks/{test_id}`；operationId：`modelAccessV14H05`。

权限：`model.admission:READ`。

业务、并发与事务规则：test_id必须属于path模型且HEALTH；未执行项 result_detail=null、cost=null；等待项计数按计划返回，不能以空对象假充结果。；triggered_by_display/model_display及每项invocation_api与detail_text/suggestion_text独立于pricing权限，从任务时快照投影。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID       |
| path   | `test_id`         | string | 是   | 否   | format="uuid"                          | 检测任务UUID，必须属于路径模型及指定准入/健康类型  |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [CheckJob](#schema-checkjob)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[CheckItem](#schema-checkitem), [CheckSummary](#schema-checksummary), [IdentitySnapshot](#schema-identitysnapshot), [InvocationAPIDisplay](#schema-invocationapidisplay), [ModelDisplaySnapshot](#schema-modeldisplaysnapshot)。

<a id="api-a01"></a>

### A01 物理模型授权集合

`GET /api/v1/model-access/models/{model_id}/permissions`；operationId：`modelAccessV14A01`。

权限：`model.permissions:READ`。

业务、并发与事务规则：默认paginate=true，page默认1、page_size默认20且上限100，单独page_size合法；paginate=false一次返回本模型当前可见范围及筛选下全部直接授权关系，不展开部门/组成员，不截断。false时不得显式提供page/page_size，否则422 VALIDATION_FAILED；paginate空值、非true/false或重复参数为400 MALFORMED_REQUEST。subject_type可省略表示三类，q只筛选可见集合。items、total、名称展示字段、grant_version及authorization_version来自同一数据库一致性快照；total不泄露隐藏数量。稳定排序DEPARTMENT、USER_GROUP、USER，其后subject_id、id升序。部门/组范围沿T09-02，混合跨界组不得泄漏。保存仍用A02增删差异和expected_grant_version，不以当前筛选/失败/不可见关系替换授权全集。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                                 | 参数说明                                                                             |
| ------ | ----------------- | ------- | ---- | ---- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| path   | `model_id`        | string  | 是   | 否   | format="uuid"                             | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                         |
| query  | `paginate`        | boolean | 否   | 否   | default=true                              | 只接受true/false；false不分页且禁止同时传page/page_size；不改变权限范围。            |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                      | 分页模式页码，从1开始，省略1；paginate=false时不得显式提供。                         |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100        | 分页模式每页条数，省略20，上限100；单独page_size合法。paginate=false时不得显式提供。 |
| query  | `subject_type`    | string  | 否   | 否   | enum=["DEPARTMENT", "USER_GROUP", "USER"] | 可选主体类型DEPARTMENT/USER_GROUP/USER；省略返回三类，此处不是候选查询。             |
| query  | `q`               | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则    | 主体显示名搜索；去首尾空白，空串同未传；只筛选合法可见集合。                         |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则    | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                   |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [GrantPage](#schema-grantpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[Grant](#schema-grant)。

完整编辑区推荐请求`?paginate=false`且不带搜索/类型过滤；成功返回同一快照全部可见直接关系，page/page_size成对null，total等于items长度。失败保留原草稿，不自动清空授权。

<a id="api-a02"></a>

### A02 一次保存授权增删

`PUT /api/v1/model-access/models/{model_id}/permissions`；operationId：`modelAccessV14A02`。

权限：`model.permissions:WRITE`。

业务、并发与事务规则：替代PRD独立POST/DELETE，用于用户明确的混合增删原子保存；不增加confirmed/proof

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [GrantDelta](#schema-grantdelta)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [GrantResult](#schema-grantresult)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`VERSION_CONFLICT`、`GRANT_DELTA_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[Grant](#schema-grant), [Subject](#schema-subject)。

<a id="api-a03"></a>

### A03 跨模型批量添加授权

`POST /api/v1/model-access/models/permissions/batch`；operationId：`modelAccessV14A03`。

权限：`model.permissions:WRITE`。

业务、并发与事务规则：全部模型整体事务，版本/范围不满足全回滚；重复关系不增行

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [BatchGrantInput](#schema-batchgrantinput)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [BatchGrantResult](#schema-batchgrantresult)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`VERSION_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[GrantResult](#schema-grantresult), [Subject](#schema-subject)。

<a id="api-a04"></a>

### A04 用户可使用物理模型与来源

`GET /api/v1/model-access/users/{user_id}/accessible-models`；operationId：`modelAccessV14A04`。

权限：`identity.users:READ,model.permissions:READ`。

业务、并发与事务规则：用户及模型有效性与三源并集；用户管理范围过滤；不是数据面check-permission

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `user_id`         | string  | 是   | 否   | format="uuid"                          | 当前可管理用户UUID                                 |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                      |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [AccessibleModelPage](#schema-accessiblemodelpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[AccessibleModel](#schema-accessiblemodel)。

<a id="api-a05"></a>

### A05 用户直接物理模型授权

`GET /api/v1/model-access/users/{user_id}/model-grants`；operationId：`modelAccessV14A05`。

权限：`identity.users:READ,model.permissions:READ`。

业务、并发与事务规则：新模型模块提供身份页面直接授权视图；只读取该主体直接关系；模型ID语义切为物理模型

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `user_id`         | string  | 是   | 否   | format="uuid"                          | 当前可管理用户UUID                                 |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                      |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [SubjectGrantPage](#schema-subjectgrantpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[ModelAuthorizationSummary](#schema-modelauthorizationsummary)。

<a id="api-a06"></a>

### A06 保存用户直接授权

`PUT /api/v1/model-access/users/{user_id}/model-grants`；operationId：`modelAccessV14A06`。

权限：`identity.users:WRITE,model.permissions:WRITE`。

业务、并发与事务规则：同一新grants库和范围策略；CAS新表 ma_grant_state.revision 对应 authorization_version，更新各受影响模型grant_version；混合增删前端确认；authorization_version 只保护直接关系集合，任意模型直接授权变更均推进；身份成员/部门变化不推进，但保存必须现时重校验范围/主体状态。粗粒度冲突允许重新读取。；只对本次新增直授模型要求当前ACTIVE或PENDING_REVIEW；已存在的非ACTIVE直接关系允许保留或撤销，不因候选筛选而默删；保存按实际增删差异验证，不能把未出现在候选的既有授权当作无效。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `user_id`         | string | 是   | 否   | format="uuid"                          | 当前可管理用户UUID                                                                           |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [SubjectGrantReplace](#schema-subjectgrantreplace)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [SubjectGrantResult](#schema-subjectgrantresult)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`VERSION_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：无。

<a id="api-a07"></a>

### A07 部门直接物理模型授权

`GET /api/v1/model-access/departments/{department_id}/model-grants`；operationId：`modelAccessV14A07`。

权限：`identity.users:READ,model.permissions:READ`。

业务、并发与事务规则：新模型模块提供身份页面直接授权视图；只读取该主体直接关系；模型ID语义切为物理模型

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `department_id`   | string  | 是   | 否   | format="uuid"                          | 当前可管理部门UUID                                 |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                      |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [SubjectGrantPage](#schema-subjectgrantpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[ModelAuthorizationSummary](#schema-modelauthorizationsummary)。

<a id="api-a08"></a>

### A08 保存部门直接授权

`PUT /api/v1/model-access/departments/{department_id}/model-grants`；operationId：`modelAccessV14A08`。

权限：`identity.users:WRITE,model.permissions:WRITE`。

业务、并发与事务规则：同一新grants库和范围策略；CAS新表 ma_grant_state.revision 对应 authorization_version，更新各受影响模型grant_version；混合增删前端确认；authorization_version 只保护直接关系集合，任意模型直接授权变更均推进；身份成员/部门变化不推进，但保存必须现时重校验范围/主体状态。粗粒度冲突允许重新读取。；只对本次新增直授模型要求当前ACTIVE或PENDING_REVIEW；已存在的非ACTIVE直接关系允许保留或撤销，不因候选筛选而默删；保存按实际增删差异验证，不能把未出现在候选的既有授权当作无效。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `department_id`   | string | 是   | 否   | format="uuid"                          | 当前可管理部门UUID                                                                           |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [SubjectGrantReplace](#schema-subjectgrantreplace)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [SubjectGrantResult](#schema-subjectgrantresult)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`VERSION_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：无。

<a id="api-a09"></a>

### A09 用户组直接物理模型授权

`GET /api/v1/model-access/groups/{group_id}/model-grants`；operationId：`modelAccessV14A09`。

权限：`identity.groups:READ,model.permissions:READ`。

业务、并发与事务规则：新模型模块提供身份页面直接授权视图；只读取该主体直接关系；模型ID语义切为物理模型

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `group_id`        | string  | 是   | 否   | format="uuid"                          | 当前可管理用户组UUID                               |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                      |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [SubjectGrantPage](#schema-subjectgrantpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[ModelAuthorizationSummary](#schema-modelauthorizationsummary)。

<a id="api-a10"></a>

### A10 保存用户组直接授权

`PUT /api/v1/model-access/groups/{group_id}/model-grants`；operationId：`modelAccessV14A10`。

权限：`identity.groups:WRITE,model.permissions:WRITE`。

业务、并发与事务规则：同一新grants库和范围策略；CAS新表 ma_grant_state.revision 对应 authorization_version，更新各受影响模型grant_version；混合增删前端确认；authorization_version 只保护直接关系集合，任意模型直接授权变更均推进；身份成员/部门变化不推进，但保存必须现时重校验范围/主体状态。粗粒度冲突允许重新读取。；只对本次新增直授模型要求当前ACTIVE或PENDING_REVIEW；已存在的非ACTIVE直接关系允许保留或撤销，不因候选筛选而默删；保存按实际增删差异验证，不能把未出现在候选的既有授权当作无效。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `group_id`        | string | 是   | 否   | format="uuid"                          | 当前可管理用户组UUID                                                                         |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [SubjectGrantReplace](#schema-subjectgrantreplace)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [SubjectGrantResult](#schema-subjectgrantresult)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`VERSION_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：无。

<a id="api-a11"></a>

### A11 用户授权来源事实

`GET /api/v1/model-access/users/{user_id}/model-grant-sources`；operationId：`modelAccessV14A11`。

权限：`identity.users:READ,model.permissions:READ`。

业务、并发与事务规则：可包含当前不可用模型并标原因，保留原始事实；不扩大用户查看范围

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `user_id`         | string  | 是   | 否   | format="uuid"                          | 当前可管理用户UUID                                 |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                      |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [AccessibleModelPage](#schema-accessiblemodelpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[AccessibleModel](#schema-accessiblemodel)。

<a id="api-a12"></a>

### A12 模型授权可选主体

模型详情组下拉新增可选查询字段 `use_case`：仅接受 `MODEL_DETAIL` 且subject_type必须USER_GROUP；省略保留原范围。该用途返回全部组，默认每页20、上限100，total与搜索同范围；不展开成员。空/重复参数400，非法枚举或主体组合422。权限仍为model.permissions READ，可写标志来自对应WRITE。

`GET /api/v1/model-access/model-permission-subjects`；operationId：`modelAccessV14A12`。

权限：`model.permissions:READ OR model.permissions:WRITE`。

业务、并发与事务规则：服务端会话范围，拒绝任意scope根；仅返回可供当前操作选择主体；不含system或PROJECT；DEPARTMENT无q时按parent_id逐层分页，未传parent_id返回可见根；有q时跨当前可见子树搜索，行带ancestors用于定位，禁止与parent_id混用。USER支持department_id+q并含username；USER_GROUP忽略部门含义但无关参数应拒绝。选中回显使用已授权Grant.subject_name或合法候选，不任意按ID扩权查人。；部门同级按身份sort_order、id升序；用户/组按名称及稳定ID升序。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                                 | 参数说明                                                                                                           |
| ------ | ----------------- | ------- | ---- | ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| query  | `use_case`        | string  | 否   | 否   | enum=["MODEL_DETAIL"]                     | 仅USER_GROUP可用；详情全局候选，省略保持原范围。                                                                   |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                      | 页码，从 1 开始；省略为 1。                                                                                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100        | 每页条数，省略 20，上限 100。                                                                                      |
| query  | `subject_type`    | string  | 是   | 否   | enum=["DEPARTMENT", "USER_GROUP", "USER"] | 主体类型 DEPARTMENT/USER_GROUP/USER；候选查询必填。                                                                |
| query  | `q`               | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则    | 可选搜索关键字；供应商按名称/API地址/备注，模型按两类模型ID/说明，授权主体按显示名。去首尾空白；空字符串等同未传。 |
| query  | `department_id`   | string  | 否   | 否   | format="uuid"                             | 在当前会话范围内进一步限定部门；不能替代权限范围根。                                                               |
| query  | `parent_id`       | string  | 否   | 否   | format="uuid"                             | 仅DEPARTMENT树浏览可用；省略返回可见子树根，带q时不能同时传parent_id。真实范围外父部门不返回。                     |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则    | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                                                 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [SubjectViewPage](#schema-subjectviewpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[SubjectView](#schema-subjectview)。

<a id="api-a13"></a>

### A13 主体模型授权可选模型

`GET /api/v1/model-access/model-permission-models`；operationId：`modelAccessV14A13`。

权限：`(model.permissions:READ OR model.permissions:WRITE) AND 对应identity主体READ或WRITE`。

业务、并发与事务规则：按subject_type同时校验USER/DEPARTMENT对应identity.users、USER_GROUP对应identity.groups的READ或WRITE之一，以及model.permissions READ或WRITE之一和当前主体/模型管理范围。仅返回ACTIVE或PENDING_REVIEW、未由该主体直接授权的模型；部门/组继承不等于该主体直授，不据此错误排除。无需models:READ，不返回模型完整配置/价格。保存仍现时校验；不可见主体统一404。；按model_id_at_gateway、id稳定升序。；新增状态限制仅用于主体页面本次新增候选，不限制M03初始授权/A02模型侧DRAFT授权，且不影响已有非ACTIVE关系的展示、保留和撤销。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                                 | 参数说明                                               |
| ------ | ----------------- | ------- | ---- | ---- | ----------------------------------------- | ------------------------------------------------------ |
| query  | `subject_type`    | string  | 是   | 否   | enum=["DEPARTMENT", "USER_GROUP", "USER"] | 当前要编辑直接模型授权的主体类型                       |
| query  | `subject_id`      | string  | 是   | 否   | format="uuid"                             | 必须在当前身份管理范围，不能用任意ID浏览其他主体的候选 |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                      | 页码，从 1 开始；省略为 1。                            |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100        | 每页条数，省略 20，上限 100。                          |
| query  | `q`               | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则    | 只在本用途允许的候选集合内搜索，空字符串视为未筛选     |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则    | 当前用户偏好的支持语言；省略时按现有会话语言协商。     |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [ModelAuthorizationSummaryPage](#schema-modelauthorizationsummarypage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[ModelAuthorizationSummary](#schema-modelauthorizationsummary)。

<a id="api-a14"></a>

### A14 批量添加用户直接授权

`POST /api/v1/model-access/users/{user_id}/model-grants/add`；operationId：`modelAccessV14A14`。

权限：`model.permissions:WRITE AND identity.users:WRITE`，目标用户及模型在当前可管理范围；完整会话、Origin、CSRF、整批幂等校验继续执行。

请求：路径 `user_id` 为目标用户 UUID；必填请求头 `X-CSRF-Token`、`Idempotency-Key`，媒体类型 `application/json`。请求体见 [UserGrantDelta](#schema-usergrantdelta)。只添加指定模型的 USER 直授，不覆盖其他直授，不修改部门、组继承。

一个请求同一用户、同一动作，1～100 个物理模型，整个请求一个事务。对象、范围、版本及所有本次新增的模型状态有任一不满足，则全部回滚。真正新增要求模型 ACTIVE 或 PENDING_REVIEW；已有非 ACTIVE 直授仍允许无变化成功。继承模型可再直授；停用、冻结用户沿现主体配置规则仍可管理直授，不代表立即可调用。

成功：HTTP **200**，`data` 见 [UserGrantDeltaResult](#schema-usergrantdeltaresult)。所有项 `direct_granted=true`，是否实变由各项 `changed` 表示。

新命令先校验 `expected_authorization_version`，即使全批可无变化，旧版本仍返回 409。至少一项实变时全局授权版本仅加 1，各实变模型授权版本各加 1；全批无变化不推进。相同幂等命令返回原整批回执；目标用户、模型集、期望版本或原因改变则幂等冲突，模型集合换序不改变规范语义。

错误：沿公共会话、对象、权限及输入边界；额外关注 `409 VERSION_CONFLICT / IDEMPOTENCY_CONFLICT / IDEMPOTENCY_IN_PROGRESS / OPERATION_RESULT_UNKNOWN`、`422 VALIDATION_FAILED`（含本次新增既非 ACTIVE 也非 PENDING_REVIEW、UUID 重复、项数不合规）、`503 COMMAND_HMAC_KEY_UNAVAILABLE`。合法 JSON 的类型、未知键及约束不合规返回 422；JSON 语法或超过 64 KiB 返回 400。没有部分成功结果。

<a id="api-a15"></a>

### A15 批量撤销用户直接授权

`POST /api/v1/model-access/users/{user_id}/model-grants/remove`；operationId：`modelAccessV14A15`。

路径、权限、请求头、请求体、整批原子性、严格版本及幂等规则与 A14 相同。仅按 `目标用户 + physical_model_id` 撤销 USER 关系，不接受部门/组关系 ID；未提交模型及继承关系保持。暂停、退役等非 ACTIVE 模型和停用/冻结用户允许撤销。对象仍存在且可管理但无该用户直授时，无变化成功；用户/模型不存在或不可见仍为 404，不能伪装成无变化。

成功：HTTP **200**，`data` 见 [UserGrantDeltaResult](#schema-usergrantdeltaresult)，所有项 `direct_granted=false`。false 只表示本用户直授不存在，仍可能由继承访问。错误沿 A14 的公共规则，不要求撤销目标模型 ACTIVE。成功后刷新 A04/A11、用户详情两计数及候选，不能用 `changed_count` 直接加减模型数量。

<a id="api-r01"></a>

### R01 价格历史

`GET /api/v1/model-access/models/{model_id}/pricing`；operationId：`modelAccessV14R01`。

权限：`model.pricing:READ`。

业务、并发与事务规则：模型删除后历史物理删除；旧费用在审计中含完整快照；价格读取的指标名/单位标签/创建人来自该版本display_snapshot，当前高亮比较R03.price_version或Model.versions.price，不向当前用户或目录追问历史。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string  | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID       |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                      |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [PricingVersionPage](#schema-pricingversionpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[PricingVersion](#schema-pricingversion)。

<a id="api-r02"></a>

### R02 保存新价格版本

`POST /api/v1/model-access/models/{model_id}/pricing`；operationId：`modelAccessV14R02`。

权限：`model.pricing:WRITE`。

业务、并发与事务规则：保存ENTERPRISE_CUSTOM新版本；expected_price_version仍控制并发。catalog_price_version_id省略继承当前参考、显式null清除；相同旧参考可保留历史批次，新选参考必须匹配实例固定批次及可信型号。服务端币种/指标，分时无重叠且恰一兜底；仅新发送使用新价，历史显示/来源从本版本快照读取，不查当前目录重释。 提交pricing时currency必填，是当前预算币种断言，变化409 BILLING_CURRENCY_CHANGED；明确保存新企业价，不自动将官方原币改标或换汇。pricing_basis冻结依据及完整原币参考，后续改价为ENTERPRISE_CONFIGURED。 后续保存含恢复默认均为ENTERPRISE_CUSTOM/ENTERPRISE_CONFIGURED；默认及官方参考各自按PricingInput继承/清除/新选规则保留完整快照，不能因目录更新替换当前值。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [PricingInput](#schema-pricinginput)。

成功：HTTP **201**，封装字段见 §1.1；`data` 完整字段见 [PricingVersion](#schema-pricingversion)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`VERSION_CONFLICT`、`CURRENCY_MISMATCH`、`PRICE_RULE_INVALID`、`METRIC_UNSUPPORTED`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`、`BILLING_CURRENCY_CHANGED`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[CatalogBinding](#schema-catalogbinding), [IdentitySnapshot](#schema-identitysnapshot), [PricePeriodDisplay](#schema-priceperioddisplay), [PricePeriodInput](#schema-priceperiodinput)。

<a id="api-r03"></a>

### R03 当前价格及适配计量规格

> **40修订设计（未实施）**：空接口DRAFT返回state=UNPRICED、unpriced_reason=INTERFACES_NOT_CONFIGURED、无当前价；不调用严格非空profile，不把空接口等同无可计量能力。只读不建价。

`GET /api/v1/model-access/models/{model_id}/pricing/current`；operationId：`modelAccessV14R03`。

权限：`model.pricing:READ`。

业务、并发与事务规则：读取模型实际当前价格，不从当前目录价覆盖。已有BUILT_IN和企业价都独立固化；无价返回UNPRICED/null；返回指标来自当前执行所适用的固定规格，价格参考可能为旧批次且不表示仍适配，币种/指标按实际校验。 完整返回当前价的catalog_default_price_version_id及pricing_basis.default_reference；无引用为null。恢复默认另读取M14；不把当前价伪装为默认，也不通过读取触发改价。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID       |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [CurrentPricing](#schema-currentpricing)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[MetricSpec](#schema-metricspec), [PricingVersion](#schema-pricingversion)。

<a id="api-b01"></a>

### B01 读取余额查询配置

`GET /api/v1/model-access/providers/{provider_id}/balance-config`；operationId：`modelAccessV14B01`。

权限：`model.providers:READ`。

业务、并发与事务规则：未配置时返回version=0、mode=NONE、query_config={}、secrets已配置键为空、alert_enabled=false；首次保存携expected_version=0。；CUSTOM 支持 DIRECT 单余额字段或 SUBTRACT 总额减已用，认证只 NONE/BEARER/HEADER；币种自定义创建默认 CNY，与内部币种独立。；recipient_users提供完整已选安全回显；不可见项只保留配置中原已知ID与通用不可用占位，不补查身份资料。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [BalanceConfig](#schema-balanceconfig)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[BalanceQueryConfig](#schema-balancequeryconfig), [BalanceRecipientDisplay](#schema-balancerecipientdisplay), [Decimal](#schema-decimal)。

<a id="api-b02"></a>

### B02 保存余额配置

`PUT /api/v1/model-access/providers/{provider_id}/balance-config`；operationId：`modelAccessV14B02`。

权限：`model.providers:WRITE`。

业务、并发与事务规则：expected_version必填；配置保存不隐式查询；独立币种；阈值启用必须>0；CUSTOM 支持 DIRECT 单余额字段或 SUBTRACT 总额减已用，认证只 NONE/BEARER/HEADER；币种自定义创建默认 CNY，与内部币种独立。；保存的余额配置 channels 含 EMAIL 时所有接收者须有有效邮箱，否则422字段错误；本版不投递。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                                                           |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [BalanceConfigUpdate](#schema-balanceconfigupdate)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [BalanceConfig](#schema-balanceconfig)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`VERSION_CONFLICT`、`BALANCE_CONFIG_INVALID`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[BalanceQueryConfig](#schema-balancequeryconfig), [BalanceRecipientDisplay](#schema-balancerecipientdisplay), [Decimal](#schema-decimal), [SecretInput](#schema-secretinput)。

<a id="api-b03"></a>

### B03 手动查询供应商余额

`POST /api/v1/model-access/providers/{provider_id}/balance-query`；operationId：`modelAccessV14B03`。

权限：`model.providers:WRITE`。

业务、并发与事务规则：空JSON对象；独立在途任务；用B05按run_id读确定终态，再B04刷新；不推理不投递邮件

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                                                           |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填空 JSON 对象 `{}`，不接受其他键。

成功：HTTP **202**，封装字段见 §1.1；`data` 完整字段见 [BalanceQueryReceipt](#schema-balancequeryreceipt)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`BALANCE_QUERY_DISABLED`、`OPERATION_BUSY`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：无。

<a id="api-b04"></a>

### B04 最近余额和监控状态

`GET /api/v1/model-access/providers/{provider_id}/balance`；operationId：`modelAccessV14B04`。

权限：`model.providers:READ`。

业务、并发与事务规则：失败保留旧值/成功时间与最近失败状态；GET不触发上游

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [BalanceState](#schema-balancestate)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[Decimal](#schema-decimal), [ErrorParams](#schema-errorparams)。

<a id="api-b05"></a>

### B05 读取本次余额查询结果

`GET /api/v1/model-access/providers/{provider_id}/balance-queries/{run_id}`；operationId：`modelAccessV14B05`。

权限：`model.providers:READ`。

业务、并发与事务规则：run_id必须属于path供应商；终态确定，不混用上次query_status；GET不触发查询

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                 |
| path   | `run_id`          | string | 是   | 否   | format="uuid"                          | 本次余额查询任务UUID，必须属于路径供应商           |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [BalanceRun](#schema-balancerun)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[Decimal](#schema-decimal)。

<a id="api-b06"></a>

### B06 余额预警接收用户选项（含部门及子部门搜索）

`GET /api/v1/model-access/balance-recipient-options`；operationId：`modelAccessV14B06`。

权限：`model.providers:READ OR model.providers:WRITE`。

业务、并发与事务规则：满足providers READ或WRITE任一即可；最终只返回操作者现有用户管理范围内启用、非system用户。q同时匹配用户显示名/username/邮箱，或当前可见部门名称及该部门全部后代中的用户，二者OR；只在可见部门集合中做部门名命中，不能先全局搜索再泄露越界部门。可选department_id必须可见，不存在/不可见统一404；按department_closure包含该部门自身及全部子部门，与q和用户管理范围取AND交集，不提供关闭子部门的参数。按user_id去重后分页/计数，稳定按display_name/username/user_id排序；返回用户及现有department_id/name/path，不返回可选择部门对象。只保存具体recipient_user_ids，不保存部门选择或动态订阅；新增成员不自动加入已保存接收人。provider_id可见且selected_items仅补该配置原选用户，失效/越界通用占位不泄露身份存在性；搜索/翻页不能默删选中用户。保存仍重验启用、范围、system及EMAIL邮箱资格；身份变化不由搜索结果自动改配置。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                                           |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                                                                                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                                                                                      |
| query  | `q`               | string  | 否   | 否   | 无静态默认                             | 去首尾空白；空视为未筛选。用户显示名/username/邮箱命中，或可见部门名命中后的自身及全部子部门人员，结果取OR后去重。 |
| query  | `provider_id`     | string  | 否   | 否   | format="uuid"                          | 编辑现配置时可传，用该供应商已选ID补回当前页外selected_items；不能传任意selected_ids查询用户。                     |
| query  | `department_id`   | string  | 否   | 否   | format="uuid"                          | 显式可见部门筛选，包含自身及全部子部门；与q取AND，越界/不存在统一404。                                             |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                                                 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [BalanceRecipientOptionPage](#schema-balancerecipientoptionpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[BalanceRecipientDisplay](#schema-balancerecipientdisplay)。

<a id="api-m12"></a>

### M12 模型调用ID可用性检查

`GET /api/v1/model-access/model-options/model-id-availability`

权限：`model.models:WRITE；编辑排除自身另验当前对象管理范围及DRAFT状态`。

业务、并发与事务规则：先验证当前会话与model.models:WRITE；有exclude_model_id先校验对象可管理且为DRAFT，不存在/不可见统一404 NOT_FOUND，合法但非DRAFT为409 STATE_CONFLICT，再做占用查询。按固定Unicode White_Space集合去首尾空白，规范化后1～128码点；全局、区分大小写精确比较，合法排除自身；所有未物理删除状态均占用ID。仅返回规范化ID与available，不返回占用模型/供应商/部门/状态/数量或建议名。只读、不预留、不发检查令牌、不创建命令，Cache-Control:no-store。最终M03/M05/D02仍同规则校验并由数据库唯一约束兜底，竞争失败为409 NAME_CONFLICT。

| 位置   | 参数                  | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                                                                    |
| ------ | --------------------- | ------ | ---- | ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| query  | `model_id_at_gateway` | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 创建或编辑的候选调用ID。固定Unicode White_Space集合去首尾空白后，非空且不超过128码点；保留内部字符及大小写，不做NFC/NFKC。                  |
| query  | `exclude_model_id`    | string | 否   | 否   | format="uuid"                          | 仅编辑时传当前模型UUID；必须先通过该对象当前WRITE权限/管理范围及 DRAFT 或 RETIRED 状态检查。不存在或不可见统一404，不接受任意排除其他模型。 |
| header | `Accept-Language`     | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                                                                          |

请求体：无。

成功：HTTP 200，外层封装的 `data` 为 [ModelIdAvailability](#schema-modelidavailability)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`STATE_CONFLICT`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

所有响应返回`Cache-Control: no-store`；不要求Idempotency-Key，也不返回检查票据。

<a id="api-m13"></a>

### M13 独立价格准备（不再是D02前置，40修订）

`GET /api/v1/model-access/model-options/pricing-preparation`

权限：`model.models:WRITE及供应商模型用途范围；服务端metric_specs非空时另需model.pricing:READ，确空分支不需价格权限`。

业务、并发与事务规则：先验model.models:WRITE及实例模型用途范围，再解析完整适配metric_specs。确空时NOT_APPLICABLE，两个reference及prefill均null、origin=NONE，不读取价格且不需pricing:READ；非空另验pricing:READ，403不得解释为免费。实例固定批次、可信型号及接口范围共同确定产品默认和官方参考；不猜部署名。适用ENTERPRISE_DEFAULT完整规则优先预填（包括0及TIME_BASED），不与官方逐项拼价；没有默认才按可表达官方数字预填，再无默认且PRICE_UNAVAILABLE/NO_PUBLIC_PRICE才完整FIXED全0。无默认且UNSUPPORTED_RULE按F40-02预填完整FIXED全指标0并保留真实原因；存在但不完整/不兼容默认不能静默回退，返回目录错误。官方reference_state仍独立反映官方事实；有默认且官方复杂也能预填默认。默认和官方引用可同时冻结，首选官方币种按目录而非预算筛选。内部币种预算配置缺省CNY，默认数值模板亦按此解释，不换汇。【历史创建前置，40修订替代】原创建/导入必须显式提交完整pricing和返回的两个参考ID；新设计D02不提交非空pricing，M03不强制价格；独立手工价格保存仍须完整来源与权限校验。首次完整语义原样采用默认为BUILT_IN/ENTERPRISE_DEFAULT_CONFIRMED，修改默认为ENTERPRISE_CUSTOM/ENTERPRISE_CONFIGURED；无默认才沿官方确认或真实缺价0规则。无指标显式pricing=null且UNPRICED。保存重验provider_version、预算币种、固定批次、完整适配指标和来源；只读no-store，不预留、不写命令、不请求供应商。 默认时段名是产品模板文案：M13/M14的default_reference.periods[].name和内部预填按Accept-Language从固定批次period_name_labels投影，缺译用所属模板fallback_locale。官方参考时段名保持官方原文，管理员已保存的period.name保持确认原文，切语言不重命名既有内部价。

| 位置   | 参数                        | 类型                | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                            |
| ------ | --------------------------- | ------------------- | ---- | ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| query  | `provider_id`               | string              | 是   | 否   | format="uuid"                          | 必须可管理；不存在/越界统一404。                                                                    |
| query  | `model_id_at_provider`      | string              | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 纯手工和目录型号均必填；不从名称猜官方绑定。                                                        |
| query  | `supported_invocation_apis` | array&lt;string&gt; | 是   | 否   | 与路径同序，1 至 32 项                 | 使用重复 query 参数。标准协议不可重复。多个 `CUSTOM_PASSTHROUGH` 各配不同路径，本协议不产生计费项。 |
| query  | `upstream_paths`            | array&lt;string&gt; | 是   | 否   | 同序                                   | 重复 query 参数，逐项对应 supported_invocation_apis，允许不同协议共用相同路径。                     |
| query  | `catalog_model_version_id`  | string              | 否   | 否   | format="uuid"                          | 选择目录时回传，校验实例固定批次/模板和可信型号；不匹配拒绝。                                       |
| header | `Accept-Language`           | string              | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                                  |

请求体：无。

成功：HTTP 200，外层封装的 `data` 为 [PricingPreparation](#schema-pricingpreparation)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`CUSTOM_API_UNSUPPORTED`、`METRIC_UNSUPPORTED`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

所有响应`Cache-Control: no-store`；无Idempotency-Key、检查票据或预留。

<a id="api-m14"></a>

### M14 只读企业内置默认计价规则

`GET /api/v1/model-access/model-options/default-pricing`；operationId：`modelAccessV14M14`。

权限：`现有模型模式：model.pricing:READ及该模型价格管理范围；创建前模式：model.models:WRITE及实例模型用途范围，指标非空另需model.pricing:READ`。

业务、并发与事务规则：两种互斥模式：有model_id时只接受此query参数，其他query均不得混传；先验pricing:READ和该模型价格管理范围，从模型当前供应商/上游ID/启用接口/可信型号来源解析，不要求models READ/WRITE或providers权限。无model_id时provider_id和model_id_at_provider必填，接口参数合计至少一项，按M13先验models:WRITE/实例用途范围，指标非空另验pricing:READ，无指标分支无需价格权限。按实例模型用途范围、固定模板批次及可信型号读取产品/研发预置默认规则；参数与M13一致，至少一组有效协议路径对。先解析指标，确空返回NOT_APPLICABLE/空指标/两个价格对象null且不读价格；非空需pricing:READ，命中完整适配默认返回AVAILABLE及default_reference和内部币种预填，未配置/未可信匹配为NOT_CONFIGURED。默认版本损坏/不兼容不得当未配置，返回目录错误。只读取price_kind=ENTERPRISE_DEFAULT，不读取官方价格、不自动回退官方或免费；M13提供手工价格准备；D03/C01内部采用40规定的自动初始化优先级。内部币种来自预算缺省CNY，时区Asia/Shanghai，默认为数值模板；手工改价需管理员明确保存，D03/C01按40受控自动应用，不要求另行确认。无写接口/管理后台；目录更新不改已有实例、自定义价或历史费用。no-store、不预留、不写命令、不请求供应商。 现有模型模式prefill.expected_price_version取读取时当前价格版本，官方参考键从prefill省略以在R02/M05保留既有参考；创建前模式为0且官方参考null，仅主动在M03提交价格时使用M13准备；D02不以M13为前置。两种模式返回model_id（创建前null），保存仍现时重验版本和币种。 默认时段名是产品模板文案：M13/M14的default_reference.periods[].name和内部预填按Accept-Language从固定批次period_name_labels投影，缺译用所属模板fallback_locale。官方参考时段名保持官方原文，管理员已保存的period.name保持确认原文，切语言不重命名既有内部价。

| 位置   | 参数                        | 类型                | 必填         | 可空 | 默认/限制                              | 参数说明                                                                                                                             |
| ------ | --------------------------- | ------------------- | ------------ | ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| query  | `model_id`                  | string              | 条件，见模式 | 否   | format="uuid"                          | 已有模型价格页读取默认用此模式；只校验pricing:READ及该模型价格管理范围，无需models READ/WRITE或providers权限；不存在/不可见统一404。 |
| query  | `provider_id`               | string              | 条件，见模式 | 否   | format="uuid"                          | 无model_id的创建前模式必填；有model_id时禁止提交。必须可管理；不存在/越界统一404。                                                   |
| query  | `model_id_at_provider`      | string              | 条件，见模式 | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 无model_id的创建前模式必填；有model_id时禁止提交。纯手工和目录型号均必填；不从名称猜官方绑定。                                       |
| query  | `supported_invocation_apis` | array&lt;string&gt; | 条件，见模式 | 否   | 与路径同序，1 至 32 项                 | 创建前模式必传，用重复 query 参数。标准协议不可重复。多个 `CUSTOM_PASSTHROUGH` 各配不同路径，本协议不产生计费项。                    |
| query  | `upstream_paths`            | array&lt;string&gt; | 条件，见模式 | 否   | 同序                                   | 仅创建前模式可传；有model_id时禁止提交。重复 query 参数，逐项对应 supported_invocation_apis，允许不同协议共用相同路径。              |
| query  | `catalog_model_version_id`  | string              | 条件，见模式 | 否   | format="uuid"                          | 仅创建前模式可传；有model_id时禁止提交。选择目录时回传，校验实例固定批次/模板和可信型号；不匹配拒绝。                                |
| header | `Accept-Language`           | string              | 否           | 否   | 按现有语言协商                         | 当前用户偏好；省略按会话语言，按固定版本fallback_locale回退。                                                                        |

请求体：无。创建前模式没有model_id，provider_id/model_id_at_provider必填、至少一组有效协议路径对；现有模型模式仅model_id，禁止混传其他query。

成功：HTTP200，`data`为[DefaultPricingPreparation](#schema-defaultpricingpreparation)。AVAILABLE/NOT_CONFIGURED/NOT_APPLICABLE不混用；不能从403或目录故障推导免费。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`CUSTOM_API_UNSUPPORTED`、`METRIC_UNSUPPORTED`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`。

所有响应`Cache-Control: no-store`；无Idempotency-Key/票据/预留。创建/导入调用M13已包含默认优先结果，无需先单独调用M14；现有价格页恢复默认才使用model_id模式，再明确保存R02或M05。

## 4. 全部请求与响应字段组件

阅读规则：必填表示该对象中必须出现此键；可空与必填相互独立。`[组件名]` 跳转到其完整字段表；内联对象在当前表以点路径展开。所有未标静态默认的响应字段由实际事实计算；请求可省略字段按 §5 的语义处理，不能由前端猜默认值。

<a id="schema-decimal"></a>

### Decimal

精确十进制字符串；禁止JSON number，不接受NaN/Infinity/指数

类型：string；约束：pattern="^-?(0\|[1-9][0-9]*)(\\.[0-9]+)?$"。

<a id="schema-subject"></a>

### Subject

授权主体输入

| 字段           | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                             | 约束                                      |
| -------------- | --------- | ---- | ---- | ------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `subject_type` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 授权主体类型：部门、用户组或用户；本版不开放 PROJECT | enum=["DEPARTMENT", "USER_GROUP", "USER"] |
| `subject_id`   | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                             | format="uuid"                             |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-subjectview"></a>

### SubjectView

当前操作者可见且可选择的身份主体

| 字段                        | 类型/组件           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                 | 约束                                      |
| --------------------------- | ------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| `subject_type`              | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 授权主体类型：部门、用户组或用户；本版不开放 PROJECT                     | enum=["DEPARTMENT", "USER_GROUP", "USER"] |
| `subject_id`                | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                 | format="uuid"                             |
| `name`                      | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 显示名，按当前管理视图返回                                               | 无额外格式限制；仍遵守所属组件业务规则    |
| `department_path`           | string / null       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 当前可见范围内的部门显示路径；无部门或不可提供时为 null                  | 无额外格式限制；仍遵守所属组件业务规则    |
| `manageable`                | boolean             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前操作者可修改，不代表用户数据面权限                                   | 无额外格式限制；仍遵守所属组件业务规则    |
| `username`                  | string / null       | 是   | 是   | 无静态默认；省略语义见组件/接口 | USER才适用，不能通过ID补查越界用户                                       | 无额外格式限制；仍遵守所属组件业务规则    |
| `parent_id`                 | string / null       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 可见子树根或非部门为null，不返回范围外真实父ID                           | 无额外格式限制；仍遵守所属组件业务规则    |
| `has_children`              | boolean             | 是   | 否   | 无静态默认；省略语义见组件/接口 | DEPARTMENT是否还有当前可见子部门；其他主体false，不代表范围外子节点      | 无额外格式限制；仍遵守所属组件业务规则    |
| `ancestors`                 | array&lt;object&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | DEPARTMENT搜索时返回范围内定位链；列表其他模式可[]；不得从路径文本构造树 | 无额外格式限制；仍遵守所属组件业务规则    |
| `ancestors[].department_id` | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 可见祖先部门UUID                                                         | format="uuid"                             |
| `ancestors[].name`          | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 可见祖先部门显示名                                                       | 无额外格式限制；仍遵守所属组件业务规则    |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-customapiinput"></a>

### CustomAPIInput

> 历史双数组的行字段。当前模型配置见 [InvocationAPIInput](#schema-invocationapiinput)。

| 字段       | 类型   | 必填 | 说明                                                            |
| ---------- | ------ | ---- | --------------------------------------------------------------- |
| `protocol` | string | 是   | 启用协议标识，与 `supported_invocation_apis` 同一位置的值一致。 |
| `path`     | string | 是   | 已配置相对上游路径。必须以 `/` 开头且不含空白。                 |

<a id="schema-invocationapiinput"></a>

### InvocationAPIInput

| 字段       | 类型        | 必填 | 可空 | 说明                                                                                                                                                                         |
| ---------- | ----------- | ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | string UUID | 否   | 否   | M05、D03 和 C05 可用当前模型已有配置行的 ID，且 `protocol` 必须与该行原协议一致。修改路径或排序保留 ID；切换协议按移除旧行并新增无 ID 行处理。新增行或调用 M03、D02 时省略。 |
| `protocol` | string      | 是   | 否   | 标准协议标识或 `CUSTOM_PASSTHROUGH`。每个标准协议在同一模型内只允许一行。                                                                                                    |
| `path`     | string      | 是   | 否   | 标准协议的出站路径，或透传的网关入站路径及相对供应商 base_url 的上游后缀。透传路径在同一模型内唯一。                                                                         |

路径长度为 1 至 2048 字节，以 `/` 开头，不能包含主机、查询串、片段、占位符、空白、控制符、反斜杠、路径段 `.` 或 `..`，也不能通过百分号编码引入分隔符或规避校验。透传使用可原样发送的转义路径，包含供应商 API 地址中的部署前缀，例如供应商地址 `https://upstream.example/deploy` 使用 `/deploy/v1/custom/rerank`。配置不能匹配任何标准入站路由。未声明字段会被拒绝。

显式 ID 的归属或协议不匹配时返回 `NOT_MODEL_INVOCATION`。M05 的字段路径为 `base.invocation_apis[i].id`，D03 单行结果和 C05 使用 `invocation_apis[i].id`。C05 仅预检，不保存或删除配置；完整数组替换在 M05 或 D03 实际保存时生效。

<a id="schema-invocationapi"></a>

### InvocationAPI

InvocationAPI 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                   | 类型/组件     | 必填 | 可空 | 默认/省略                       | 字段说明                                                                   | 约束                                                |
| ---------------------- | ------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| `id`                   | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                   | format="uuid"                                       |
| `protocol`             | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 启用协议标识                                                               | 无额外格式限制；仍遵守所属组件业务规则              |
| `path`                 | string        | 是   | 否   | 无静态默认                      | 标准协议的出站路径，或透传的网关入站路径及相对供应商 base_url 的上游后缀。 | 同 [InvocationAPIInput](#schema-invocationapiinput) |
| `adapter_key`          | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 只读适配键                                                                 | 无额外格式限制；仍遵守所属组件业务规则              |
| `adapter_revision`     | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端适配器规格版本，保证历史可追溯                                       | 无额外格式限制；仍遵守所属组件业务规则              |
| `streaming_applicable` | boolean       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 此接口是否适用流式检查；须结合模型流式标签                                 | 无额外格式限制；仍遵守所属组件业务规则              |
| `applicability_reason` | string / null | 否   | 是   | 无静态默认；省略语义见组件/接口 | 接口不适用原因码；适用时可为空                                             | 无额外格式限制；仍遵守所属组件业务规则              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-healthinput"></a>

### HealthInput

HealthInput 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                            | 类型/组件 | 必填 | 可空 | 默认/省略 | 字段说明                                                   | 约束                                   |
| ------------------------------- | --------- | ---- | ---- | --------- | ---------------------------------------------------------- | -------------------------------------- |
| `auto_health_check`             | boolean   | 是   | 否   | false     | 自动健康检查开关；只有 ACTIVE 模型会被调度                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `health_check_interval_minutes` | integer   | 是   | 否   | 360       | 自动健康检查周期（分钟），只允许 60/360/720/1440，默认 360 | enum=[60, 360, 720, 1440]              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-secretinput"></a>

### SecretInput

模板允许的秘密字段；仅请求输入，不回显。空字符串保留原值；清除走clear_secret_fields

动态键值：string。键的具体白名单、条件与权限按组件说明校验。

<a id="schema-dynamicfield"></a>

### DynamicField

DynamicField 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                | 类型/组件                                                    | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                    | 约束                                                                                        |
| ------------------- | ------------------------------------------------------------ | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `key`               | string                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端注册的稳定字段或模板键                                                                | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `label`             | string                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按Accept-Language翻译                                                                       | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `value_type`        | string                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 字段输入值类型；SECRET 值只写不回显                                                         | enum=["STRING", "INTEGER", "BOOLEAN", "SECRET", "JSON"]                                     |
| `required`          | boolean                                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否无条件必填；条件必填另由 required_when 表达                                             | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `required_when`     | array&lt;[FieldCondition](#schema-fieldcondition)&gt; / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | null 表示没有条件规则；required=true 时无条件必填                                           | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `default`           | [JsonValue](#schema-jsonvalue)                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模板给出的默认值；null 表示不设默认，不代表自动清空现值                                     | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `options`           | array&lt;[DisplayOption](#schema-displayoption)&gt;          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 动态下拉/单选的选项；空数组表示自由输入或无选项                                             | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `description`       | string                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按Accept-Language从当前实例固定模板版本description_labels投影的帮助说明；不是管理员实例值。 | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `validation_schema` | [FieldValidationSchema](#schema-fieldvalidationschema)       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 字段完整校验结构；具体配置实例按模板发布，不能由客户端改写                                  | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `visible_when`      | array&lt;[FieldCondition](#schema-fieldcondition)&gt; / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | null表示始终可见；隐藏字段不得沿用其不再适用的秘密                                          | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `control`           | string                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 前端表单控件；STRING仍可按本字段选择单行/多行，SECRET不回显                                 | enum=["TEXT", "PASSWORD", "TEXTAREA", "SELECT", "RADIO", "NUMBER", "SWITCH", "JSON_EDITOR"] |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-template"></a>

### Template

Template 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                              | 类型/组件                                                 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                 | 约束                                   |
| --------------------------------- | --------------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `key`                             | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端注册的稳定字段或模板键                                                                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `name`                            | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前固定模板版本的本地化显示名称；按Accept-Language/会话语言协商及版本fallback_locale回退。                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `revision`                        | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 数据库目录发布批次的可读revision；不可变，与template_version_id所指行一致                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `enabled`                         | boolean                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否可用于当前新建/新绑定；由当前数据库发布批次、模板能力和后端适配代码共同判定。旧实例回读可为false，但不据此禁止该实例按原模板普通编辑 | 无额外格式限制；仍遵守所属组件业务规则 |
| `unavailable_reason`              | string / null                                             | 否   | 是   | 无静态默认；省略语义见组件/接口 | 当前模板不可用于创建实例的功能原因码，可用时为 null；不返回研发排期、批准延期或项目评审信息                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `default_base_url`                | string / null                                             | 否   | 是   | 无静态默认；省略语义见组件/接口 | 模板建议的完整 Base URL；需管理员填时为 null                                                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `auth_modes`                      | array&lt;[DisplayOption](#schema-displayoption)&gt;       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该模板的可选认证方式；如SIGV4的标签为运行环境IAM凭证，不要求前端猜值                                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `fields`                          | array&lt;[DynamicField](#schema-dynamicfield)&gt;         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该模板允许的动态配置及认证字段规格数组，包含字段类型、显示与校验条件；秘密字段只用于输入，不回显秘密值                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `suggested_invocation_apis`       | array&lt;string&gt;                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 建议启用的标准接口，不能据此替代模型实际能力确认                                                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `balance_template_supported`      | boolean                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前模板是否提供已适配余额查询方案                                                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `balance_fields`                  | array&lt;[DynamicField](#schema-dynamicfield)&gt;         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 余额模板的独立配置字段，不能当推理凭据复用                                                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `notification_delivery_supported` | boolean                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前系统是否具备余额通知投递能力；本版按已确认范围返回 false，不表示通知已发送，不是供应商可配置开关或研发进度                           | 无额外格式限制；仍遵守所属组件业务规则 |
| `icon_key`                        | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 受控模板图标键；前端从本地图标目录映射，未知用通用图标，不是任意远端URL                                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `balance_template_spec`           | [BalanceTemplateSpec](#schema-balancetemplatespec) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 模板未支持时null；仍可选择CUSTOM                                                                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_version_id`             | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 不可变模板版本行UUID；创建时回传，编辑不提交模板字段                                                                                     | format="uuid"                          |
| `catalog_release_id`              | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模板所属完整目录发布批次，与外层读取上下文一致                                                                                           | format="uuid"                          |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-conditionrow"></a>

### ConditionRow

一条原始编辑条件行；每行可勾选多个ISO星期，conditions数组位置为原始行序。时间左闭右开且start_minute<end_minute；跨午夜由前端显式拆行。整体规则禁止重叠；服务端不合并、拆分或按时间重排条件行。

| 字段           | 类型/组件            | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                               | 约束                                     |
| -------------- | -------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `weekdays`     | array&lt;integer&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一行勾选的ISO星期集合：1周一至7周日，非空、无null/重复，按周一至周日严格升序；点击先后不是业务顺序。 | minItems=1；maxItems=7；uniqueItems=true |
| `start_minute` | integer              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当天开始分钟，0 表示 00:00，区间含开始点                                                               | minimum=0；maximum=1439                  |
| `end_minute`   | integer              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当天结束分钟，1440 表示 24:00，区间不含结束点                                                          | minimum=1；maximum=1440                  |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-priceperiodinput"></a>

### PricePeriodInput

PricePeriodInput 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段           | 类型/组件                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                          | 约束                                   |
| -------------- | ------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `name`         | string                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                                                                                                                  | minLength=1；maxLength=128             |
| `is_fallback`  | boolean                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否兜底时段；每个价格版本恰好一个                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `conditions`   | array&lt;[ConditionRow](#schema-conditionrow)&gt;       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 有序原始条件行，每行支持多个weekdays；保存/读取保持行数、行分组和输入顺序，不合并或展开；兜底为空。非兜底至少一行，所有时段展开后的窗口不得重叠。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `metric_rates` | array&lt;[MetricRateInput](#schema-metricrateinput)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本时段全部已适配计价项，不得任意增删                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-pricinginput"></a>

### PricingInput

独立人工配置时提交的完整内部计价规则；40修订D02不接受非空pricing，M03可省略或null，主动配价才适用本组件。FIXED恰一个无条件fallback，TIME_BASED另有具名条件时段；适配指标及单位不可增删。currency是已展示预算币种的并发断言，不是自选币种或换汇请求。 periods及conditions数组保留输入顺序与分组；星期集合严格升序。完整编辑结构参与幂等摘要，同键只改行顺序或分组也为不同请求并返回409。首次默认来源判定可按展开后的计价语义比较，但不得用其规范化结果替换保存结构。

| 字段                               | 类型/组件                                                 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 约束                                   |
| ---------------------------------- | --------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `expected_price_version`           | integer                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 读取到的当前价格版本；首次无价为 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | minimum=0                              |
| `currency`                         | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 必填当前M13/R03展示的内部预算币种；总部未配置为CNY。服务端保存时重验，不同返回409 BILLING_CURRENCY_CHANGED，禁止把同一数字改解释为新币种。                                                                                                                                                                                                                                                                                                                                                                                                      | pattern="^[A-Z]{3}$"                   |
| `pricing_mode`                     | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 固定价 FIXED 或分时价 TIME_BASED                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | enum=["FIXED", "TIME_BASED"]           |
| `periods`                          | array&lt;[PricePeriodInput](#schema-priceperiodinput)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整计价时段；固定价恰一个兜底，分时价按规则设置。时段及其中conditions均按输入顺序保存/返回，保留每行weekdays集合；不合并或拆行。                                                                                                                                                                                                                                                                                                                                                                                                               | minItems=1                             |
| `reason`                           | string                                                    | 否   | 否   | 无静态默认；省略语义见组件/接口 | 本次改价原因，可省略，用于操作审计；不套用模型暂停或审核拒绝的前端必填规则                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | maxLength=512                          |
| `catalog_price_version_id`         | string / null                                             | 否   | 是   | 无静态默认；省略语义见组件/接口 | 独立官方参考UUID；首次M13返回官方参考仍须带准确ID，可与企业默认参考同时保存。后续R02/M05省略继承、null清除、新选须同固定批次/可信型号；保留同一旧参考允许历史批次。此字段不决定默认优先级，也不改变内部币种。                                                                                                                                                                                                                                                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_default_price_version_id` | string / null                                             | 否   | 是   | 无静态默认；省略语义见组件/接口 | 默认规则参考，不是可写source。首次M13返回default_reference时必须回传该准确ID；无默认传null。后续R02/M05省略继承、显式null清除，新选须同实例固定批次且可信型号/计量规格一致；保留当前价同一旧参考允许历史批次。提交完整规则后服务端判定是否仍完全等于默认，不能靠ID伪造BUILT_IN。 首次是否原样采用默认：先按is_fallback及规范化conditions定位对应时段，再比较完整指标/Decimal费率/模式；name可为该同一时段已发布的任一语言标签，同语言下时段标签发布时必须唯一，不能以当前请求语言变化误判自定义。非已发布别名或改规则/费率记ENTERPRISE_CUSTOM。 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-pricingversion"></a>

### PricingVersion

不可变内部价格版本。BUILT_IN为首次原样确认的适用产品默认（可非零/分时），或无默认且真实缺价的首次固定0；其他及后续保存均ENTERPRISE_CUSTOM。完整依据分别冻结默认/官方参考，目录发布不覆盖企业价格或历史费用。

| 字段                               | 类型/组件                                                     | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                          | 约束                                   |
| ---------------------------------- | ------------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `id`                               | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                          | format="uuid"                          |
| `physical_model_id`                | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                          | format="uuid"                          |
| `version`                          | integer                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                                                                                            | minimum=1                              |
| `source`                           | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端判定：40自动ENTERPRISE_DEFAULT_APPLIED/OFFICIAL_REFERENCE_APPLIED/ZERO_FALLBACK_APPLIED均BUILT_IN；旧CONFIRMED来源保留，管理员显式改价为ENTERPRISE_CUSTOM。 | enum=["BUILT_IN", "ENTERPRISE_CUSTOM"] |
| `currency`                         | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 创建该价格版本时固化的总部内部币种，未配置为CNY；不随后续总部配置变化重写                                                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `time_zone`                        | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | IANA 计费时区，与当前用户的显示时区区分                                                                                                                           | 无额外格式限制；仍遵守所属组件业务规则 |
| `pricing_mode`                     | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 固定价 FIXED 或分时价 TIME_BASED                                                                                                                                  | enum=["FIXED", "TIME_BASED"]           |
| `periods`                          | array&lt;[PricePeriodDisplay](#schema-priceperioddisplay)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该历史版本完整价格规则，不从当前模型目录补显示。时段及其中conditions均按输入顺序保存/返回，保留每行weekdays集合；不合并或拆行。                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `adapter_revision`                 | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端适配器规格版本，保证历史可追溯                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_revision`                 | string / null                                                 | 否   | 是   | 无静态默认；省略语义见组件/接口 | 仅官方catalog_binding对应的批次revision；无官方参考为空。默认规则版本独立在pricing_basis.default_reference中保存。                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `rounding`                         | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该版本固化的金额舍入规则，R02已确认HALF_EVEN；历史不随之后规则改变。                                                                                              | enum=["HALF_EVEN"]                     |
| `amount_scale`                     | integer                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该版本固化的Decimal金额小数位数，R02已确认18位。                                                                                                                  | const=18                               |
| `created_at`                       | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                                                                   | format="date-time"                     |
| `created_by`                       | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                          | format="uuid"                          |
| `created_by_display`               | [IdentitySnapshot](#schema-identitysnapshot)                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从display_snapshot.created_by读的当时创建人；原用户删改不影响历史                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_price_version_id`         | string / null                                                 | 是   | 是   | 无静态默认；省略语义见组件/接口 | 官方价格参考UUID；默认免费0为null，其他企业价可有参考。参考币种与内部currency允许不同，不表示换汇或等值。                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_binding`                  | [CatalogBinding](#schema-catalogbinding) / null               | 是   | 是   | 无静态默认；省略语义见组件/接口 | 仅官方参考的完整五键目录绑定；存在catalog_price_version_id时非空，无官方参考null。企业默认版本另由default_reference完整保存，两个引用允许追溯各自历史批次。       | 无额外格式限制；仍遵守所属组件业务规则 |
| `pricing_basis`                    | [PricingBasis](#schema-pricingbasis)                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部价形成依据及完整企业默认/官方原币参考双快照；创建后不可变。                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_default_price_version_id` | string / null                                                 | 是   | 是   | 无静态默认；省略语义见组件/接口 | 与pricing_basis.default_reference共同空或共同非空且ID一致；来源存在不代表内部费率仍等于默认。默认发布更新不重写此引用。                                           | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

条件组合约束（与机器契约一致，业务引用匹配仍由服务端事务校验）：

```json
{
  "allOf": [
    {
      "if": {
        "properties": {
          "source": {
            "const": "BUILT_IN"
          }
        },
        "required": ["source"]
      },
      "then": {
        "properties": {
          "pricing_basis": {
            "properties": {
              "kind": {
                "enum": [
                  "ENTERPRISE_DEFAULT_CONFIRMED",
                  "ENTERPRISE_DEFAULT_ZERO",
                  "ENTERPRISE_DEFAULT_APPLIED",
                  "OFFICIAL_REFERENCE_APPLIED",
                  "ZERO_FALLBACK_APPLIED"
                ]
              }
            }
          }
        }
      },
      "else": {
        "properties": {
          "pricing_basis": {
            "properties": {
              "kind": {
                "enum": ["OFFICIAL_PREFILL_CONFIRMED", "ENTERPRISE_CONFIGURED"]
              }
            }
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "pricing_basis": {
            "properties": {
              "kind": {
                "enum": ["ENTERPRISE_DEFAULT_ZERO", "ZERO_FALLBACK_APPLIED"]
              }
            },
            "required": ["kind"]
          }
        },
        "required": ["pricing_basis"]
      },
      "then": {
        "properties": {
          "source": {
            "const": "BUILT_IN"
          },
          "pricing_mode": {
            "const": "FIXED"
          },
          "catalog_price_version_id": {
            "type": "null"
          },
          "catalog_default_price_version_id": {
            "type": "null"
          },
          "catalog_binding": {
            "type": "null"
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "pricing_basis": {
            "properties": {
              "kind": {
                "enum": ["ENTERPRISE_DEFAULT_CONFIRMED", "ENTERPRISE_DEFAULT_APPLIED"]
              }
            },
            "required": ["kind"]
          }
        },
        "required": ["pricing_basis"]
      },
      "then": {
        "properties": {
          "source": {
            "const": "BUILT_IN"
          },
          "catalog_default_price_version_id": {
            "type": "string",
            "description": "已采用默认规则UUID。",
            "format": "uuid"
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "pricing_basis": {
            "properties": {
              "kind": {
                "const": "OFFICIAL_REFERENCE_APPLIED"
              }
            },
            "required": ["kind"]
          }
        },
        "required": ["pricing_basis"]
      },
      "then": {
        "properties": {
          "source": {
            "const": "BUILT_IN"
          },
          "catalog_price_version_id": {
            "type": "string",
            "format": "uuid"
          },
          "catalog_default_price_version_id": {
            "type": "null"
          }
        }
      }
    }
  ]
}
```

40修订：新增`ENTERPRISE_DEFAULT_APPLIED`、`OFFICIAL_REFERENCE_APPLIED`、`ZERO_FALLBACK_APPLIED`，均为`source=BUILT_IN`，schema_version仍为3及原五键；不冒充人工CONFIRMED。官方原数自动应用、复杂规则全0、失配价保护及无计量项未定价例外已按F40-01～04确认。完整条件约束以同步设计JSON为准。

<a id="schema-metricspec"></a>

### MetricSpec

MetricSpec 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段              | 类型/组件           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                                                                                                              | 约束                                   |
| ----------------- | ------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `metric_key`      | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 适配器定义的计量指标键                                                                                                                                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit`            | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该指标计价单位，如 MILLION_TOKENS，取适配器规格                                                                                                                                                                                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit_divisor`    | integer             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 单价对应的数量分母；百万 Token 为 1000000                                                                                                                                                                                                                                             | minimum=1                              |
| `description`     | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前模板/规格查询按Accept-Language从适用版本description_labels投影；嵌入历史PriceSnapshot.metric_specs时仅冻结当时字符串，不保存description_labels，历史说明保持当时原文且不查新目录补译。历史指标名称/单位仍按display_snapshot冻结语言集投影，产品默认时段名按默认快照私有标签投影。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `usage_mapping`   | array&lt;string&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 官方用量来源的字段路径列表                                                                                                                                                                                                                                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `exclusive_group` | string / null       | 否   | 是   | 无静态默认；省略语义见组件/接口 | 互斥计量组键，防止缓存/模态重复计费；无则 null                                                                                                                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `included_in`     | string / null       | 否   | 是   | 无静态默认；省略语义见组件/接口 | 该指标包含在哪个总量指标中；无则 null                                                                                                                                                                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `display_name`    | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前规格查询按Accept-Language取发布目录名称；嵌入历史PriceSnapshot时使用当时冻结的名称，不查当前目录重建                                                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit_label`      | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前规格查询取发布目录的本地化计价单位；嵌入历史PriceSnapshot时使用当时冻结标签，不由前端猜unit                                                                                                                                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-currentpricing"></a>

### CurrentPricing

CurrentPricing 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                | 类型/组件                                       | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                                    | 约束                                             |
| ------------------- | ----------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `state`             | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前取价状态：PRICED 有适用价格，UNPRICED 未定价，CURRENCY_MISMATCH 价格币种与当前内部币种不一致；不是模型生命周期状态                                                                                      | enum=["PRICED", "UNPRICED", "CURRENCY_MISMATCH"] |
| `price`             | [PricingVersion](#schema-pricingversion) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 价格对象或价格版本，按所属组件定义解释                                                                                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则           |
| `price_version`     | integer                                         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前价格版本号，0表示尚未创建价格版本；只在价变更时递增，可计费性由取价状态判断                                                                                                                             | minimum=0                                        |
| `metric_specs`      | array&lt;[MetricSpec](#schema-metricspec)&gt;   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该模型适配器允许的固定计量指标规格                                                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则           |
| `billing_currency`  | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次/当前总部内部计费币种                                                                                                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则           |
| `billing_time_zone` | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版实际计费时区Asia/Shanghai；用户显示时区不影响计价，不新增系统时区设置。                                                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则           |
| `currency_source`   | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部币种来源：总部配置或默认 CNY                                                                                                                                                                            | enum=["HEADQUARTERS", "DEFAULT_CNY"]             |
| `time_zone_source`  | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版计费时区固定缺省Asia/Shanghai，来源DEFAULT_ASIA_SHANGHAI；不新增系统时区配置。历史快照按事实保存，不随用户显示时区变动。                                                                                | enum=["DEFAULT_ASIA_SHANGHAI"]                   |
| `unpriced_reason`   | string / null                                   | 否   | 是   | 无静态默认；省略语义见组件/接口 | 缺少适用价格的稳定原因；INTERFACES_NOT_CONFIGURED=接口未配置，不能检测；METRIC_SPEC_UNAVAILABLE=至少一个接口已适配但完全无metric，按F40-04允许检测/其他条件满足后上架，显示未匹配的计价模式。已定价为null。 | 无额外格式限制；仍遵守所属组件业务规则           |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-balancequeryconfig"></a>

### BalanceQueryConfig

CUSTOM 必填 method/url/auth_type/calculation_mode；DIRECT 必填 value_path，SUBTRACT 必填 total_path 和 used_path；各字段按十进制词法读取、Decimal 精确相减。TEMPLATE 按官方规格计算（OpenRouter 为总额减已用）；NONE 为 {}。允许负余额，不伪造零或自动换汇。 SUBTRACT 的总额与已用须同币种/单位；任一路径缺失、非有限或非法都查询失败，不能按 0 补全或再调用一次余额接口。

| 字段                  | 类型/组件                                                      | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                              | 约束                                          |
| --------------------- | -------------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `method`              | string                                                         | 否   | 否   | 无静态默认；省略语义见组件/接口 | 余额查询 HTTP 方法，仅 GET/POST                                                                       | enum=["GET", "POST"]                          |
| `url`                 | string                                                         | 否   | 否   | 无静态默认；省略语义见组件/接口 | 完整HTTP(S)地址；不得含秘密userinfo                                                                   | 无额外格式限制；仍遵守所属组件业务规则        |
| `auth_type`           | string                                                         | 否   | 否   | 无静态默认；省略语义见组件/接口 | CUSTOM 仅 NONE/BEARER/HEADER；TEMPLATE 只用于模板模式，具体秘密字段取模板规格                         | enum=["NONE", "BEARER", "HEADER", "TEMPLATE"] |
| `value_path`          | string / null                                                  | 否   | 是   | 无静态默认；省略语义见组件/接口 | DIRECT 必填非空；SUBTRACT 时为 null 或省略                                                            | 无额外格式限制；仍遵守所属组件业务规则        |
| `currency_path`       | string / null                                                  | 否   | 是   | 无静态默认；省略语义见组件/接口 | 响应中的币种/单位字段路径；固定原币种模板允许为空                                                     | 无额外格式限制；仍遵守所属组件业务规则        |
| `body`                | object / null                                                  | 否   | 是   | 无静态默认；省略语义见组件/接口 | CUSTOM POST 可选；GET 必须为 null；不传默认 null                                                      | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_parameters` | [BalanceTemplateParameters](#schema-balancetemplateparameters) | 否   | 否   | 无静态默认；省略语义见组件/接口 | 余额模板公开参数，具体键来自 P01.balance_fields，秘密分开传入                                         | 无额外格式限制；仍遵守所属组件业务规则        |
| `auth_header_name`    | string / null                                                  | 否   | 是   | 无静态默认；省略语义见组件/接口 | CUSTOM HEADER 模式必填的单个 HTTP 请求头名；禁止 Host/Cookie/Content-Length/控制字符；其他模式为 null | 无额外格式限制；仍遵守所属组件业务规则        |
| `calculation_mode`    | string                                                         | 否   | 否   | 无静态默认；省略语义见组件/接口 | DIRECT 读取单个可用余额字段；SUBTRACT 按总额减已用计算，不执行任意表达式                              | enum=["DIRECT", "SUBTRACT"]                   |
| `total_path`          | string / null                                                  | 否   | 是   | 无静态默认；省略语义见组件/接口 | SUBTRACT 必填非空；DIRECT 时为 null 或省略                                                            | 无额外格式限制；仍遵守所属组件业务规则        |
| `used_path`           | string / null                                                  | 否   | 是   | 无静态默认；省略语义见组件/接口 | SUBTRACT 必填非空；DIRECT 时为 null 或省略                                                            | 无额外格式限制；仍遵守所属组件业务规则        |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-balanceconfiginput"></a>

### BalanceConfigInput

启用预警需mode非NONE、threshold>0、非空启用用户和渠道；创建默认当前管理员、IN_APP；不投递；配置保存若 channels 含 EMAIL，全部接收者须具有有效邮箱，否则 422 字段错误；不投递。

| 字段                  | 类型/组件                                        | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                     | 约束                                   |
| --------------------- | ------------------------------------------------ | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `expected_version`    | integer                                          | 否   | 否   | 无静态默认；省略语义见组件/接口 | 读取时的乐观版本；未配置余额为 0；供应商创建禁止传入                                                                                         | minimum=0                              |
| `mode`                | string                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 余额配置模式 NONE/TEMPLATE/CUSTOM                                                                                                            | enum=["NONE", "TEMPLATE", "CUSTOM"]    |
| `currency_or_unit`    | string / null                                    | 否   | 是   | 无静态默认；省略语义见组件/接口 | 供应商余额原币种或单位，与内部计费币种独立。CUSTOM 创建省略时默认 CNY；TEMPLATE 取模板固定单位或其明确允许的选择，编辑省略保持；NONE 可 null | 无额外格式限制；仍遵守所属组件业务规则 |
| `query_config`        | [BalanceQueryConfig](#schema-balancequeryconfig) | 否   | 否   | {}                              | 余额查询的公开参数，不含秘密                                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `secrets`             | [SecretInput](#schema-secretinput)               | 否   | 否   | 无静态默认；省略语义见组件/接口 | 仅请求输入的秘密字段；不回显，不写日志                                                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `clear_secret_fields` | array&lt;string&gt;                              | 否   | 否   | 无静态默认；省略语义见组件/接口 | 明确清除的秘密字段键；与本次非空替换字段不可冲突                                                                                             | uniqueItems=true                       |
| `alert_enabled`       | boolean                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否评估余额阈值状态；本版不实际投递通知                                                                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `threshold`           | [Decimal](#schema-decimal) / null                | 否   | 是   | 无静态默认；省略语义见组件/接口 | 低余额阈值精确字符串；启用告警时必须大于 0                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `recipient_user_ids`  | array&lt;string&gt;                              | 否   | 否   | 无静态默认；省略语义见组件/接口 | 告警接收的启用用户 UUID 列表；默认规则见保存接口，不含 system                                                                                | uniqueItems=true                       |
| `channels`            | array&lt;string&gt;                              | 否   | 否   | ["IN_APP"]                      | 配置的通知渠道；本版仅保存，不投递                                                                                                           | uniqueItems=true                       |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-balanceconfig"></a>

### BalanceConfig

BalanceConfig 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                              | 类型/组件                                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                       | 约束                                   |
| --------------------------------- | ----------------------------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `provider_id`                     | string                                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                       | format="uuid"                          |
| `version`                         | integer                                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                                         | minimum=0                              |
| `mode`                            | string                                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 余额配置模式 NONE/TEMPLATE/CUSTOM                                                                              | enum=["NONE", "TEMPLATE", "CUSTOM"]    |
| `currency_or_unit`                | string / null                                                           | 否   | 是   | 无静态默认；省略语义见组件/接口 | 供应商余额自身币种或计费单位，与内部计费币种独立                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `query_config`                    | [BalanceQueryConfig](#schema-balancequeryconfig)                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 余额查询的公开参数，不含秘密                                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `configured_secret_fields`        | array&lt;string&gt;                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 已配置秘密的字段键，只返回存在性，不返回任何字符或密文                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `alert_enabled`                   | boolean                                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否评估余额阈值状态；本版不实际投递通知                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `threshold`                       | [Decimal](#schema-decimal) / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 低余额阈值精确字符串；启用告警时必须大于 0                                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `recipient_user_ids`              | array&lt;string&gt;                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 告警接收的启用用户 UUID 列表；默认规则见保存接口，不含 system                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `channels`                        | array&lt;string&gt;                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 配置的通知渠道；本版仅保存，不投递                                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `notification_delivery_supported` | boolean                                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前系统是否具备余额通知投递能力；本版按已确认范围返回 false，不表示通知已发送，不是供应商可配置开关或研发进度 | 无额外格式限制；仍遵守所属组件业务规则 |
| `recipient_users`                 | array&lt;[BalanceRecipientDisplay](#schema-balancerecipientdisplay)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 与recipient_user_ids对应；页面无需逐个调用用户详情                                                             | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-provider"></a>

### Provider

供应商完整管理详情/保存响应；实例name原文，模板标签按语言。详情配置仅按providers权限返回；列表使用ProviderListItem，不要求前端为模板名读取P01。model_count只代表可见模型，不是级联删除完整影响。

| 字段                       | 类型/组件                                                | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                    | 约束                                          |
| -------------------------- | -------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `id`                       | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                    | format="uuid"                                 |
| `name`                     | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                                                                            | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_key`             | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例选用的稳定供应商模板键；与template_version_id对应，允许通过既有模板选择和保存修改，目录数据无产品写接口 | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_revision`        | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例固定模板对应目录发布批次revision，目录发布不会自动改写                                                  | 无额外格式限制；仍遵守所属组件业务规则        |
| `connection_revision`      | integer                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端维护的连接配置代次，用于型号绑定及任务快照；客户端不回写，不替代保存时的expected_version              | minimum=1                                     |
| `base_url`                 | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整供应商 Base URL；禁止携带用户名密码或秘密查询参数                                                       | 无额外格式限制；仍遵守所属组件业务规则        |
| `security_level`           | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商网络安全分类标签；不是出口审批或网络许可                                                              | enum=["INTERNET", "TRUSTED_CLOUD", "PRIVATE"] |
| `public_config`            | [ProviderPublicConfig](#schema-providerpublicconfig)     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商模板声明的非秘密配置对象                                                                              | 无额外格式限制；仍遵守所属组件业务规则        |
| `configured_secret_fields` | array&lt;string&gt;                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 已配置秘密的字段键，只返回存在性，不返回任何字符或密文                                                      | 无额外格式限制；仍遵守所属组件业务规则        |
| `notes`                    | string / null                                            | 是   | 是   | 无静态默认；省略语义见组件/接口 | 可空备注，去除秘密后原文保存                                                                                | 无额外格式限制；仍遵守所属组件业务规则        |
| `model_count`              | integer                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该供应商关联的当前可见物理模型数量                                                                          | minimum=0                                     |
| `version`                  | integer                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                                      | minimum=1                                     |
| `created_at`               | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                             | format="date-time"                            |
| `updated_at`               | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                             | format="date-time"                            |
| `created_by`               | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                    | format="uuid"                                 |
| `template_name`            | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例固定template_version_id的本地化模板名称，不取当前发布指针下同key的新名称                                | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_icon_key`        | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 受控本地图标键；未知键显示通用图标，不从外部URL加载                                                         | 无额外格式限制；仍遵守所属组件业务规则        |
| `balance_summary`          | [ProviderBalanceSummary](#schema-providerbalancesummary) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 与列表一致的本地余额摘要                                                                                    | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_version_id`      | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例固定的数据库模板版本UUID；只读展示，编辑不提交，目录发布不改变绑定                                      | format="uuid"                                 |
| `catalog_release_id`       | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例固定模板所属的完整目录发布批次；其内置模型/价建议来自该批次                                             | format="uuid"                                 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-officialmodelbinding"></a>

### OfficialModelBinding

只读可信来源；当前供应商connection_revision不匹配派生STALE，不阻止供应商编辑或自动重新准入

| 字段                        | 类型/组件      | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                        | 约束                                   |
| --------------------------- | -------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `state`                     | string         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前型号绑定状态：VERIFIED 为可信绑定且连接代次匹配，UNKNOWN 为未建立可信绑定，STALE 为绑定连接代次已变化；不代表项目调研通过或真实模型调用通过 | enum=["VERIFIED", "UNKNOWN", "STALE"]  |
| `canonical_model_id`        | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 官方规范模型 ID；未知时 null，不从部署别名猜测                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `model_version`             | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 官方模型版本；未知时 null                                                                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `deployment_name`           | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 供应商部署名称；不适用时 null                                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `bound_connection_revision` | integer / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 建立型号绑定时固化的供应商连接代次，未知为null；服务端维护，不是客户端乐观锁版本                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `source_uri`                | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 支持该字段/绑定的官方证据地址，未知时 null                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `observed_at`               | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 来源核对或发现时间，未知时 null                                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `reason_code`               | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定、可本地化的原因码，不含上游秘密原文                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelbase"></a>

### ModelBase

> 历史双数组组件。下表及组合约束供旧版追溯。当前创建和编辑字段见 [ModelCreate](#schema-modelcreate) 和 [ModelIdentityInput](#schema-modelidentityinput)。

| 字段                        | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                   |
| --------------------------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `provider_id`               | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                          |
| `model_id_at_gateway`       | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | minLength=1；maxLength=128             |
| `model_id_at_provider`      | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | minLength=1；maxLength=512             |
| `supported_invocation_apis` | array&lt;string&gt;                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 启用的标准调用接口集合；可为空。与服务端已适配的custom_invocation_apis合计至少一项；不新增RERANK标准枚举。                                                                    | uniqueItems=true                       |
| `custom_invocation_apis`    | array&lt;[CustomAPIInput](#schema-customapiinput)&gt; | 否   | 否   | 无静态默认；省略语义见组件/接口 | 全部启用协议的路径项，按协议数组逐项同序对应；完整配置域省略时按空集合处理，编辑须回传希望保留的已选自定义项                                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `input_modalities`          | array&lt;string&gt;                                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 输入模态集合；未知为空数组，不添加笼统 type                                                                                                                                   | uniqueItems=true                       |
| `output_modalities`         | array&lt;string&gt;                                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 输出模态集合；未知为空数组                                                                                                                                                    | uniqueItems=true                       |
| `context_window`            | integer / null                                        | 否   | 是   | 无静态默认；省略语义见组件/接口 | 模型上下文 Token 整数，未知 null，界面 1K=1000                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `max_output_tokens`         | integer / null                                        | 否   | 是   | 无静态默认；省略语义见组件/接口 | 最大输出 Token 整数，未知 null                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `tags`                      | array&lt;string&gt;                                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 能力标签及自定义标签；流式由规范化注册键识别                                                                                                                                  | uniqueItems=true                       |
| `description`               | string / null                                         | 否   | 是   | 无静态默认；省略语义见组件/接口 | 管理员填写的模型说明原文；未知或未填为null，不按Accept-Language自动翻译。                                                                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_model_version_id`  | string / null                                         | 否   | 是   | 无静态默认；省略语义见组件/接口 | 可选当前基础来源；显式null清除，省略且供应商/上游ID未变则保留；目标改变时后端重新核实或清除不成立来源。新选择须匹配供应商固定批次，不以型号字符串猜Azure部署身份              | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

条件组合约束（与机器契约一致，业务引用匹配仍由服务端事务校验）：

```json
{
  "allOf": [
    {
      "anyOf": [
        {
          "properties": {
            "supported_invocation_apis": {
              "type": "array",
              "minItems": 1,
              "description": "标准调用接口至少一项"
            }
          },
          "required": ["supported_invocation_apis"]
        },
        {
          "properties": {
            "custom_invocation_apis": {
              "type": "array",
              "minItems": 1,
              "description": "已适配自定义接口至少一项"
            }
          },
          "required": ["custom_invocation_apis"]
        }
      ],
      "description": "标准接口或已适配自定义接口合计至少一项；协议适配合法性仍由服务端验证。"
    }
  ]
}
```

<a id="schema-grantdelta"></a>

### GrantDelta

增删整体事务；同主体冲突422；前端确认，不要confirmed/proof字段

| 字段                     | 类型/组件                               | 必填 | 可空 | 默认/省略                       | 字段说明                                                                           | 约束             |
| ------------------------ | --------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------- | ---------------- |
| `expected_grant_version` | integer                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                             | minimum=1        |
| `add`                    | array&lt;[Subject](#schema-subject)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次新增主体集合；与移除冲突时整次拒绝                                             | uniqueItems=true |
| `remove_grant_ids`       | array&lt;string&gt;                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次明确移除的授权关系 UUID，不是主体 UUID                                         | uniqueItems=true |
| `reason`                 | string                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 本次模型授权增删原因，可省略，用于操作审计；不套用模型暂停或审核拒绝的前端必填规则 | maxLength=512    |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelcreate"></a>

### ModelCreate

全部域一个创建事务，不触发检测。M03不强制先M13或提交pricing；主动配置时按适用默认、官方数字及已批准归零规则准备完整建议并检查价格写权限。expected_provider_version固定准备上下文；默认和官方来源分别准确引用，保存后不可因目录更新覆盖。

| 字段                        | 类型/组件                                                     | 必填 | 可空 | 默认/省略                                                                  | 字段说明                                                                                                                                                                      | 约束                                   |
| --------------------------- | ------------------------------------------------------------- | ---- | ---- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `provider_id`               | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口                                            | 稳定UUID                                                                                                                                                                      | format="uuid"                          |
| `model_id_at_gateway`       | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口                                            | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | minLength=1；maxLength=128             |
| `model_id_at_provider`      | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口                                            | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | minLength=1；maxLength=512             |
| `invocation_apis`           | array&lt;[InvocationAPIInput](#schema-invocationapiinput)&gt; | 是   | 否   | 必传                                                                       | 有序模型配置。创建时各行省略 ID。                                                                                                                                             | minItems=1，maxItems=32                |
| `input_modalities`          | array&lt;string&gt;                                           | 否   | 否   | default=[]                                                                 | 输入模态集合；未知为空数组，不添加笼统 type                                                                                                                                   | uniqueItems=true                       |
| `output_modalities`         | array&lt;string&gt;                                           | 否   | 否   | default=[]                                                                 | 输出模态集合；未知为空数组                                                                                                                                                    | uniqueItems=true                       |
| `context_window`            | integer / null                                                | 否   | 是   | default=null                                                               | 模型上下文 Token 整数，未知 null，界面 1K=1000                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `max_output_tokens`         | integer / null                                                | 否   | 是   | default=null                                                               | 最大输出 Token 整数，未知 null                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `tags`                      | array&lt;string&gt;                                           | 否   | 否   | default=[]                                                                 | 能力标签及自定义标签；流式由规范化注册键识别                                                                                                                                  | uniqueItems=true                       |
| `description`               | string / null                                                 | 否   | 是   | default=null                                                               | 对象说明文字，按当前用户语言返回或按输入原文保存                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `initial_grants`            | array&lt;[Subject](#schema-subject)&gt;                       | 否   | 否   | default=[]                                                                 | 创建时的初始直接授权；省略为空                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `health`                    | [HealthInput](#schema-healthinput)                            | 否   | 否   | default={"auto_health_check": false, "health_check_interval_minutes": 360} | 自动健康配置或健康配置版本，按组件具体类型解释                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `pricing`                   | [PricingInput](#schema-pricinginput) / null                   | 否   | 是   | 无静态默认；省略语义见组件/接口                                            | 40修订：省略/null不配置；非空对象仍须完整内部价格、原价格写权限及首次版本0；不因可选价格放宽接口要求。                                                                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_model_version_id`  | string                                                        | 否   | 否   | 无静态默认；省略语义见组件/接口                                            | 可选的M08内置型号版本UUID；后端校验供应商固定批次/模板及可信型号匹配。省略时首次命令按固定批次匹配或记录null，不接受浏览器元信息作为可信来源                                  | format="uuid"                          |
| `expected_provider_version` | integer                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口                                            | M13返回的provider_version；创建时与实例当前版本比较，变化返回409 VERSION_CONFLICT，先刷新准备数据再由管理员确认。                                                             | minimum=1                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelversions"></a>

### ModelVersions

ModelVersions 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段       | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                     | 约束      |
| ---------- | --------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------- | --------- |
| `base`     | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 仅身份/协议五类字段及其目标来源绑定的版本；生命周期、元信息变化不递增。      | minimum=1 |
| `state`    | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 生命周期版本；每次状态转换递增                                               | minimum=1 |
| `grants`   | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模型授权集合版本；真实关系变化递增                                           | minimum=1 |
| `health`   | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 自动健康配置版本；开关/周期变更递增                                          | minimum=1 |
| `price`    | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前价格版本号；0表示尚未创建价格版本，非0不代表当前一定可计费               | minimum=0 |
| `metadata` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 六项可编辑元信息的独立版本；实际变化递增，不改变base/state/admission_epoch。 | minimum=1 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-model"></a>

### Model

物理模型详情与保存结果。所有展示/编辑回显字段必返；未知上下文/输出上限/说明为null，未知模态/标签/自定义接口为[]。model_id_at_gateway就是管理员定义的唯一模型名称，不另设可写name。

| 字段                         | 类型/组件                                            | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                                                          |
| ---------------------------- | ---------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `provider_id`                | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                                                                 |
| `model_id_at_gateway`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | minLength=1；maxLength=128                                                    |
| `model_id_at_provider`       | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | minLength=1；maxLength=512                                                    |
| `input_modalities`           | array&lt;string&gt;                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 输入模态集合；未知为空数组，不添加笼统 type                                                                                                                                   | uniqueItems=true                                                              |
| `output_modalities`          | array&lt;string&gt;                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 输出模态集合；未知为空数组                                                                                                                                                    | uniqueItems=true                                                              |
| `context_window`             | integer / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 模型上下文 Token 整数，未知 null，界面 1K=1000                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `max_output_tokens`          | integer / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最大输出 Token 整数，未知 null                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `tags`                       | array&lt;string&gt;                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 能力标签及自定义标签；流式由规范化注册键识别                                                                                                                                  | uniqueItems=true                                                              |
| `description`                | string / null                                        | 是   | 是   | 无静态默认；省略语义见组件/接口 | 管理员填写的模型说明原文；未知或未填为null，不随Accept-Language翻译业务输入                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `id`                         | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                                                                 |
| `status`                     | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                                                                                                    | enum=["DRAFT", "TESTING", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "RETIRED"] |
| `health_status`              | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 独立健康状态，不与模型生命周期互相替代                                                                                                                                        | enum=["UNKNOWN", "HEALTHY", "UNHEALTHY", "CHECKING"]                          |
| `health_checked_at`          | string / null                                        | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近健康任务完成时间；未查为 null                                                                                                                                             | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `health`                     | [HealthInput](#schema-healthinput)                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 自动健康配置或健康配置版本，按组件具体类型解释                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `versions`                   | [ModelVersions](#schema-modelversions)               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 基础、生命周期、授权、健康、价格的独立版本集合                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `official_model_binding`     | [OfficialModelBinding](#schema-officialmodelbinding) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 只读官方型号/部署绑定；代次不一致派生 STALE                                                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_name`              | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前供应商实例显示名称                                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `security_level`             | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商网络安全分类标签；不是出口审批或网络许可                                                                                                                                | enum=["INTERNET", "TRUSTED_CLOUD", "PRIVATE"]                                 |
| `suspend_reason`             | string / null                                        | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近暂停/下架原因；无则 null                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `invocation_apis`            | array&lt;[InvocationAPI](#schema-invocationapi)&gt;  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实际保存的标准协议及透传配置，按保存顺序回显。没有配置时为 []。                                                                                                               | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `created_at`                 | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                                                                               | format="date-time"                                                            |
| `updated_at`                 | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                                                                               | format="date-time"                                                            |
| `created_by`                 | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                                                                 |
| `provider_template_key`      | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属供应商模板稳定键                                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_template_name`     | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按实例固定模板版本投影的本地化模板名称，不跟随当前发布批次重解释                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_template_icon_key` | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 受控模板图标键，未知使用通用图标                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_base_url`          | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属供应商当前公开API地址；仅此页面所需值，不返回其认证字段/其他配置                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `catalog_model_version_id`   | string / null                                        | 是   | 是   | 无静态默认；省略语义见组件/接口 | 该对象实际采用的内置型号来源；没有可信匹配为null。历史来源不随目录发布或供应商改绑自动更新，不表示当前仍可适配                                                                | 无额外格式限制；仍遵守所属组件业务规则                                        |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelupdate"></a>

### ModelUpdate

至少提交base/metadata/grants/pricing/health一个修改域，版本参数本身不构成修改。base 可在 DRAFT 或 RETIRED 按字段规则提交，同时传 expected_base_version。metadata 传 expected_metadata_version，health 传对应版本，授权及价格包含各自版本。TESTING 与 PENDING_REVIEW 各域均锁定。所有域按各自权限/版本验证并整体事务。

| 字段                             | 类型/组件                                        | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                             | 约束                                   |
| -------------------------------- | ------------------------------------------------ | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `expected_base_version`          | integer                                          | 否   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                               | minimum=1                              |
| `base`                           | [ModelIdentityInput](#schema-modelidentityinput) | 否   | 否   | 无静态默认；省略语义见组件/接口 | 身份及协议域，DRAFT 可编辑。RETIRED 仅可变更网关名称、协议与路径。需 expected_base_version。         | 无额外格式限制；仍遵守所属组件业务规则 |
| `grants`                         | [GrantDelta](#schema-grantdelta)                 | 否   | 否   | 无静态默认；省略语义见组件/接口 | 授权差异域；与其他提交域整体事务                                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `pricing`                        | [PricingInput](#schema-pricinginput)             | 否   | 否   | 无静态默认；省略语义见组件/接口 | 可选价格修改域；提交则显式保存新企业价格版本并与其他域同事务，currency必填且重验当前总部币种。       | 无额外格式限制；仍遵守所属组件业务规则 |
| `health`                         | [HealthInput](#schema-healthinput)               | 否   | 否   | 无静态默认；省略语义见组件/接口 | 自动健康配置或健康配置版本，按组件具体类型解释                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `expected_health_config_version` | integer                                          | 否   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                               | minimum=1                              |
| `metadata`                       | [ModelMetadataInput](#schema-modelmetadatainput) | 否   | 否   | 无静态默认；省略语义见组件/接口 | 六个元信息字段完整集合，TESTING 与 PENDING_REVIEW 锁定。需 expected_metadata_version。               | 无额外格式限制；仍遵守所属组件业务规则 |
| `expected_metadata_version`      | integer                                          | 否   | 否   | 无静态默认；省略语义见组件/接口 | 读取到的versions.metadata；仅提交metadata时必填，失败409 VERSION_CONFLICT且version_domain=METADATA。 | minimum=1                              |

未声明字段：拒绝（`additionalProperties=false`）。

条件组合约束（与机器契约一致，业务引用匹配仍由服务端事务校验）：

```json
{
  "allOf": [
    {
      "anyOf": [
        {
          "required": ["base"]
        },
        {
          "required": ["metadata"]
        },
        {
          "required": ["grants"]
        },
        {
          "required": ["pricing"]
        },
        {
          "required": ["health"]
        }
      ]
    },
    {
      "if": {
        "required": ["base"]
      },
      "then": {
        "required": ["expected_base_version"]
      }
    },
    {
      "if": {
        "required": ["metadata"]
      },
      "then": {
        "required": ["expected_metadata_version"]
      }
    },
    {
      "if": {
        "required": ["health"]
      },
      "then": {
        "required": ["expected_health_config_version"]
      }
    }
  ]
}
```

<a id="schema-statuscommand"></a>

### StatusCommand

拒绝/暂停前端必填原因，API可选并保存；不直接设置任意状态

| 字段                     | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                               | 约束                                                                    |
| ------------------------ | --------- | ---- | ---- | ------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `action`                 | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 生命周期动作；不接受任意目标状态                       | enum=["APPROVE", "REJECT", "SUSPEND", "RESUME", "RETIRE", "REACTIVATE"] |
| `expected_state_version` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                 | minimum=1                                                               |
| `reason`                 | string    | 否   | 否   | 无静态默认；省略语义见组件/接口 | REJECT 或 SUSPEND 时必填非空原因；其他状态命令可省略。 | maxLength=512                                                           |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-suggestedinvocationapi"></a>

### SuggestedInvocationAPI

| 字段       | 类型   | 必填 | 说明                                                                      |
| ---------- | ------ | ---- | ------------------------------------------------------------------------- |
| `protocol` | string | 是   | 内置型号建议的标准协议，与 `suggested_invocation_apis` 同一下标的值一致。 |
| `path`     | string | 是   | 标准适配器的默认出站路径，可预填到写入行。                                |

<a id="schema-modeltemplate"></a>

### ModelTemplate

同一数据库发布批次中的内置型号规格。目录是建议/来源，不是实例已经绑定的官方型号或实际调用验证；metadata中的实例型号绑定未核实时为完整UNKNOWN，不能凭目录字符串置VERIFIED。

| 字段                               | 类型/组件                                                             | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                    | 约束                                                                    |
| ---------------------------------- | --------------------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `suggested_custom_invocation_apis` | array&lt;[SuggestedInvocationAPI](#schema-suggestedinvocationapi)&gt; | 是   | 否   | []                              | 型号建议协议的同序路径行。                                                                                                                                                                  | 与 suggested_invocation_apis 逐项对应                                   |
| `template_key`                     | string                                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 只读供应商模板注册键                                                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `model_id_at_provider`             | string                                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `metadata`                         | [ModelMetadata](#schema-modelmetadata)                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 规范化元信息及字段来源，不包含内部手册价格                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `suggested_invocation_apis`        | array&lt;string&gt;                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 建议启用的标准接口，不能据此替代模型实际能力确认                                                                                                                                            | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `metric_specs`                     | array&lt;[MetricSpec](#schema-metricspec)&gt;                         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该模型适配器允许的固定计量指标规格                                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `builtin_pricing`                  | [BuiltinPricingTemplate](#schema-builtinpricingtemplate) / null       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 有pricing:READ时返回当前型号的官方原币参考价；无可用参考或无权限为null，按pricing_state区分。多官方币种按目录preferred_reference_currency选择，不按内部预算币种过滤；不是模型已生效内部价。 | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `pricing_state`                    | string                                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 官方参考状态：AVAILABLE有可表达官方参考；NEEDS_CONFIGURATION无可用公开价格；UNSUPPORTED_RULE官方复杂/不完整规则无法表达；无pricing:READ为HIDDEN。不能从null/HIDDEN推断企业默认免费资格。    | enum=["AVAILABLE", "NEEDS_CONFIGURATION", "UNSUPPORTED_RULE", "HIDDEN"] |
| `pricing_details_visible`          | boolean                                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 具有model.pricing:READ才为true；false时builtin_pricing=null且pricing_state=HIDDEN，不能把不可见误作没有价格                                                                                 | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `catalog_model_version_id`         | string                                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该发布批次内置型号条目UUID；选择预填时回传，不能仅凭型号字符串猜来源                                                                                                                        | format="uuid"                                                           |
| `template_version_id`              | string                                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属数据库模板版本UUID                                                                                                                                                                      | format="uuid"                                                           |
| `catalog_release_id`               | string                                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 此模型和模板/内置价共同所属的发布批次UUID                                                                                                                                                   | format="uuid"                                                           |
| `catalog_revision`                 | string                                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该条目所属发布批次唯一可读版本                                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                  |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-discoveryinput"></a>

### DiscoveryInput

首次{}；首次受理固定供应商版本、template_version_id和catalog_release_id。后续只继续同快照上游分页；供应商配置改变则DISCOVERY_STALE，单纯发布默认指针变化不改已有快照；不推理。

| 字段                  | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明 | 约束          |
| --------------------- | --------- | ---- | ---- | ------------------------------- | -------- | ------------- |
| `resume_discovery_id` | string    | 否   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID | format="uuid" |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-discoveryitem"></a>

### DiscoveryItem

DiscoveryItem 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                              | 类型/组件                              | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                       | 约束                                   |
| --------------------------------- | -------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `model_id_at_provider`            | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                           | 无额外格式限制；仍遵守所属组件业务规则 |
| `suggested_gateway_name`          | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 建议的网关调用名，可能冲突，保存前允许修改                                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `metadata`                        | [ModelMetadata](#schema-modelmetadata) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 规范化元信息及字段来源，不包含内部手册价格                                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `already_added`                   | boolean                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前供应商是否已存在此上游模型                                                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `existing_physical_model_id`      | string / null                          | 是   | 是   | 无静态默认；省略语义见组件/接口 | 已添加时对应的新物理模型 UUID；否则 null                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `provider_model_name`             | string / null                          | 是   | 是   | 无静态默认；省略语义见组件/接口 | 未提供为null；前端可显示上游ID作为回退但不得称其为官方名称                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `existing_model_id_at_gateway`    | string / null                          | 是   | 是   | 无静态默认；省略语义见组件/接口 | 未添加或现对象不可见时null，不按任意UUID补查                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `suggested_gateway_name_conflict` | boolean                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本建议名称保存前检查时是否冲突；只给冲突事实，不泄露冲突对象身份                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `name_conflict_reason`            | string / null                          | 是   | 是   | 无静态默认；省略语义见组件/接口 | 无冲突时null；检查只是提示，保存仍须事务唯一校验                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_model_version_id`        | string / null                          | 是   | 是   | 无静态默认；省略语义见组件/接口 | 该对象实际采用的内置型号来源；没有可信匹配为null。历史来源不随目录发布或供应商改绑自动更新，不表示当前仍可适配 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-discovery"></a>

### Discovery

Discovery 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                   | 类型/组件                                           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                  | 约束                                             |
| ---------------------- | --------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `id`                   | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                                  | format="uuid"                                    |
| `provider_id`          | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                                  | format="uuid"                                    |
| `status`               | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                                                                                                                | enum=["RUNNING", "SUCCESS", "PARTIAL", "FAILED"] |
| `items`                | array&lt;[DiscoveryItem](#schema-discoveryitem)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则           |
| `total_loaded`         | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本发现快照已获取的候选数，不等同上游完整目录总数                                                                                                                                          | minimum=0                                        |
| `truncated`            | boolean                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | true 表示上游尚未读取完整，允许同快照继续                                                                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则           |
| `expires_at`           | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                                                                                           | format="date-time"                               |
| `error_code`           | string / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定错误码，成功/无错时 null                                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则           |
| `error_params`         | [ErrorParams](#schema-errorparams)                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 错误展示参数，按白名单返回                                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则           |
| `manual_entry_allowed` | boolean                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 始终true                                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则           |
| `page`                 | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前返回的已加载快照页；D01 首次为 1                                                                                                                                                      | minimum=1                                        |
| `page_size`            | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页大小，D01 默认 20                                                                                                                                                                     | minimum=1；maximum=100                           |
| `total`                | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前快照已加载的候选数，等于 total_loaded；truncated=true 时不是上游完整总数                                                                                                              | minimum=0                                        |
| `stats`                | object                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 加载范围统计，不跟随当前分页；added+addable=loaded，name_conflicts是addable的子集，不能再相加。truncated=true仍可能有未取到的上游记录。名称冲突者仍可修改名称后添加，符合原型可添加统计。 | 无额外格式限制；仍遵守所属组件业务规则           |
| `stats.scope`          | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 统计范围固定为本次已加载快照，不能当上游全量                                                                                                                                              | const="LOADED"                                   |
| `stats.loaded`         | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 已加载候选总数，与total_loaded一致                                                                                                                                                        | minimum=0                                        |
| `stats.added`          | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 其中已存在于该供应商的数量                                                                                                                                                                | minimum=0                                        |
| `stats.addable`        | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 尚未添加的全部候选数量，包含名称冲突但可改名者；不是直接可保存的无冲突数量                                                                                                                | minimum=0                                        |
| `stats.name_conflicts` | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | addable中当前建议名称冲突、需要改名的子集数量，不能与added/addable相加                                                                                                                    | minimum=0                                        |
| `template_version_id`  | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 首次发现受理时固定的供应商模板版本；续页、读取和导入不得重新取当前指针                                                                                                                    | format="uuid"                                    |
| `catalog_release_id`   | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 首次发现受理时固定的目录发布批次；续页、读取和导入不得重新取当前指针                                                                                                                      | format="uuid"                                    |
| `catalog_revision`     | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 发现快照所固定发布批次的可读版本                                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则           |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-importitem"></a>

### ImportItem

发现行由服务端读取该行的可信快照及目录绑定，手工行省略快照字段。发现校验失败只拒绝对应行。省略 `invocation_apis` 时使用可信建议，显式空数组保留空草稿。导入不初始化价格。

| 字段                       | 类型/组件                                                     | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                                                 |
| -------------------------- | ------------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `discovery_id`             | string                                                        | 否   | 否   | 省略为手工行                    | 发现行原快照 UUID，校验失败不转为手工导入                                                                                                                                     | format="uuid"；null 或非字符串拒绝整批，空串或无效 UUID 仅拒绝对应行 |
| `model_id_at_provider`     | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则                               |
| `model_id_at_gateway`      | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | 无额外格式限制；仍遵守所属组件业务规则                               |
| `invocation_apis`          | array&lt;[InvocationAPIInput](#schema-invocationapiinput)&gt; | 否   | 否   | 省略采用可信建议                | 显式 [] 保存空草稿。各行省略 ID。                                                                                                                                             | maxItems=32                                                          |
| `catalog_model_version_id` | string                                                        | 否   | 否   | 无静态默认；省略语义见组件/接口 | 可选的M08内置型号版本UUID；后端校验供应商固定批次/模板及可信型号匹配。省略时首次命令按固定批次匹配或记录null，不接受浏览器元信息作为可信来源                                  | format="uuid"                                                        |
| `pricing`                  | null                                                          | 否   | 是   | 省略与null均不配置价格          | 仅接受省略或 null。非 null 返回整批 422。                                                                                                                                     | enum=[null]                                                          |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-importinput"></a>

### ImportInput

同一批可混合发现行和手工行，逐行事务创建草稿。新建草稿的价格版本为 0。已存在项可跳过，保留原配置。

| 字段                        | 类型/组件                                     | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                   | 约束                     |
| --------------------------- | --------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| `models`                    | array&lt;[ImportItem](#schema-importitem)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次操作的物理模型集合；技术批量上限不限制总模型规模                                       | minItems=1；maxItems=100 |
| `expected_provider_version` | integer                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前供应商实例版本，例如 P04 的 version。首次受理时版本冲突返回整批 409 VERSION_CONFLICT。 | minimum=1                |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-batchitem"></a>

### BatchItem

BatchItem 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                                                 | 约束                                                                    |
| ------------------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `input_index`       | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对应请求数组的零起始下标，用于逐项反馈                   | minimum=0                                                               |
| `physical_model_id` | string / null                                         | 是   | 是   | 无静态默认；省略语义见组件/接口 | 新版物理模型 UUID；不接受旧逻辑模型或 model_resources ID | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `status`            | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功               | enum=["CREATED", "UPDATED", "ACCEPTED", "SKIPPED_EXISTING", "REJECTED"] |
| `code`              | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定业务结果码；成功外层为 OK                            | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `params`            | [ErrorParams](#schema-errorparams)                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 安全、本地化结果参数，不能包含秘密或原始报文             | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `job_id`            | string / null                                         | 是   | 是   | 无静态默认；省略语义见组件/接口 | 检测任务 UUID；此项未受理时 null                         | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `model`             | [BatchModelContext](#schema-batchmodelcontext) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 无权限/对象不存在时null；不得通过错误结果泄露越界名字    | 无额外格式限制；仍遵守所属组件业务规则                                  |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-batchresult"></a>

### BatchResult

BatchResult 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段              | 类型/组件                                   | 必填 | 可空 | 默认/省略                       | 字段说明                                                | 约束                                   |
| ----------------- | ------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| `items`           | array&lt;[BatchItem](#schema-batchitem)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件        | 无额外格式限制；仍遵守所属组件业务规则 |
| `succeeded_count` | integer                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 成功或已存在而跳过的条数，含义见逐项 status             | minimum=0                              |
| `failed_count`    | integer                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次拒绝或失败条数，与 succeeded_count 合计等于输入长度 | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-checkinput"></a>

### CheckInput

准入可显式复用同模型、同服务端admission_epoch及base_version的终态旧任务完整通过接口；健康禁止reuse_job_id；客户端不选掉必检、不传费用归属

| 字段                    | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明               | 约束          |
| ----------------------- | --------- | ---- | ---- | ------------------------------- | ---------------------- | ------------- |
| `expected_base_version` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值 | minimum=1     |
| `reuse_job_id`          | string    | 否   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID               | format="uuid" |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-healthcheckinput"></a>

### HealthCheckInput

HealthCheckInput 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                    | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明               | 约束      |
| ----------------------- | --------- | ---- | ---- | ------------------------------- | ---------------------- | --------- |
| `expected_base_version` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值 | minimum=1 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-admissionmodelinput"></a>

### AdmissionModelInput

AdmissionModelInput 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                    | 类型/组件                                                     | 必填 | 可空 | 默认/省略                       | 字段说明                                    | 约束                    |
| ----------------------- | ------------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------- | ----------------------- |
| `physical_model_id`     | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                    | format="uuid"           |
| `expected_base_version` | integer                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                      | minimum=1               |
| `invocation_apis`       | array&lt;[InvocationAPIInput](#schema-invocationapiinput)&gt; | 是   | 否   | 必传                            | 本次拟保存并检测的有序配置。已有行回传 ID。 | minItems=1，maxItems=32 |
| `reuse_job_id`          | string                                                        | 否   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                    | format="uuid"           |

未声明字段：拒绝（`additionalProperties=false`）。

组合约束：标准接口或已适配自定义接口至少一项；不能两者皆空。

<a id="schema-provideradmissioninput"></a>

### ProviderAdmissionInput

逐模型保存接口并建任务；同模型原子，不把前端测试结果当证据

| 字段     | 类型/组件                                                       | 必填 | 可空 | 默认/省略                       | 字段说明                                             | 约束                     |
| -------- | --------------------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------- | ------------------------ |
| `models` | array&lt;[AdmissionModelInput](#schema-admissionmodelinput)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次操作的物理模型集合；技术批量上限不限制总模型规模 | minItems=1；maxItems=100 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelversionref"></a>

### ModelVersionRef

ModelVersionRef 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                     | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明               | 约束          |
| ------------------------ | --------- | ---- | ---- | ------------------------------- | ---------------------- | ------------- |
| `physical_model_id`      | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID               | format="uuid" |
| `expected_state_version` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值 | minimum=1     |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-publishinput"></a>

### PublishInput

逐模型校验PENDING_REVIEW及成功证据，逐项反馈

| 字段     | 类型/组件                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                             | 约束                     |
| -------- | ------------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------- | ------------------------ |
| `models` | array&lt;[ModelVersionRef](#schema-modelversionref)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次操作的物理模型集合；技术批量上限不限制总模型规模 | minItems=1；maxItems=100 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-costline"></a>

### CostLine

CostLine 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段             | 类型/组件                                    | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                       | 约束                                                             |
| ---------------- | -------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `metric_key`     | string                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 适配器定义的计量指标键                                                                         | 无额外格式限制；仍遵守所属组件业务规则                           |
| `unit`           | string                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该指标计价单位，如 MILLION_TOKENS，取适配器规格                                                | 无额外格式限制；仍遵守所属组件业务规则                           |
| `quantity`       | [Decimal](#schema-decimal) / null            | 是   | 是   | 无静态默认；省略语义见组件/接口 | 归一用量的精确字符串，未知 null；真实 0 使用字符串 0                                           | 无额外格式限制；仍遵守所属组件业务规则                           |
| `unit_divisor`   | integer / null                               | 是   | 是   | 无静态默认；省略语义见组件/接口 | 单价对应的数量分母；百万 Token 为 1000000                                                      | 无额外格式限制；仍遵守所属组件业务规则                           |
| `unit_price`     | [Decimal](#schema-decimal) / null            | 是   | 是   | 无静态默认；省略语义见组件/接口 | 精确单价字符串；非负，不经过浮点                                                               | 无额外格式限制；仍遵守所属组件业务规则                           |
| `amount`         | [Decimal](#schema-decimal) / null            | 是   | 是   | 无静态默认；省略语义见组件/接口 | 单项精确金额；无法计算时 null                                                                  | 无额外格式限制；仍遵守所属组件业务规则                           |
| `status`         | string                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                     | enum=["KNOWN", "UNKNOWN_USAGE", "UNPRICED", "CALCULATION_ERROR"] |
| `rule_snapshot`  | [CostRuleSnapshot](#schema-costrulesnapshot) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该分项的完整计量、费率、命中时段与舍入依据快照                                                 | 无额外格式限制；仍遵守所属组件业务规则                           |
| `unknown_reason` | string / null                                | 是   | 是   | 无静态默认；省略语义见组件/接口 | 无法确定量/价/金额的原因码；正常已知时 null                                                    | 无额外格式限制；仍遵守所属组件业务规则                           |
| `display_name`   | string                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 来自价格显示快照或本任务冻结计量规格的指标名称；无标签异常用本地化未知指标说明，不从当前目录猜 | 无额外格式限制；仍遵守所属组件业务规则                           |
| `unit_label`     | string                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一冻结来源的单位标签；不改变数值或币种                                                       | 无额外格式限制；仍遵守所属组件业务规则                           |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-costrecord"></a>

### CostRecord

CostRecord 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                        | 类型/组件                                                  | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                        | 约束                                                            |
| --------------------------- | ---------------------------------------------------------- | ---- | ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `id`                        | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                        | format="uuid"                                                   |
| `job_id`                    | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                        | format="uuid"                                                   |
| `item_id`                   | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                        | format="uuid"                                                   |
| `physical_model_id`         | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                        | format="uuid"                                                   |
| `provider_id`               | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                        | format="uuid"                                                   |
| `purpose`                   | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | ADMISSION 准入或 HEALTH 健康；HTTP 摘要组件另用其自身枚举                                                       | enum=["ADMISSION", "HEALTH"]                                    |
| `api_key`                   | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 标准接口枚举或服务端生成的 CUSTOM_UUID 标识；不是供应商访问密钥                                                 | 无额外格式限制；仍遵守所属组件业务规则                          |
| `check_type`                | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 仅 MODEL_REQUEST/PROTOCOL/STREAMING，不开放 Tool/JSON 检测                                                      | enum=["MODEL_REQUEST", "PROTOCOL", "STREAMING"]                 |
| `model_provider_snapshot`   | [ModelProviderSnapshot](#schema-modelprovidersnapshot)     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商、模型和本项目调用接口的最小安全公开快照；内部完整元信息另行冻结，响应不暴露私有字段。              | 无额外格式限制；仍遵守所属组件业务规则                          |
| `billing_identity_snapshot` | [BillingIdentitySnapshot](#schema-billingidentitysnapshot) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时 system 计费主体与币种/时区来源事实                                                                       | 无额外格式限制；仍遵守所属组件业务规则                          |
| `department_snapshot`       | [DepartmentSnapshot](#schema-departmentsnapshot)           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时总部费用归属部门事实                                                                                      | 无额外格式限制；仍遵守所属组件业务规则                          |
| `triggered_by_snapshot`     | [IdentitySnapshot](#schema-identitysnapshot)               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实际人工触发人或自动触发来源，不作为费用主体                                                                    | 无额外格式限制；仍遵守所属组件业务规则                          |
| `request_started_at`        | string / null                                              | 是   | 是   | 无静态默认；省略语义见组件/接口 | 本项目占用发送权时固化的时间；沿用项目原值。确定未发送可空；发送结果 UNKNOWN 不清空，不把该时间作为上游接收证明 | 无额外格式限制；仍遵守所属组件业务规则                          |
| `currency`                  | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | ISO 4217 币种，费用使用总部配置，未配置为 CNY                                                                   | 无额外格式限制；仍遵守所属组件业务规则                          |
| `time_zone`                 | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | IANA 计费时区，与当前用户的显示时区区分                                                                         | 无额外格式限制；仍遵守所属组件业务规则                          |
| `price_snapshot`            | [PriceSnapshot](#schema-pricesnapshot)                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 发送时被冻结的完整价格版本、时段、指标和取价状态                                                                | 无额外格式限制；仍遵守所属组件业务规则                          |
| `raw_usage`                 | [RawUsage](#schema-rawusage) / null                        | 是   | 是   | 无静态默认；省略语义见组件/接口 | 供应商 usage 安全白名单快照；完全未获得时 null                                                                  | 无额外格式限制；仍遵守所属组件业务规则                          |
| `normalized_usage`          | [NormalizedUsage](#schema-normalizedusage)                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按固定计量指标归一后的量值、来源及未知原因                                                                      | 无额外格式限制；仍遵守所属组件业务规则                          |
| `cost_status`               | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 计费完整性状态，与检测通过/失败相互独立                                                                         | enum=["COMPLETE", "PARTIAL", "UNPRICED", "UNKNOWN", "NOT_SENT"] |
| `known_amount`              | [Decimal](#schema-decimal) / null                          | 是   | 是   | 无静态默认；省略语义见组件/接口 | 已能确定的金额小计；完全无可计算依据时 null                                                                     | 无额外格式限制；仍遵守所属组件业务规则                          |
| `total_amount`              | [Decimal](#schema-decimal) / null                          | 是   | 是   | 无静态默认；省略语义见组件/接口 | 完整金额；有任何未知项目时 null，不能将小计冒充总额                                                             | 无额外格式限制；仍遵守所属组件业务规则                          |
| `lines`                     | array&lt;[CostLine](#schema-costline)&gt;                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按适配指标展开的计费分项                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                          |
| `error_code`                | string / null                                              | 否   | 是   | 无静态默认；省略语义见组件/接口 | 稳定错误码，成功/无错时 null                                                                                    | 无额外格式限制；仍遵守所属组件业务规则                          |
| `created_at`                | string                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                 | format="date-time"                                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-httpexchange"></a>

### HttpExchange

HttpExchange 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                | 类型/组件      | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                  | 约束                                              |
| ------------------- | -------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `ordinal`           | integer        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前父对象内的稳定顺序，从 0 开始                                                                                         | 无额外格式限制；仍遵守所属组件业务规则            |
| `purpose`           | string         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次 HTTP 动作用途：MODEL 模型请求、AUTH 认证、UPLOAD 上传、POLL 同一任务轮询、FETCH 结果获取；与准入或健康的任务用途分开 | enum=["MODEL", "AUTH", "UPLOAD", "POLL", "FETCH"] |
| `http_method`       | string         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实际 HTTP 方法                                                                                                            | 无额外格式限制；仍遵守所属组件业务规则            |
| `sanitized_target`  | string         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 去秘密参数的请求目标摘要，不能包含完整认证 URL                                                                            | 无额外格式限制；仍遵守所属组件业务规则            |
| `http_status`       | integer / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 上游 HTTP 状态，未取得响应为空                                                                                            | 无额外格式限制；仍遵守所属组件业务规则            |
| `error_code`        | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定错误码，成功/无错时 null                                                                                              | 无额外格式限制；仍遵守所属组件业务规则            |
| `started_at`        | string         | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                           | format="date-time"                                |
| `completed_at`      | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 终态完成时间；未完成为 null                                                                                               | 无额外格式限制；仍遵守所属组件业务规则            |
| `request_attempted` | boolean / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 已确认发起 HTTP 尝试为 true；确定未尝试为 false；故障不确定为 null                                                        | 无额外格式限制；仍遵守所属组件业务规则            |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-checkitem"></a>

### CheckItem

CheckItem 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                 | 类型/组件                                                 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                          | 约束                                                                             |
| -------------------- | --------------------------------------------------------- | ---- | ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `id`                 | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                          | format="uuid"                                                                    |
| `api_key`            | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 标准接口枚举或服务端生成的 CUSTOM_UUID 标识；不是供应商访问密钥                                                                   | 无额外格式限制；仍遵守所属组件业务规则                                           |
| `check_type`         | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 仅 MODEL_REQUEST/PROTOCOL/STREAMING，不开放 Tool/JSON 检测                                                                        | enum=["MODEL_REQUEST", "PROTOCOL", "STREAMING"]                                  |
| `status`             | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                                                        | enum=["WAITING", "RUNNING", "PASS", "FAIL", "ERROR", "NOT_APPLICABLE", "REUSED"] |
| `dispatch_state`     | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 一次性发送权状态；DISPATCHED 不得自动重置 READY                                                                                   | enum=["READY", "DISPATCHED", "FINISHED", "NOT_SENT"]                             |
| `dispatch_count`     | integer                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本项目占用发送权次数，仅 0 或 1，不是供应商接收次数                                                                               | minimum=0；maximum=1                                                             |
| `reused_item_id`     | string / null                                             | 否   | 是   | 无静态默认；省略语义见组件/接口 | 仅 REUSED 时为来源项目 UUID；其他状态为 null 或省略；历史源可被清理                                                               | 无额外格式限制；仍遵守所属组件业务规则                                           |
| `request_started_at` | string / null                                             | 是   | 是   | 无静态默认；省略语义见组件/接口 | 发送权占用事务固化的发送意图/尝试起始时间。READY 或确定 NOT_SENT 可为 null；DISPATCHED 后即使实际发送未知也保留，不证明上游已收到 | 无额外格式限制；仍遵守所属组件业务规则                                           |
| `completed_at`       | string / null                                             | 是   | 是   | 无静态默认；省略语义见组件/接口 | 终态完成时间；未完成为 null                                                                                                       | 无额外格式限制；仍遵守所属组件业务规则                                           |
| `error_code`         | string / null                                             | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定错误码，成功/无错时 null                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则                                           |
| `result_detail`      | [CheckResultDetail](#schema-checkresultdetail) / null     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 未开始/执行中且尚无安全结果时 null；终态按结果组件返回，不能以 {} 冒充完整结果                                                    | 无额外格式限制；仍遵守所属组件业务规则                                           |
| `http_exchanges`     | array&lt;[HttpExchange](#schema-httpexchange)&gt;         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模型与认证/上传/轮询/读取的 HTTP 摘要，辅助动作单列                                                                               | 无额外格式限制；仍遵守所属组件业务规则                                           |
| `cost`               | [CostRecord](#schema-costrecord) / null                   | 是   | 是   | 无静态默认；省略语义见组件/接口 | 有 pricing:READ 且已固化时返回费用事实；无权或尚无费用记录为 null                                                                 | 无额外格式限制；仍遵守所属组件业务规则                                           |
| `reuse_source`       | [ReuseSourceSnapshot](#schema-reusesourcesnapshot) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | REUSED 时必须非空并能独立解释旧配置与通过依据；其他状态为 null                                                                    | 无额外格式限制；仍遵守所属组件业务规则                                           |
| `invocation_api`     | [InvocationAPIDisplay](#schema-invocationapidisplay)      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本项目当时接口名称及路径，来自任务快照，不从当前模型接口或费用对象反查                                                            | 无额外格式限制；仍遵守所属组件业务规则                                           |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-checkjob"></a>

### CheckJob

CheckJob 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                      | 类型/组件                                                         | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                 | 约束                                                 |
| ------------------------- | ----------------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `id`                      | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                 | format="uuid"                                        |
| `physical_model_id`       | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                 | format="uuid"                                        |
| `purpose`                 | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | ADMISSION 准入或 HEALTH 健康；HTTP 摘要组件另用其自身枚举                                                                | enum=["ADMISSION", "HEALTH"]                         |
| `trigger_type`            | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | MANUAL 人工触发或 AUTO 自动调度                                                                                          | enum=["MANUAL", "AUTO"]                              |
| `triggered_by`            | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 人工触发人的 UUID；自动任务可空，费用始终归 system                                                                       | 无额外格式限制；仍遵守所属组件业务规则               |
| `status`                  | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                                               | enum=["QUEUED", "RUNNING", "COMPLETED", "CANCELLED"] |
| `result`                  | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 任务汇总结果；未结束时 null，不能把 ACCEPTED 当 PASS                                                                     | 无额外格式限制；仍遵守所属组件业务规则               |
| `base_version`            | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 提交时身份/协议版本；用于准入复用/审核目标一致性，不与当前元信息版本混为一谈。                                           | minimum=1                                            |
| `admission_epoch`         | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                 | format="uuid"                                        |
| `provider_version`        | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                                                   | minimum=1                                            |
| `planned_model_calls`     | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次计划的新模型调用项目数，不含不适用或复用项                                                                           | minimum=0                                            |
| `actual_model_calls`      | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 已持久确认进入HTTP调用的次数，不能证明上游收到                                                                           | minimum=0                                            |
| `unknown_model_calls`     | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 占用发送权但无法确认调用的数量                                                                                           | minimum=0                                            |
| `auxiliary_http_calls`    | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 认证、上传、同任务轮询等辅助 HTTP 动作数                                                                                 | minimum=0                                            |
| `created_at`              | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                          | format="date-time"                                   |
| `started_at`              | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 实际开始时间；尚未开始为空时以字段可空定义为准                                                                           | 无额外格式限制；仍遵守所属组件业务规则               |
| `deadline_at`             | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                          | format="date-time"                                   |
| `completed_at`            | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 终态完成时间；未完成为 null                                                                                              | 无额外格式限制；仍遵守所属组件业务规则               |
| `items`                   | array&lt;[CheckItem](#schema-checkitem)&gt;                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件                                                                         | 无额外格式限制；仍遵守所属组件业务规则               |
| `pricing_details_visible` | boolean                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 仅具有model.pricing:READ时返回完整cost和价格快照，否则cost=null且summary不含价费                                         | 无额外格式限制；仍遵守所属组件业务规则               |
| `summary`                 | [CheckSummary](#schema-checksummary)                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 检查项目计数及按权限裁剪的费用汇总                                                                                       | 无额外格式限制；仍遵守所属组件业务规则               |
| `triggered_by_display`    | [IdentitySnapshot](#schema-identitysnapshot)                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当时触发人：MANUAL为冻结用户名字，AUTO为自动任务身份；不要求pricing:READ                                                 | 无额外格式限制；仍遵守所属组件业务规则               |
| `model_display`           | [ModelDisplaySnapshot](#schema-modeldisplaysnapshot)              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 任务时模型与供应商显示引用，不从CostRecord取值                                                                           | 无额外格式限制；仍遵守所属组件业务规则               |
| `check_types`             | array&lt;string&gt;                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本轮计划/历史实际包含的检测类型集合，供列表展示；不以ADMISSION/HEALTH用途代替                                            | uniqueItems=true                                     |
| `invocation_apis`         | array&lt;[InvocationAPIDisplay](#schema-invocationapidisplay)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本轮接口去重摘要；历史行不必逐项请求详情以补接口名称                                                                     | 无额外格式限制；仍遵守所属组件业务规则               |
| `metadata_version`        | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 提交时冻结的模型元信息版本；历史任务只证明当时快照。之后改模态/标签不改本任务计划、次数、结果或费用，也不自动复验/取消。 | minimum=1                                            |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-grant"></a>

### Grant

Grant 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                      | 类型/组件     | 必填 | 可空 | 默认/省略                       | 字段说明                                                  | 约束                                      |
| ------------------------- | ------------- | ---- | ---- | ------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| `id`                      | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                  | format="uuid"                             |
| `physical_model_id`       | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                  | format="uuid"                             |
| `subject_type`            | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 授权主体类型：部门、用户组或用户；本版不开放 PROJECT      | enum=["DEPARTMENT", "USER_GROUP", "USER"] |
| `subject_id`              | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                  | format="uuid"                             |
| `subject_name`            | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前主体显示名；历史审计另存快照                          | 无额外格式限制；仍遵守所属组件业务规则    |
| `scope_mode`              | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 部门固定 SUBTREE；用户和用户组为 null                     | 无额外格式限制；仍遵守所属组件业务规则    |
| `created_at`              | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                           | format="date-time"                        |
| `created_by`              | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                  | format="uuid"                             |
| `manageable`              | boolean       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前操作者是否能修改此条直接关系；不是用户数据面可用性    | 无额外格式限制；仍遵守所属组件业务规则    |
| `subject_username`        | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 非USER或按当前范围不可提供时null，不额外请求A12或身份详情 | 无额外格式限制；仍遵守所属组件业务规则    |
| `subject_department_path` | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | USER/DEPARTMENT可提供时返回；其他或不可提供为null         | 无额外格式限制；仍遵守所属组件业务规则    |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-grantresult"></a>

### GrantResult

GrantResult 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                | 类型/组件                           | 必填 | 可空 | 默认/省略                       | 字段说明                       | 约束                                   |
| ------------------- | ----------------------------------- | ---- | ---- | ------------------------------- | ------------------------------ | -------------------------------------- |
| `grant_version`     | integer                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值         | minimum=1                              |
| `added`             | array&lt;[Grant](#schema-grant)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次真正新增的授权关系         | 无额外格式限制；仍遵守所属组件业务规则 |
| `removed_grant_ids` | array&lt;string&gt;                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次已移除的授权关系 UUID 列表 | 无额外格式限制；仍遵守所属组件业务规则 |
| `unchanged_count`   | integer                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 请求中已存在、不新增的关系条数 | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-batchgrantinput"></a>

### BatchGrantInput

整体事务，全预校验，任一越界/版本冲突全部回滚；重复关系无变化

| 字段                              | 类型/组件                               | 必填 | 可空 | 默认/省略                       | 字段说明                                                                         | 约束                     |
| --------------------------------- | --------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------- | ------------------------ |
| `models`                          | array&lt;object&gt;                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次操作的物理模型集合；技术批量上限不限制总模型规模                             | minItems=1；maxItems=100 |
| `models[].physical_model_id`      | string                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                         | format="uuid"            |
| `models[].expected_grant_version` | integer                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                           | minimum=1                |
| `add`                             | array&lt;[Subject](#schema-subject)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次新增主体集合；与移除冲突时整次拒绝                                           | minItems=1               |
| `reason`                          | string                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 本次跨模型授权原因，可省略，用于操作审计；不套用模型暂停或审核拒绝的前端必填规则 | maxLength=512            |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-batchgrantresult"></a>

### BatchGrantResult

BatchGrantResult 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                         | 类型/组件                          | 必填 | 可空 | 默认/省略                       | 字段说明                                                   | 约束                                   |
| ---------------------------- | ---------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `models`                     | array&lt;object&gt;                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次操作的物理模型集合；技术批量上限不限制总模型规模       | 无额外格式限制；仍遵守所属组件业务规则 |
| `models[].physical_model_id` | string                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                   | format="uuid"                          |
| `models[].result`            | [GrantResult](#schema-grantresult) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该物理模型本次保存后的授权集合与版本结果；不是检测任务结果 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-accesssource"></a>

### AccessSource

AccessSource 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                      | 类型/组件     | 必填 | 可空 | 默认/省略                       | 字段说明                                                  | 约束                                      |
| ------------------------- | ------------- | ---- | ---- | ------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| `grant_id`                | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                  | format="uuid"                             |
| `subject_type`            | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 授权主体类型：部门、用户组或用户；本版不开放 PROJECT      | enum=["DEPARTMENT", "USER_GROUP", "USER"] |
| `subject_id`              | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                  | format="uuid"                             |
| `subject_name`            | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前主体显示名；历史审计另存快照                          | 无额外格式限制；仍遵守所属组件业务规则    |
| `inherited`               | boolean       | 是   | 否   | 无静态默认；省略语义见组件/接口 | true 表示来自部门/用户组；用户直接授权为 false            | 无额外格式限制；仍遵守所属组件业务规则    |
| `subject_username`        | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 非USER或按当前范围不可提供时null，不额外请求A12或身份详情 | 无额外格式限制；仍遵守所属组件业务规则    |
| `subject_department_path` | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | USER/DEPARTMENT可提供时返回；其他或不可提供为null         | 无额外格式限制；仍遵守所属组件业务规则    |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-accessiblemodel"></a>

### AccessibleModel

accessible-models只返回当前可用；来源接口可保留不可用授权事实

| 字段                 | 类型/组件                                                      | 必填 | 可空 | 默认/省略                       | 字段说明                                                | 约束                                   |
| -------------------- | -------------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| `model`              | [ModelAuthorizationSummary](#schema-modelauthorizationsummary) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 用户授权视图的最小物理模型引用                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `sources`            | array&lt;[AccessSource](#schema-accesssource)&gt;              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 三源命中事实列表；模型去重不丢来源                      | minItems=1                             |
| `available`          | boolean                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 依据当前模型/用户有效性是否可用；不是数据面实时放行结果 | 无额外格式限制；仍遵守所属组件业务规则 |
| `unavailable_reason` | string / null                                                  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 当前不可用的原因码，可用时 null                         | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-usergrantdelta"></a>

### UserGrantDelta

A14/A15 的同用户批量增量请求。单项也使用数组；未提交关系不变。普通对象拒绝未知字段。

| 字段                             | 类型                     | 必填 | 可空 | 约束与语义                                                      |
| -------------------------------- | ------------------------ | ---- | ---- | --------------------------------------------------------------- |
| `physical_model_ids`             | array&lt;string UUID&gt; | 是   | 否   | 1～100 项；规范化 UUID 后重复拒绝，按集合规范化排序参与命令摘要 |
| `expected_authorization_version` | integer                  | 是   | 否   | 最小1，来自当前 A04/A11 列表；新命令版本过期整批409             |
| `reason`                         | string                   | 否   | 是   | 最多512 Unicode字符，禁控制字符；可省略或null                   |

<a id="schema-usergrantdeltaresult"></a>

### UserGrantDeltaResult

A14/A15 的整批成功安全回执；不是最终完整直授集合，也不是逐项成功、失败混合结果。相同幂等命令重放原回执，字段可能已被后续业务改变。

| 字段                        | 类型                | 必返 | 可空 | 约束与语义                                           |
| --------------------------- | ------------------- | ---- | ---- | ---------------------------------------------------- |
| `authorization_version`     | integer             | 是   | 否   | 本命令完成后全局版本，最小1                          |
| `requested_count`           | integer             | 是   | 否   | 1～100，等于items长度和changed_count+unchanged_count |
| `changed_count`             | integer             | 是   | 否   | 0～100，实际改变的模型数                             |
| `unchanged_count`           | integer             | 是   | 否   | 0～100，已经满足目标无需改变的模型数                 |
| `items`                     | array&lt;object&gt; | 是   | 否   | 1～100项，按规范UUID升序覆盖全部请求模型             |
| `items[].physical_model_id` | string UUID         | 是   | 否   | 本项模型                                             |
| `items[].direct_granted`    | boolean             | 是   | 否   | A14均true，A15均false，仅表示该USER直授状态          |
| `items[].changed`           | boolean             | 是   | 否   | 本命令是否实际改变该USER关系                         |

<a id="schema-subjectgrantreplace"></a>

### SubjectGrantReplace

覆盖该主体可管理范围的直接物理模型集合；不能删除不可见范围关系；只改这一类来源

| 字段                             | 类型/组件           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                               | 约束             |
| -------------------------------- | ------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `physical_model_ids`             | array&lt;string&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前主体可管理范围内的直接授权模型 UUID 集合；不可见关系由后端保护                                                     | uniqueItems=true |
| `expected_authorization_version` | integer             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 全新 ma_grant_state 单例 revision；仅保护模型直接授权集合的并发，不能冻结身份成员/部门等有效授权来源；保存时仍需重校验 | minimum=1        |
| `reason`                         | string              | 否   | 否   | 无静态默认；省略语义见组件/接口 | 本次主体直接模型授权集合调整原因，可省略，用于操作审计；不套用模型暂停或审核拒绝的前端必填规则                         | maxLength=512    |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-balancestate"></a>

### BalanceState

BalanceState 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                              | 类型/组件                          | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                             | 约束                                        |
| --------------------------------- | ---------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `provider_id`                     | string                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                             | format="uuid"                               |
| `last_balance_value`              | [Decimal](#schema-decimal) / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近一次成功查询的精确余额，未成功为 null                                                                                            | 无额外格式限制；仍遵守所属组件业务规则      |
| `last_balance_unit`               | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近成功余额的实际原币种或单位，未成功为 null                                                                                        | 无额外格式限制；仍遵守所属组件业务规则      |
| `last_attempt_at`                 | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近查询尝试时间；从未查询为 null                                                                                                    | 无额外格式限制；仍遵守所属组件业务规则      |
| `last_success_at`                 | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近成功查询时间；失败不会覆盖该时间                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则      |
| `query_status`                    | string                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 最近一次终态查询状态，不代表当前是否有在途任务                                                                                       | enum=["NEVER_QUERIED", "SUCCESS", "FAILED"] |
| `error_code`                      | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定错误码，成功/无错时 null                                                                                                         | 无额外格式限制；仍遵守所属组件业务规则      |
| `error_params`                    | [ErrorParams](#schema-errorparams) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前状态对应的安全错误参数，从ma_balance_state.error_params读取；无错误为{}，与query_status/error_code同次更新，不拼接其他查询的详情 | 无额外格式限制；仍遵守所属组件业务规则      |
| `alert_state`                     | string                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前阈值状态；UNKNOWN 不代表正常余额                                                                                                 | enum=["UNKNOWN", "NORMAL", "LOW"]           |
| `active_run_id`                   | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 当前在途余额任务 UUID；没有在途或终态已完成时 null                                                                                   | 无额外格式限制；仍遵守所属组件业务规则      |
| `next_query_at`                   | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 下次后台查询时间；禁用或不可调度为 null                                                                                              | 无额外格式限制；仍遵守所属组件业务规则      |
| `notification_delivery_supported` | boolean                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前系统是否具备余额通知投递能力；本版按已确认范围返回 false，不表示通知已发送，不是供应商可配置开关或研发进度                       | 无额外格式限制；仍遵守所属组件业务规则      |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-balancequeryreceipt"></a>

### BalanceQueryReceipt

仅受理本次查询，不表示余额更新成功

| 字段     | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                   | 约束             |
| -------- | --------- | ---- | ---- | ------------------------------- | ------------------------------------------ | ---------------- |
| `run_id` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                   | format="uuid"    |
| `status` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功 | enum=["RUNNING"] |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-balancerun"></a>

### BalanceRun

BalanceRun 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                              | 类型/组件                         | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                       | 约束                                   |
| --------------------------------- | --------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| `id`                              | string                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                       | format="uuid"                          |
| `provider_id`                     | string                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                       | format="uuid"                          |
| `status`                          | string                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                     | enum=["RUNNING", "SUCCESS", "FAILED"]  |
| `trigger_type`                    | string                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | MANUAL 人工触发或 AUTO 自动调度                                                                | enum=["MANUAL", "AUTO"]                |
| `expected_currency_or_unit`       | string                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 任务开始时冻结的预期供应商余额单位                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `currency_or_unit`                | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 本次实际取得的供应商币种或单位；未响应或无法识别时null，失败但已取得时仍保留，不用配置币种代替 | 无额外格式限制；仍遵守所属组件业务规则 |
| `balance_value`                   | [Decimal](#schema-decimal) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 本次成功返回的精确余额；失败时 null                                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `error_code`                      | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定错误码，成功/无错时 null                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `safe_detail`                     | object                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 余额查询安全摘要，不回显任意上游报文、请求体或秘密                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `safe_detail.reason_code`         | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定、可本地化的原因码，不含上游秘密原文                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `safe_detail.http_status`         | integer / null                    | 是   | 是   | 无静态默认；省略语义见组件/接口 | 上游 HTTP 状态，未取得响应为空                                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `safe_detail.value_path`          | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | DIRECT 使用的余额字段路径；SUBTRACT 或解析前失败时 null                                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `safe_detail.currency_path`       | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 响应中的币种/单位字段路径；固定原币种模板允许为空                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `safe_detail.configured_currency` | string                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次冻结的配置币种或单位                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `safe_detail.observed_currency`   | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 响应中真实观察到的币种或单位，无法取得时 null，不用配置值伪装                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `safe_detail.calculation_mode`    | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 成功解析时非空；解析前失败可 null                                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `safe_detail.total_path`          | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | SUBTRACT 时非空，其他为空                                                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `safe_detail.used_path`           | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | SUBTRACT 时非空，其他为空                                                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `started_at`                      | string                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                | format="date-time"                     |
| `completed_at`                    | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 终态完成时间；未完成为 null                                                                    | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-healthconfigupdate"></a>

### HealthConfigUpdate

HealthConfigUpdate 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                             | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                                   | 约束                                   |
| -------------------------------- | --------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `auto_health_check`              | boolean   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 自动健康检查开关；只有 ACTIVE 模型会被调度                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `health_check_interval_minutes`  | integer   | 是   | 否   | 360                             | 自动健康检查周期（分钟），只允许 60/360/720/1440，默认 360 | enum=[60, 360, 720, 1440]              |
| `expected_health_config_version` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                     | minimum=1                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-summary"></a>

### Summary

横向供应商标签：name、图标、可见模型数量直接返回。q包含模型名称、上游ID、说明及供应商实例名；与M01同一范围和非provider筛选，统计刻意不含当前provider_id，以便切换标签。

| 字段                            | 类型/组件           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                 | 约束                                   |
| ------------------------------- | ------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `total`                         | integer             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数                                  | minimum=0                              |
| `providers`                     | array&lt;object&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模型列表供应商标签及计数                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `providers[].provider_id`       | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                 | format="uuid"                          |
| `providers[].provider_name`     | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前供应商实例显示名称                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `providers[].model_count`       | integer             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该供应商关联的当前可见物理模型数量                                       | minimum=0                              |
| `providers[].template_name`     | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本地化供应商模板显示名称；来自template_key对应的发布目录，不等于实例name | 无额外格式限制；仍遵守所属组件业务规则 |
| `providers[].template_icon_key` | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 受控本地图标键；未知键显示通用图标，不从外部URL加载                      | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-deleted"></a>

### Deleted

Deleted 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段          | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                   | 约束                                   |
| ------------- | --------- | ---- | ---- | ------------------------------- | ------------------------------------------ | -------------------------------------- |
| `deleted`     | boolean   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 物理删除成功为 true，不能用 false 伪装成功 | 无额外格式限制；仍遵守所属组件业务规则 |
| `resource_id` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                   | format="uuid"                          |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-errorparams"></a>

### ErrorParams

仅已注册安全键；不包含原始请求/认证/秘密

| 字段                | 类型/组件                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                                        | 约束                                                                                                    |
| ------------------- | ------------------------------------------------------- | ---- | ---- | ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `fields`            | object                                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 字段路径到稳定字段错误码的映射                                  | 无额外格式限制；仍遵守所属组件业务规则                                                                  |
| `standard_route`    | object                                                  | 否   | 否   | 省略                            | 字段规则为 `STANDARD_ROUTE_CONFLICT` 时提供冲突的标准入站路由。 | 包含字符串 `method` 和 `path`，`path` 可以是路径模板。                                                  |
| `current_version`   | integer                                                 | 否   | 否   | 无静态默认；省略语义见组件/接口 | 发生冲突时的当前可见版本                                        | 无额外格式限制；仍遵守所属组件业务规则                                                                  |
| `version_domain`    | string                                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 发生版本冲突的配置域                                            | enum=["PROVIDER", "BASE", "STATE", "GRANTS", "HEALTH", "PRICE", "BALANCE", "AUTHORIZATION", "METADATA"] |
| `allowed_actions`   | array&lt;string&gt;                                     | 否   | 否   | 无静态默认；省略语义见组件/接口 | 当前状态允许的管理动作，仅提示，不授予权限                      | 无额外格式限制；仍遵守所属组件业务规则                                                                  |
| `job_id`            | string                                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                        | format="uuid"                                                                                           |
| `reason_code`       | string                                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 稳定、可本地化的原因码，不含上游秘密原文                        | 无额外格式限制；仍遵守所属组件业务规则                                                                  |
| `retryable_by_user` | boolean                                                 | 否   | 否   | 无静态默认；省略语义见组件/接口 | 是否允许用户明确修正/重新发起，绝不表示自动重试                 | 无额外格式限制；仍遵守所属组件业务规则                                                                  |
| `details`           | array&lt;[SafeErrorDetail](#schema-safeerrordetail)&gt; | 否   | 否   | 无静态默认；省略语义见组件/接口 | 可安全显示的细分错误列表；无细节时可省略                        | 无额外格式限制；仍遵守所属组件业务规则                                                                  |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelediterrorparams"></a>

### ModelEditErrorParams

仅用于 M05 的失败响应。继承 `ErrorParams` 和协议冲突参数，新增受控本地化说明及逐项错误；其他操作仍使用各自契约，不因本组件扩大字段或权限。实际 OpenAPI 保留安全扩展参数，不能把响应中的未知键直接渲染成错误文案。

| 字段              | 类型/组件                                                         | 必填 | 可空 | 省略语义                                       | 字段说明                                                                              |
| ----------------- | ----------------------------------------------------------------- | ---- | ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `reason_code`     | string                                                            | 是   | 否   | 不省略                                         | 与外层 `code` 一致的稳定业务码；不随语言变化                                          |
| `reason`          | string                                                            | 是   | 否   | 不省略                                         | 当前业务错误的受控本地化说明，实际语言见 `Content-Language`；内部异常只给安全通用提示 |
| `errors`          | array&lt;[ModelEditErrorDetail](#schema-modelediterrordetail)&gt; | 否   | 否   | 没有可安全返回的逐项诊断时省略；不表示配置合法 | 本次已能判定的接口配置问题；按配置行顺序返回，同一行可有多个原因；下标从 0 开始       |
| `fields`          | object&lt;string,string&gt;                                       | 否   | 否   | 没有明确定位时省略                             | 字段路径到稳定规则的映射；同一字段有多项原因时仅保留首项，完整原因读取 `errors`       |
| `version_domain`  | string                                                            | 否   | 否   | 无版本域信息时省略                             | 已确认的版本冲突域，保留原接口语义                                                    |
| `current_version` | integer                                                           | 否   | 否   | 无当前版本信息时省略                           | 已确认的当前版本，不能代替重新读取其他域事实                                          |
| `standard_route`  | object                                                            | 否   | 否   | 没有标准入口冲突时省略                         | 首个标准入口冲突的受控 `method` / `path`；多项冲突分别见 `errors[].standard_route`    |

已知目录依赖失败时可以携带已确认的输入诊断；未知内部异常不携带内部原因或推测性的接口范围。语言翻译只改变 `reason` 文案，不改变上述机器字段、业务拒绝分类或事务结果。

<a id="schema-modelediterrordetail"></a>

### ModelEditErrorDetail

M05 单项接口配置诊断。所有字符串原因均来自已审词条；不回显请求中的任意协议字符串、原始路径、外部行 ID、秘密或底层异常。

| 字段                  | 类型/组件           | 必填 | 可空 | 省略语义                         | 字段说明/约束                                                                                |
| --------------------- | ------------------- | ---- | ---- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| `field`               | string              | 是   | 否   | 不省略                           | 相对于完整请求体的字段路径，例如 `base.invocation_apis[1].protocol`；配置行下标从 0 开始     |
| `reason_code`         | string              | 是   | 否   | 不省略                           | 稳定细分原因码，见下表；不随语言变化                                                         |
| `reason`              | string              | 是   | 否   | 不省略                           | 与顶层 `params.reason` 使用同一实际语言的受控说明，见 `Content-Language`                     |
| `protocol`            | string              | 否   | 否   | 未确认输入属于已知协议枚举时省略 | 仅回填既有标准协议枚举或 `CUSTOM_PASSTHROUGH`；不翻译                                        |
| `binding_scope`       | string              | 否   | 否   | 问题不涉及可确认的绑定层级时省略 | `PROVIDER_TEMPLATE` 为供应商固定模板；`CATALOG_MODEL` 为关联可信型号；不翻译                 |
| `supported_protocols` | array&lt;string&gt; | 否   | 否   | 无可列出的有效标准协议时省略     | 该实际绑定层级允许的标准协议，仅修正提示，不授予权限；不与其他层级求并集，不包含透传，不翻译 |
| `standard_route`      | object              | 否   | 否   | 不是可确认的标准入口冲突时省略   | 仅 `STANDARD_ROUTE_CONFLICT` 使用；含受控字符串 `method`、`path`，路径可以是标准模板；不翻译 |

| 逐项 `reason_code`               | 含义                                                             |
| -------------------------------- | ---------------------------------------------------------------- |
| `REQUIRED`                       | 须显式提供列表，或当前状态不允许空列表；DRAFT 仍可提交空数组     |
| `VALUE_RANGE`                    | 列表超过 32 行上限                                               |
| `PROTOCOL_UNSUPPORTED`           | 未知协议枚举                                                     |
| `PROTOCOL_NOT_BOUND`             | 实际模板或型号未绑定所选标准协议                                 |
| `DUPLICATE_PROTOCOL`             | 同一标准协议重复配置                                             |
| `DUPLICATE_PATH`                 | 自定义透传路径重复                                               |
| `DUPLICATE_ID`                   | 同一配置行 ID 重复提交                                           |
| `INVALID_PATH`                   | 路径格式、转义或相对基址拼接不合法                               |
| `INVALID_UUID`                   | 已有配置行 ID 不是有效 UUID                                      |
| `UNSUPPORTED_FIELD`              | 当前操作不支持该字段；为共享校验保留，M05 正常入参流程通常不触发 |
| `NOT_MODEL_INVOCATION`           | 行 ID 不属于目标模型，或该 ID 的协议身份不匹配                   |
| `STANDARD_ROUTE_CONFLICT`        | 透传路径与网关标准入站路由冲突                                   |
| `CUSTOM_PASSTHROUGH_UNSUPPORTED` | 固定模板未启用自定义透传                                         |
| `PAIR_COUNT_MISMATCH`            | 协议与路径数量不一致；为共享校验保留，M05 正常入参转换通常不触发 |
| `CATALOG_TEMPLATE_INCOMPATIBLE`  | 固定模板与已实现适配能力不兼容                                   |
| `CATALOG_MODEL_INCOMPATIBLE`     | 关联型号与固定模板及已实现适配能力不兼容                         |

<a id="schema-error"></a>

### Error

Error 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段         | 类型/组件                          | 必填 | 可空 | 默认/省略                       | 字段说明                                         | 约束                                   |
| ------------ | ---------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `code`       | string                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定业务结果码；成功外层为 OK                    | 无额外格式限制；仍遵守所属组件业务规则 |
| `data`       | null                               | 是   | 是   | 无静态默认；省略语义见组件/接口 | 成功数据或错误时 null；结构由具体 operation 确定 | 无额外格式限制；仍遵守所属组件业务规则 |
| `params`     | [ErrorParams](#schema-errorparams) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 安全、本地化结果参数，不能包含秘密或原始报文     | 无额外格式限制；仍遵守所属组件业务规则 |
| `request_id` | string                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                         | format="uuid"                          |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-providerpage"></a>

### ProviderPage

ProviderPage 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段        | 类型/组件                                                 | 必填 | 可空 | 默认/省略                       | 字段说明                                | 约束                                   |
| ----------- | --------------------------------------------------------- | ---- | ---- | ------------------------------- | --------------------------------------- | -------------------------------------- |
| `items`     | array&lt;[ProviderListItem](#schema-providerlistitem)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页供应商，不含详情配置              | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`      | integer                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从 1 开始的当前页码，默认 1             | minimum=1                              |
| `page_size` | integer                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页条数，默认 20，上限 100             | minimum=1；maximum=100                 |
| `total`     | integer                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数 | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelpage"></a>

### ModelPage

ModelPage 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段        | 类型/组件                                           | 必填 | 可空 | 默认/省略                       | 字段说明                                | 约束                                   |
| ----------- | --------------------------------------------------- | ---- | ---- | ------------------------------- | --------------------------------------- | -------------------------------------- |
| `items`     | array&lt;[ModelListItem](#schema-modellistitem)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页物理模型                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`      | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从 1 开始的当前页码，默认 1             | minimum=1                              |
| `page_size` | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页条数，默认 20，上限 100             | minimum=1；maximum=100                 |
| `total`     | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数 | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modeltemplatepage"></a>

### ModelTemplatePage

M08固定目录批次的内置规格，支持默认分页和显式全量。paginate=false时page/page_size成对为null，items为全部可见匹配项且total=items.length；分页时两字段为整数。两种模式保持相同权限、筛选、稳定排序及一致性快照。

| 字段                           | 类型/组件                                           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                  | 约束                                                                   |
| ------------------------------ | --------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `protocol_options`             | array&lt;object&gt;                                 | 是   | 否   | 无供应商时 []                   | 每项为标准 `protocol` 和非空 `default_path`。                                             | 按实例固定适配规格解析，与型号分页独立                                 |
| `custom_passthrough_supported` | boolean / null                                      | 是   | 是   | 无供应商时 null                 | 该实例模板是否允许添加自定义透传。                                                        | 已保存取 M04 的 `invocation_apis`                                      |
| `items`                        | array&lt;[ModelTemplate](#schema-modeltemplate)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 分页时当前页、全量时全部可见匹配项；空结果返回[]，全量不静默截断。                        | 无额外格式限制；仍遵守所属组件业务规则                                 |
| `page`                         | integer / null                                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 分页时当前页码，从1开始；不分页时null。与另一分页字段成对同为空或同为整数，字段始终必返。 | minimum=1（仅整数分支）；与另一分页字段成对为空或成对整数              |
| `page_size`                    | integer / null                                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 分页时每页条数1～100；不分页时null。与另一分页字段成对同为空或同为整数，字段始终必返。    | minimum=1；maximum=100（仅整数分支）；与另一分页字段成对为空或成对整数 |
| `total`                        | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一合法可见范围及筛选条件下的总数；不分页等于items.length，不泄露不可见项数量。          | minimum=0                                                              |
| `catalog_release_id`           | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次读取固定的数据库目录发布批次；同一页及续页保持同批，不随当前指针变化混合              | format="uuid"                                                          |
| `catalog_revision`             | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该固定发布批次的唯一可读版本                                                              | 无额外格式限制；仍遵守所属组件业务规则                                 |

未声明字段：拒绝（`additionalProperties=false`）。

条件约束（与OpenAPI一致）：

```json
{
  "allOf": [
    {
      "if": {
        "properties": {
          "page": {
            "type": "null"
          }
        },
        "required": ["page"]
      },
      "then": {
        "properties": {
          "page_size": {
            "type": "null"
          }
        }
      },
      "else": {
        "properties": {
          "page_size": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          }
        }
      }
    }
  ]
}
```

<a id="schema-pricingversionpage"></a>

### PricingVersionPage

PricingVersionPage 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段        | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                                         | 约束                                   |
| ----------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `items`     | array&lt;[PricingVersion](#schema-pricingversion)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件 | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`      | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从 1 开始的当前页码，默认 1                      | minimum=1                              |
| `page_size` | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页条数，默认 20，上限 100                      | minimum=1；maximum=100                 |
| `total`     | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数          | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-checkjobpage"></a>

### CheckJobPage

CheckJobPage 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段        | 类型/组件                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                | 约束                                   |
| ----------- | ------------------------------------------------------- | ---- | ---- | ------------------------------- | --------------------------------------- | -------------------------------------- |
| `items`     | array&lt;[CheckJobSummary](#schema-checkjobsummary)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页历史列表行                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`      | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从 1 开始的当前页码，默认 1             | minimum=1                              |
| `page_size` | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页条数，默认 20，上限 100             | minimum=1；maximum=100                 |
| `total`     | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数 | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-accessiblemodelpage"></a>

### AccessibleModelPage

AccessibleModelPage 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                    | 类型/组件                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                                                 | 约束                                   |
| ----------------------- | ------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `authorization_version` | integer                                                 | 是   | 否   | 无静态默认                      | 同一响应快照的全局直接授权版本，空列表亦返回；不冻结成员、部门或跨页并集 | minimum=1                              |
| `items`                 | array&lt;[AccessibleModel](#schema-accessiblemodel)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`                  | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从 1 开始的当前页码，默认 1                                              | minimum=1                              |
| `page_size`             | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页条数，默认 20，上限 100                                              | minimum=1；maximum=100                 |
| `total`                 | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数                                  | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-subjectviewpage"></a>

### SubjectViewPage

SubjectViewPage 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段        | 类型/组件                                       | 必填 | 可空 | 默认/省略                       | 字段说明                                                    | 约束                                     |
| ----------- | ----------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `items`     | array&lt;[SubjectView](#schema-subjectview)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件            | 无额外格式限制；仍遵守所属组件业务规则   |
| `page`      | integer                                         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从 1 开始的当前页码，默认 1                                 | minimum=1                                |
| `page_size` | integer                                         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页条数，默认 20，上限 100                                 | minimum=1；maximum=100                   |
| `total`     | integer                                         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数                     | minimum=0                                |
| `view_mode` | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 部门浏览为TREE_CHILDREN；带q部门搜索为SEARCH；用户/组为LIST | enum=["TREE_CHILDREN", "SEARCH", "LIST"] |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-grantpage"></a>

### GrantPage

A01分页或全量读取的直接授权关系。paginate=false时page/page_size成对为null，items为全部可见匹配关系且total=items.length；分页模式保持原整数元数据。两种模式均使用同一权限谓词及一致性快照，不展开成员。

| 字段                    | 类型/组件                           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                               | 约束                                   |
| ----------------------- | ----------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `items`                 | array&lt;[Grant](#schema-grant)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 分页时当前页、全量时所有可见匹配Grant；无结果为[]。完整返回主体名称、用户名、可见部门路径和可管理标记。                | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`                  | integer / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 分页时当前页码，从1开始；不分页时null。与另一分页字段成对同为空或同为整数，字段始终必返。                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `page_size`             | integer / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 分页时每页条数1～100；不分页时null。与另一分页字段成对同为空或同为整数，字段始终必返。                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `total`                 | integer                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同权限范围/筛选下的直接关系总数；不分页等于items.length；不返回隐藏关系数量。                                    | minimum=0                              |
| `grant_version`         | integer                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                                                 | minimum=1                              |
| `authorization_version` | integer                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 全新 ma_grant_state 单例 revision；仅保护模型直接授权集合的并发，不能冻结身份成员/部门等有效授权来源；保存时仍需重校验 | minimum=1                              |

未声明字段：拒绝（`additionalProperties=false`）。

条件约束（与OpenAPI一致）：

```json
{
  "allOf": [
    {
      "if": {
        "properties": {
          "page": {
            "type": "null"
          }
        },
        "required": ["page"]
      },
      "then": {
        "properties": {
          "page_size": {
            "type": "null"
          }
        }
      },
      "else": {
        "properties": {
          "page_size": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          }
        }
      }
    }
  ]
}
```

<a id="schema-subjectgrantpage"></a>

### SubjectGrantPage

SubjectGrantPage 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                    | 类型/组件                                                                   | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                               | 约束                                   |
| ----------------------- | --------------------------------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `items`                 | array&lt;[ModelAuthorizationSummary](#schema-modelauthorizationsummary)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页直接关系中的模型，不是最终有效并集                                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `authorization_version` | integer                                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 全新 ma_grant_state 单例 revision；仅保护模型直接授权集合的并发，不能冻结身份成员/部门等有效授权来源；保存时仍需重校验 | minimum=1                              |
| `page`                  | integer                                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从 1 开始的当前页码，默认 1                                                                                            | minimum=1                              |
| `page_size`             | integer                                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页条数，默认 20，上限 100                                                                                            | minimum=1；maximum=100                 |
| `total`                 | integer                                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数                                                                                | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-subjectgrantresult"></a>

### SubjectGrantResult

SubjectGrantResult 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                                         | 类型/组件           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                               | 约束                                   |
| -------------------------------------------- | ------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `authorization_version`                      | integer             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 全新 ma_grant_state 单例 revision；仅保护模型直接授权集合的并发，不能冻结身份成员/部门等有效授权来源；保存时仍需重校验 | minimum=1                              |
| `physical_model_ids`                         | array&lt;string&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前主体可管理范围内的直接授权模型 UUID 集合；不可见关系由后端保护                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `changed_model_versions`                     | array&lt;object&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次发生授权变化的模型及新 grant_version                                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `changed_model_versions[].physical_model_id` | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                               | format="uuid"                          |
| `changed_model_versions[].grant_version`     | integer             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                                                 | minimum=1                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-templatelist"></a>

### TemplateList

数据库模板目录的只读投影。无provider_id时读取当前或明确固定的发布批次；有provider_id时仅回读该可见实例固定模板，items通常一项；读取不是目录管理接口。

| 字段                 | 类型/组件                                 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                     | 约束                                   |
| -------------------- | ----------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `items`              | array&lt;[Template](#schema-template)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_release_id` | string                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次读取固定的数据库目录发布批次；同一页及续页保持同批，不随当前指针变化混合 | format="uuid"                          |
| `catalog_revision`   | string                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该固定发布批次的唯一可读版本                                                 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-jsonvalue"></a>

### JsonValue

不含秘密的 JSON 值。用于管理员配置的 JSON 请求体和模板 JSON 默认值；金额等十进制必须用字符串。

类型：oneOf(null, boolean, string, integer, array&lt;[JsonValue](#schema-jsonvalue)&gt;, object)；约束：无额外格式限制；仍遵守所属组件业务规则。

<a id="schema-fieldcondition"></a>

### FieldCondition

一个条件；同一 required_when 数组按 AND 求值，不执行表达式或脚本

| 字段       | 类型/组件                                   | 必填 | 可空 | 默认/省略                       | 字段说明                                                   | 约束                                   |
| ---------- | ------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `field`    | string                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一配置对象中的字段键；只允许模板声明的键                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `operator` | string                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 条件运算；EQ 比较单值，IN 比较列表，PRESENT 判断字段已填写 | enum=["EQ", "IN", "PRESENT"]           |
| `values`   | array&lt;[JsonValue](#schema-jsonvalue)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | EQ 恰 1 项；IN 至少 1 项；PRESENT 空数组                   | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-providerpublicconfig"></a>

### ProviderPublicConfig

P01 对应 template_key/revision 的 fields 去掉 SECRET 后形成的配置对象。只接受声明的 key、value_type、条件和 validation_schema；未知键 400，字段规则失败 422。21 模板逐字段来源见 06A/06B；R06原字段差异已按回执通过；后续事实变化按20核验，不把设计通过当适配完成。

动态键值：[JsonValue](#schema-jsonvalue)。键的具体白名单、条件与权限按组件说明校验。

<a id="schema-balancetemplateparameters"></a>

### BalanceTemplateParameters

P01 对应模板 balance_fields 的非秘密参数；只接受已声明的字段。精确字段取该template_version_id的不可变规格，秘密只能放 secrets。

动态键值：[JsonValue](#schema-jsonvalue)。键的具体白名单、条件与权限按组件说明校验。

<a id="schema-fieldsource"></a>

### FieldSource

一项元信息来源，不携带上游私密响应

| 字段               | 类型/组件     | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                      | 约束                                              |
| ------------------ | ------------- | ---- | ---- | ------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `field`            | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 元数据字段键                                                                                  | 无额外格式限制；仍遵守所属组件业务规则            |
| `source`           | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 元信息来源                                                                                    | enum=["MANUAL", "UPSTREAM", "BUILTIN", "UNKNOWN"] |
| `source_uri`       | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 该字段实际取值的公开来源地址；人工或未知来源可空，不返回项目调研报告、审批链接或含秘密的地址  | 无额外格式限制；仍遵守所属组件业务规则            |
| `observed_at`      | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 实际发现取值的时间，或已发布内置条目记录的来源采集时间；未知时 null，不用本次设计审阅时间代替 | 无额外格式限制；仍遵守所属组件业务规则            |
| `catalog_revision` | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 提供该字段取值的已发布内置目录版本；非内置来源可空，不是项目迭代或评审版本                    | 无额外格式限制；仍遵守所属组件业务规则            |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelmetadata"></a>

### ModelMetadata

不含价格的候选/预置元信息；模型 ID 由外层字段提供，不从内部手册导入价格

| 字段                     | 类型/组件                                            | 必填 | 可空 | 默认/省略                       | 字段说明                                         | 约束                                   |
| ------------------------ | ---------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `input_modalities`       | array&lt;string&gt;                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 输入模态集合；未知为空数组，不添加笼统 type      | uniqueItems=true                       |
| `output_modalities`      | array&lt;string&gt;                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 输出模态集合；未知为空数组                       | uniqueItems=true                       |
| `context_window`         | integer / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 模型上下文 Token 整数，未知 null，界面 1K=1000   | 无额外格式限制；仍遵守所属组件业务规则 |
| `max_output_tokens`      | integer / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最大输出 Token 整数，未知 null                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `tags`                   | array&lt;string&gt;                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 能力标签及自定义标签；流式由规范化注册键识别     | uniqueItems=true                       |
| `description`            | string / null                                        | 是   | 是   | 无静态默认；省略语义见组件/接口 | 对象说明文字，按当前用户语言返回或按输入原文保存 | 无额外格式限制；仍遵守所属组件业务规则 |
| `field_sources`          | array&lt;[FieldSource](#schema-fieldsource)&gt;      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 逐字段来源；没有证据的值留空或 null              | 无额外格式限制；仍遵守所属组件业务规则 |
| `official_model_binding` | [OfficialModelBinding](#schema-officialmodelbinding) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 只读官方型号/部署绑定；代次不一致派生 STALE      | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-builtinpricingtemplate"></a>

### BuiltinPricingTemplate

官方原币参考价投影，仅price_kind=OFFICIAL_REFERENCE。保留真实币种及官方来源，不是企业默认规则。产品默认由M14/default_reference读取且优先；无默认时M13才以官方数字预填，仍须管理员确认。

| 字段                       | 类型/组件                                                 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                          | 约束                                   |
| -------------------------- | --------------------------------------------------------- | ---- | ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `currency`                 | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原始价的币种；不能把外币改标成总部币种                                                                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `time_zone`                | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 官方参考规则本身的生效时区，不取内部Asia/Shanghai替换；若不能无歧义表达则标UNSUPPORTED_RULE，不生成可用参考条目。                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `pricing_mode`             | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 固定价 FIXED 或分时价 TIME_BASED                                                                                                  | enum=["FIXED", "TIME_BASED"]           |
| `periods`                  | array&lt;[PricePeriodInput](#schema-priceperiodinput)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整计价时段；固定价恰一个兜底，分时价按规则设置。时段及其中conditions均按输入顺序保存/返回，保留每行weekdays集合；不合并或拆行。 | minItems=1                             |
| `catalog_revision`         | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属数据库目录发布批次revision，与catalog_price_version_id及外层型号来源一致                                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `adapter_revision`         | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 适配器计量规格版本                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `source_uris`              | array&lt;string&gt;                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该已发布内置价条目的公开定价依据；无可公开来源时为空数组，不返回调研清单或项目审批链接                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `rounding`                 | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版参考结构的Decimal舍入约定HALF_EVEN；不声称复刻供应商最终账单。                                                                | enum=["HALF_EVEN"]                     |
| `amount_scale`             | integer                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版Decimal金额精度18位；实际内部价另有独立快照。                                                                                 | const=18                               |
| `catalog_price_version_id` | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | ma_catalog_prices不可变条目UUID；与外层ModelTemplate同一批次和型号，表单预填时可作为自定义价参考来源                              | format="uuid"                          |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-safeerrordetail"></a>

### SafeErrorDetail

详细错误的一项；不回显请求、响应全文、认证值或完整私密 URL

| 字段                  | 类型/组件      | 必填 | 可空 | 默认/省略                       | 字段说明                              | 约束                                   |
| --------------------- | -------------- | ---- | ---- | ------------------------------- | ------------------------------------- | -------------------------------------- |
| `reason_code`         | string         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定安全原因码                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `field`               | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 相关字段 JSON 路径，无具体字段时 null | 无额外格式限制；仍遵守所属组件业务规则 |
| `http_status`         | integer / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 上游 HTTP 状态，未取得响应为空        | 无额外格式限制；仍遵守所属组件业务规则 |
| `upstream_error_code` | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 白名单提取的上游错误码；不是错误原文  | 无额外格式限制；仍遵守所属组件业务规则 |
| `suggestion_code`     | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 前端本地化处理建议键，缺省 null       | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-identitysnapshot"></a>

### IdentitySnapshot

不可变身份事实，不靠当前 users JOIN 补名称

| 字段           | 类型/组件     | 必填 | 可空 | 默认/省略                       | 字段说明                                                 | 约束                                   |
| -------------- | ------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| `user_id`      | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 事件时用户 UUID；没有人工触发人的自动来源为 null         | 无额外格式限制；仍遵守所属组件业务规则 |
| `username`     | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 事件时用户登录名；自动来源无登录名为 null                | 无额外格式限制；仍遵守所属组件业务规则 |
| `display_name` | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 事件时用户显示名；无用户时 null                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `kind`         | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件身份类型；SYSTEM 是可信计费用户，AUTO 是自动触发来源 | enum=["USER", "SYSTEM", "AUTO"]        |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-departmentsnapshot"></a>

### DepartmentSnapshot

不可变费用归属部门事实

| 字段            | 类型/组件           | 必填 | 可空 | 默认/省略                       | 字段说明                           | 约束                                   |
| --------------- | ------------------- | ---- | ---- | ------------------------------- | ---------------------------------- | -------------------------------------- |
| `department_id` | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时总部根部门 UUID              | format="uuid"                          |
| `name`          | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时部门名称                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `path`          | array&lt;object&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从根到归属部门的路径，包含归属节点 | 无额外格式限制；仍遵守所属组件业务规则 |
| `path[].id`     | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 路径部门 UUID                      | format="uuid"                          |
| `path[].name`   | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时路径部门名                   | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-billingidentitysnapshot"></a>

### BillingIdentitySnapshot

可信费用主体；请求不得指定，不设置预算或预占

| 字段               | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                     | 约束                                   |
| ------------------ | --------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `service_code`     | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 可信模型检测服务键                                                                                                           | enum=["SYSTEM_CHECK"]                  |
| `billing_user_id`  | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | ma_service_identities 绑定的真实 users UUID                                                                                  | format="uuid"                          |
| `username`         | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时用户登录名                                                                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `display_name`     | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时显示名                                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `department_id`    | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时费用归属根部门 UUID                                                                                                    | format="uuid"                          |
| `currency_source`  | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部币种来源                                                                                                                 | enum=["HEADQUARTERS", "DEFAULT_CNY"]   |
| `time_zone_source` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版计费时区固定缺省Asia/Shanghai，来源DEFAULT_ASIA_SHANGHAI；不新增系统时区配置。历史快照按事实保存，不随用户显示时区变动。 | enum=["DEFAULT_ASIA_SHANGHAI"]         |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelprovidersnapshot"></a>

### ModelProviderSnapshot

检测单项事件内部完整快照的最小安全公开投影；无秘密，供应商/模型删除后仍可解释费用。内部DBModelProviderSnapshot另冻结六项元信息和presentation；公开投影仅保留本组件声明字段，不据公开字段不足回查当前模型补齐。

| 字段                       | 类型/组件                                            | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                            | 约束                                   |
| -------------------------- | ---------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `schema_version`           | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 快照格式版本                                                                                                                                                                        | const=1                                |
| `physical_model_id`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时物理模型 UUID                                                                                                                                                                 | format="uuid"                          |
| `model_id_at_gateway`      | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。       | 无额外格式限制；仍遵守所属组件业务规则 |
| `model_id_at_provider`     | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时上游模型/部署 ID                                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `provider_id`              | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商实例 UUID                                                                                                                                                               | format="uuid"                          |
| `provider_name`            | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商实例名称                                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_key`             | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时模板键                                                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_revision`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时模板规格版本                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `base_url`                 | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时不含秘密的供应商 Base URL                                                                                                                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `public_config`            | [ProviderPublicConfig](#schema-providerpublicconfig) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商非秘密配置，按当时模板白名单解释                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `official_model_binding`   | [OfficialModelBinding](#schema-officialmodelbinding) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 只读官方型号/部署绑定；代次不一致派生 STALE                                                                                                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `base_version`             | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时模型基础版本                                                                                                                                                                  | minimum=1                              |
| `provider_version`         | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商版本                                                                                                                                                                    | minimum=1                              |
| `connection_revision`      | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商连接身份版本                                                                                                                                                            | minimum=1                              |
| `invocation_api`           | [InvocationAPI](#schema-invocationapi)               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 此费用执行项使用的接口及适配器版本快照                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `tags`                     | array&lt;string&gt;                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模型能力标签                                                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_name`            | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从冻结模板标签按请求语言投影的名称；不得读取当前目录冒充历史                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_icon_key`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时受控模板图标键，未知用通用图标                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_catalog_binding` | [CatalogBinding](#schema-catalogbinding)             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次执行/显示所冻结供应商模板来源；model/price两键为null，不能混入模型或价格另一历史批次                                                                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `model_catalog_binding`    | [CatalogBinding](#schema-catalogbinding) / null      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 模型原内置规格的独立历史来源；无来源null，price键为null。供应商改绑后可与template_catalog_binding不同批，不表示当前适配承诺                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `metadata_version`         | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原检测内部完整六项元信息快照的版本；公开仅返回本组件最小字段（含tags），不表示公开携带完整模态/上下文/描述。连续复用按内部冻结六字段及实际探针/计划判断，不依赖公开投影或当前模型。 | minimum=1                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-matchedpriceperiod"></a>

### MatchedPricePeriod

命中的唯一计费时段

| 字段          | 类型/组件                                         | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                          | 约束                                   |
| ------------- | ------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `name`        | string                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 命中时段名称                                                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `is_fallback` | boolean                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否命中兜底时段                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `conditions`  | array&lt;[ConditionRow](#schema-conditionrow)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 有序原始条件行，每行支持多个weekdays；保存/读取保持行数、行分组和输入顺序，不合并或展开；兜底为空。非兜底至少一行，所有时段展开后的窗口不得重叠。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `matched_at`  | string                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 价格选择依据的请求开始时刻                                                                                                                        | format="date-time"                     |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-pricesnapshot"></a>

### PriceSnapshot

完整价快照。PRICED 时 price/matched_period 非空；未定价时 price=null，币种不匹配时允许保留原价 price 用于解释，matched_period=null；本次计费仍为 UNPRICED/CURRENCY_MISMATCH，不换标或换汇。所有规则不依赖价格表存续。 条件行按发送时完整结构固化；当前仅新格式2，不增旧格式兼容分支。

| 字段                | 类型/组件                                                   | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                         | 约束                                             |
| ------------------- | ----------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `schema_version`    | integer                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 价格快照格式版本，当前2；price及matched_period保留原始条件行，PricingBasis为3。                                                                                                                  | const=2                                          |
| `state`             | string                                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 取价状态                                                                                                                                                                                         | enum=["PRICED", "UNPRICED", "CURRENCY_MISMATCH"] |
| `reason_code`       | string / null                                               | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定、可本地化的原因码，不含上游秘密原文                                                                                                                                                         | 无额外格式限制；仍遵守所属组件业务规则           |
| `billing_currency`  | string                                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次总部内部计费币种                                                                                                                                                                             | 无额外格式限制；仍遵守所属组件业务规则           |
| `billing_time_zone` | string                                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版实际计费时区Asia/Shanghai；用户显示时区不影响计价，不新增系统时区设置。                                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则           |
| `price`             | [PricingVersion](#schema-pricingversion) / null             | 是   | 是   | 无静态默认；省略语义见组件/接口 | 价格对象或价格版本，按所属组件定义解释                                                                                                                                                           | 无额外格式限制；仍遵守所属组件业务规则           |
| `metric_specs`      | array&lt;[MetricSpec](#schema-metricspec)&gt;               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次冻结的计量规格；无价格显示快照时，费用指标名和单位直接使用此处冻结值，语言切换不以当前目录改写                                                                                               | 无额外格式限制；仍遵守所属组件业务规则           |
| `matched_period`    | [MatchedPricePeriod](#schema-matchedpriceperiod) / null     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 发送时命中的计费时段，未定价或币种不匹配时 null                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则           |
| `rounding`          | string                                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 精确舍入方法，R02已确认                                                                                                                                                                          | enum=["HALF_EVEN"]                               |
| `amount_scale`      | integer                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 金额小数位数，R02已确认                                                                                                                                                                          | const=18                                         |
| `display_snapshot`  | [PriceDisplaySnapshot](#schema-pricedisplaysnapshot) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 存在已冻结价格版本时非空；没有价格时null，仍可按本任务metric_specs展示已知计量项                                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则           |
| `catalog_binding`   | [CatalogBinding](#schema-catalogbinding) / null             | 是   | 是   | 无静态默认；省略语义见组件/接口 | 与price.catalog_binding相同；price=null或该价格没有目录参考时null。币种不匹配但保留原价时也保留原价来源，不将其表示为本次已计费。此处不是当前模板/指标目录来源，实际价格内容和计量规格仍完整冻结 | 无额外格式限制；仍遵守所属组件业务规则           |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-usagevalue"></a>

### UsageValue

一个计量指标的不可变用量依据

| 字段               | 类型/组件                         | 必填 | 可空 | 默认/省略                       | 字段说明                                      | 约束                                   |
| ------------------ | --------------------------------- | ---- | ---- | ------------------------------- | --------------------------------------------- | -------------------------------------- |
| `value`            | [Decimal](#schema-decimal) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 归一后的精确数量字符串；state=UNKNOWN 时 null | 无额外格式限制；仍遵守所属组件业务规则 |
| `state`            | string                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 已知或未知；已知 0 与未知不同                 | enum=["KNOWN", "UNKNOWN"]              |
| `source_kind`      | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 量值来源类别；没有可靠来源时 null             | 无额外格式限制；仍遵守所属组件业务规则 |
| `upstream_paths`   | array&lt;string&gt;               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 量值的来源路径                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `success_evidence` | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 官方终态/成功标识的安全依据，不含模型内容     | 无额外格式限制；仍遵守所属组件业务规则 |
| `exclusion_basis`  | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 包含、互斥或拆分扣除的安全依据，避免重复计费  | 无额外格式限制；仍遵守所属组件业务规则 |
| `unknown_reason`   | string / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 无法确定量/价/金额的原因码；正常已知时 null   | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-normalizedusage"></a>

### NormalizedUsage

键为 MetricSpec.metric_key 的固定白名单；每个适配计量项均有 UsageValue，未知不得省略成 0。

动态键值：[UsageValue](#schema-usagevalue)。键的具体白名单、条件与权限按组件说明校验。

<a id="schema-rawusage"></a>

### RawUsage

上游 usage 白名单的原始语义快照，键由适配器 schema/revision 固定。数值词法转换为十进制字符串，保持子对象/数组层级；不回显模型内容、秘密或任意上游字段。模型不同的上游键以 06A/06B 映射表为准，前端只审阅，不参与计费。

动态键值：[RawUsageValue](#schema-rawusagevalue)。键的具体白名单、条件与权限按组件说明校验。

<a id="schema-rawusagevalue"></a>

### RawUsageValue

原始 usage 的安全 JSON 值；所有上游数值为精确字符串，不能经 float。

类型：oneOf(null, boolean, string, array&lt;[RawUsageValue](#schema-rawusagevalue)&gt;, object)；约束：无额外格式限制；仍遵守所属组件业务规则。

<a id="schema-costrulesnapshot"></a>

### CostRuleSnapshot

不可变单项算式与依据；保留全部输入，不从当前价格重新计算历史。period完整保存有序ConditionRow；与父CostRecord.price_snapshot格式2同事务固化且一致，不从当前目录补行，不新增自身版本字段。

| 字段              | 类型/组件                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                    | 约束                                   |
| ----------------- | ------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------- | -------------------------------------- |
| `metric_key`      | string                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 指标键                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit`            | string                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 计量单位                                    | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit_divisor`    | integer / null                                          | 是   | 是   | 无静态默认；省略语义见组件/接口 | 单价对应的数量分母；百万 Token 为 1000000   | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit_price`      | [Decimal](#schema-decimal) / null                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 精确单价字符串；非负，不经过浮点            | 无额外格式限制；仍遵守所属组件业务规则 |
| `period`          | [MatchedPricePeriod](#schema-matchedpriceperiod) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 本分项使用的计价时段，未定价时 null         | 无额外格式限制；仍遵守所属组件业务规则 |
| `rounding`        | string                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 分项舍入方法，R02已确认                     | enum=["HALF_EVEN"]                     |
| `amount_scale`    | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 金额小数位数，R02已确认                     | const=18                               |
| `quantity_source` | [UsageValue](#schema-usagevalue)                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本分项对应的归一用量值和来源依据            | 无额外格式限制；仍遵守所属组件业务规则 |
| `unknown_reason`  | string / null                                           | 是   | 是   | 无静态默认；省略语义见组件/接口 | 无法确定量/价/金额的原因码；正常已知时 null | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-checkresultdetail"></a>

### CheckResultDetail

模型请求、兼容性或条件流式检查的详细结果

| 字段                       | 类型/组件           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                             | 约束                                   |
| -------------------------- | ------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `reason_code`              | string / null       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定、可本地化的原因码，不含上游秘密原文                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `http_status`              | integer / null      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 上游 HTTP 状态，未取得响应为空                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `latency_ms`               | integer / null      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 从持久发送意图时刻至本项目结束的经过毫秒；READY/NOT_SENT 或无完整终态为 null；不是供应商精确处理耗时 | 无额外格式限制；仍遵守所属组件业务规则 |
| `protocol`                 | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实际检查的标准接口键或 CUSTOM 适配键                                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `assertions`               | array&lt;object&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 此项目实际断言结果，不包含 Tool Calling/JSON Mode 检测                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `assertions[].key`         | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 版本化断言键，如 RESPONSE_SHAPE/TERMINAL_FRAME                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `assertions[].passed`      | boolean             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该断言是否满足                                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `assertions[].reason_code` | string / null       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定、可本地化的原因码，不含上游秘密原文                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `stream_terminated`        | boolean / null      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 流式协议是否观察到终态；非流式/未执行时 null                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `upstream_request_id`      | string / null       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 供应商允许展示的请求跟踪 ID，无则 null                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `not_applicable_reason`    | string / null       | 是   | 是   | 无静态默认；省略语义见组件/接口 | NOT_APPLICABLE 的原因；其他结果为 null                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `detail_text`              | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从该项目冻结的安全结果码/参数及消息版本按语言返回的说明；不是上游原始报文                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `suggestion_text`          | string / null       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 无建议/成功时null，失败时不得让前端猜error_code含义                                                  | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-checksummary"></a>

### CheckSummary

检查项目汇总。前七个计数始终为实际值；创建时按WAITING/REUSED/NOT_APPLICABLE等实际计划状态初始化，合计为项目总数，不等于计划调用数。无pricing:READ时价费四字段必须省略；有权限但任务未完成时按已固化项目计算，total_amount=null、cost_status=UNKNOWN/PARTIAL，不填假零。

| 字段                   | 类型/组件                         | 必填 | 可空 | 默认/省略                       | 字段说明                                             | 约束                                                            |
| ---------------------- | --------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `passed_items`         | integer                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | PASS 项数                                            | minimum=0                                                       |
| `failed_items`         | integer                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | FAIL 项数                                            | minimum=0                                                       |
| `error_items`          | integer                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | ERROR 项数                                           | minimum=0                                                       |
| `not_applicable_items` | integer                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | NOT_APPLICABLE 项数                                  | minimum=0                                                       |
| `reused_items`         | integer                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | REUSED 项数；不算本次模型调用                        | minimum=0                                                       |
| `waiting_items`        | integer                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | WAITING 项数                                         | minimum=0                                                       |
| `running_items`        | integer                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | RUNNING 项数                                         | minimum=0                                                       |
| `cost_status`          | string                            | 否   | 否   | 无静态默认；省略语义见组件/接口 | 仅 pricing_details_visible=true 才返回的汇总计费状态 | enum=["COMPLETE", "PARTIAL", "UNPRICED", "UNKNOWN", "NOT_SENT"] |
| `currency`             | string                            | 否   | 否   | 无静态默认；省略语义见组件/接口 | 仅价格可见时返回的统一内部币种                       | 无额外格式限制；仍遵守所属组件业务规则                          |
| `known_amount`         | [Decimal](#schema-decimal) / null | 否   | 是   | 无静态默认；省略语义见组件/接口 | 已能确定的金额小计；完全无可计算依据时 null          | 无额外格式限制；仍遵守所属组件业务规则                          |
| `total_amount`         | [Decimal](#schema-decimal) / null | 否   | 是   | 无静态默认；省略语义见组件/接口 | 完整金额；有任何未知项目时 null，不能将小计冒充总额  | 无额外格式限制；仍遵守所属组件业务规则                          |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-providercreate"></a>

### ProviderCreate

新供应商完整创建；不接受 expected_version；余额可选，同事务保存；template_version_id必传，不按template_key静默解析最新版本

| 字段                  | 类型/组件                                            | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                    | 约束                                          |
| --------------------- | ---------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `name`                | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                                                                            | minLength=1；maxLength=128                    |
| `template_key`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例选用的稳定供应商模板键；与template_version_id对应，允许通过既有模板选择和保存修改，目录数据无产品写接口 | 无额外格式限制；仍遵守所属组件业务规则        |
| `base_url`            | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整供应商 Base URL；禁止携带用户名密码或秘密查询参数                                                       | maxLength=2048                                |
| `security_level`      | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商网络安全分类标签；不是出口审批或网络许可                                                              | enum=["INTERNET", "TRUSTED_CLOUD", "PRIVATE"] |
| `public_config`       | [ProviderPublicConfig](#schema-providerpublicconfig) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 创建时的模板公开参数，未知键拒绝                                                                            | 无额外格式限制；仍遵守所属组件业务规则        |
| `secrets`             | [SecretInput](#schema-secretinput)                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 仅请求输入的秘密字段；不回显，不写日志                                                                      | 无额外格式限制；仍遵守所属组件业务规则        |
| `clear_secret_fields` | array&lt;string&gt;                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 明确清除的秘密字段键；与本次非空替换字段不可冲突                                                            | uniqueItems=true                              |
| `notes`               | string / null                                        | 否   | 是   | 无静态默认；省略语义见组件/接口 | 可空备注，去除秘密后原文保存                                                                                | 无额外格式限制；仍遵守所属组件业务规则        |
| `balance_config`      | [BalanceConfigInput](#schema-balanceconfiginput)     | 否   | 否   | 无静态默认；省略语义见组件/接口 | 可选余额配置，与供应商创建同事务；省略为 NONE                                                               | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_version_id` | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | P01返回的准确模板版本UUID，必须与template_key一致；创建只能采用当前允许新绑定版本，编辑不提交模板字段       | format="uuid"                                 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-providerupdate"></a>

### ProviderUpdate

供应商完整编辑；必传读取版本，不限制模型状态，不触发准入；template_version_id必传，不按template_key静默解析最新版本

| 字段                  | 类型/组件                                            | 必填 | 可空 | 默认/省略                       | 字段说明                                              | 约束                                          |
| --------------------- | ---------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `expected_version`    | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                | minimum=1                                     |
| `name`                | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                      | minLength=1；maxLength=128                    |
| `base_url`            | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整供应商 Base URL；禁止携带用户名密码或秘密查询参数 | maxLength=2048                                |
| `security_level`      | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商网络安全分类标签；不是出口审批或网络许可        | enum=["INTERNET", "TRUSTED_CLOUD", "PRIVATE"] |
| `public_config`       | [ProviderPublicConfig](#schema-providerpublicconfig) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 编辑时完整替换的模板公开参数，未知键拒绝              | 无额外格式限制；仍遵守所属组件业务规则        |
| `secrets`             | [SecretInput](#schema-secretinput)                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 仅请求输入的秘密字段；不回显，不写日志                | 无额外格式限制；仍遵守所属组件业务规则        |
| `clear_secret_fields` | array&lt;string&gt;                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 明确清除的秘密字段键；与本次非空替换字段不可冲突      | uniqueItems=true                              |
| `notes`               | string / null                                        | 否   | 是   | 无静态默认；省略语义见组件/接口 | 可空备注，去除秘密后原文保存                          | 无额外格式限制；仍遵守所属组件业务规则        |
| `balance_config`      | [BalanceConfigInput](#schema-balanceconfiginput)     | 否   | 否   | 无静态默认；省略语义见组件/接口 | 可选余额配置，与供应商编辑同事务；省略保持原配置      | 无额外格式限制；仍遵守所属组件业务规则        |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-balanceconfigupdate"></a>

### BalanceConfigUpdate

独立余额配置保存；必传版本（未配置为 0）；NONE 清除运行配置、禁用告警；不隐式查询；配置保存若 channels 含 EMAIL，全部接收者须具有有效邮箱，否则 422 字段错误；不投递。

| 字段                  | 类型/组件                                        | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                     | 约束                                   |
| --------------------- | ------------------------------------------------ | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `expected_version`    | integer                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 读取时的乐观版本；未配置余额为 0；供应商创建禁止传入                                                                                         | minimum=0                              |
| `mode`                | string                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 余额配置模式 NONE/TEMPLATE/CUSTOM                                                                                                            | enum=["NONE", "TEMPLATE", "CUSTOM"]    |
| `currency_or_unit`    | string / null                                    | 否   | 是   | 无静态默认；省略语义见组件/接口 | 供应商余额原币种或单位，与内部计费币种独立。CUSTOM 创建省略时默认 CNY；TEMPLATE 取模板固定单位或其明确允许的选择，编辑省略保持；NONE 可 null | 无额外格式限制；仍遵守所属组件业务规则 |
| `query_config`        | [BalanceQueryConfig](#schema-balancequeryconfig) | 否   | 否   | 无静态默认；省略语义见组件/接口 | 余额查询的公开参数，不含秘密                                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `secrets`             | [SecretInput](#schema-secretinput)               | 否   | 否   | 无静态默认；省略语义见组件/接口 | 仅请求输入的秘密字段；不回显，不写日志                                                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `clear_secret_fields` | array&lt;string&gt;                              | 否   | 否   | 无静态默认；省略语义见组件/接口 | 明确清除的秘密字段键；与本次非空替换字段不可冲突                                                                                             | uniqueItems=true                       |
| `alert_enabled`       | boolean                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否评估余额阈值状态；本版不实际投递通知                                                                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `threshold`           | [Decimal](#schema-decimal) / null                | 否   | 是   | 无静态默认；省略语义见组件/接口 | 低余额阈值精确字符串；启用告警时必须大于 0                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `recipient_user_ids`  | array&lt;string&gt;                              | 否   | 否   | 无静态默认；省略语义见组件/接口 | 告警接收的启用用户 UUID 列表；默认规则见保存接口，不含 system                                                                                | uniqueItems=true                       |
| `channels`            | array&lt;string&gt;                              | 否   | 否   | 无静态默认；省略语义见组件/接口 | 配置的通知渠道；本版仅保存，不投递                                                                                                           | uniqueItems=true                       |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-fieldvalidationschema"></a>

### FieldValidationSchema

模板字段使用的 JSON Schema 2020-12 受限子集。只接受下列关键字，不允许 $ref/远程资源/可执行表达式。

| 字段                   | 类型/组件                                              | 必填 | 可空 | 默认/省略                       | 字段说明                                                               | 约束                                   |
| ---------------------- | ------------------------------------------------------ | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| `type`                 | oneOf(string, array&lt;string&gt;)                     | 否   | 否   | 无静态默认；省略语义见组件/接口 | 允许的 JSON 值类型；SECRET 的前端输入仍为 string                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `enum`                 | array&lt;[JsonValue](#schema-jsonvalue)&gt;            | 否   | 否   | 无静态默认；省略语义见组件/接口 | 允许值集合，省略表示不限制枚举                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `pattern`              | string                                                 | 否   | 否   | 无静态默认；省略语义见组件/接口 | 字符串正则；由后端发布，不执行用户脚本                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `minLength`            | integer                                                | 否   | 否   | 无静态默认；省略语义见组件/接口 | 最短字符串长度                                                         | minimum=0                              |
| `maxLength`            | integer                                                | 否   | 否   | 无静态默认；省略语义见组件/接口 | 最长字符串长度                                                         | minimum=0                              |
| `minimum`              | integer                                                | 否   | 否   | 无静态默认；省略语义见组件/接口 | 整数最小值                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `maximum`              | integer                                                | 否   | 否   | 无静态默认；省略语义见组件/接口 | 整数最大值                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `properties`           | object                                                 | 否   | 否   | 无静态默认；省略语义见组件/接口 | JSON 字段对象的子字段定义；每个键为允许字段名                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `items`                | [FieldValidationSchema](#schema-fieldvalidationschema) | 否   | 否   | 无静态默认；省略语义见组件/接口 | 数组元素规范                                                           | 无额外格式限制；仍遵守所属组件业务规则 |
| `required`             | array&lt;string&gt;                                    | 否   | 否   | 无静态默认；省略语义见组件/接口 | 本层必填字段名称，必须在 properties 中                                 | uniqueItems=true                       |
| `additionalProperties` | boolean                                                | 否   | 否   | 无静态默认；省略语义见组件/接口 | 对象是否允许额外字段；供应商配置和秘密字段固定 false，不能由管理员放宽 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-reusesourcesnapshot"></a>

### ReuseSourceSnapshot

准入接口复用来源快照；本版只复用满足同模型/周期/基础版本的终态完整通过接口。源价格/费用不计入本次，源秘密绝不复制到 API。 source_result 仅是 CheckResultDetail，不包含 reuse_source；若直接来源也是 REUSED，则把原实际 PASS 的结果/配置扁平复制在此一层，source_job_id/source_item_id仍记录直接来源，不递归嵌套。 还需当前所需接口计划及有效探针输入与原快照语义匹配；新需流式不得复用缺STREAMING的旧完整接口结果。纯描述变化不机械拒绝，差异不自动补发。

| 字段                             | 类型/组件                                              | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                         | 约束                                   |
| -------------------------------- | ------------------------------------------------------ | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `source_job_id`                  | string                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原准入任务 UUID；源记录清理后仍保留                                                                                                                              | format="uuid"                          |
| `source_item_id`                 | string                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原检查项目 UUID；只是历史线索，不需要可 JOIN                                                                                                                     | format="uuid"                          |
| `source_base_version`            | integer                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原模型基础配置版本                                                                                                                                               | minimum=1                              |
| `source_admission_epoch`         | string                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原准入周期 UUID，须与复用资格匹配                                                                                                                                | format="uuid"                          |
| `source_provider_version`        | integer                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原检测冻结的供应商版本；可能不同于本次供应商版本                                                                                                                 | minimum=1                              |
| `source_completed_at`            | string                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原项目完成时间                                                                                                                                                   | format="date-time"                     |
| `source_model_provider_snapshot` | [ModelProviderSnapshot](#schema-modelprovidersnapshot) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原实际检测内部完整快照的最小安全公开投影，不含秘密或额外私有元信息。内部DBReuseSourceSnapshot扁平复制完整DBModelProviderSnapshot，连续复用验证不依赖此公开投影。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `source_result`                  | [CheckResultDetail](#schema-checkresultdetail)         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 复制的原 PASS 完整断言和协议结果，不重新执行、不依赖旧 item 存续                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `source_metadata_version`        | integer                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原实际检测内部六字段元信息快照的版本，与内部源快照一致；差异只用于解释，不单独作为复用失效条件。                                                                 | minimum=1                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-displayoption"></a>

### DisplayOption

动态目录选项。前端以value提交，以label展示；不猜测key对应的名称。

| 字段    | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                    | 约束                                   |
| ------- | --------- | ---- | ---- | ------------------------------- | ------------------------------------------- | -------------------------------------- |
| `value` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 提交/匹配使用的稳定选项值，不因语言变化改变 | 无额外格式限制；仍遵守所属组件业务规则 |
| `label` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按Accept-Language协商返回的显示标签，非空   | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-localelabelmap"></a>

### LocaleLabelMap

不可变的语言到标签映射。键必须为系统已注册并在该目录版本发布的BCP47 locale；至少zh-CN和en。额外locale同样是非空文本；读取只从此快照协商/回退，不查询当前目录。

| 字段    | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                       | 约束        |
| ------- | --------- | ---- | ---- | ------------------------------- | ------------------------------ | ----------- |
| `zh-CN` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 发布时冻结的简体中文标签，非空 | minLength=1 |
| `en`    | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 发布时冻结的英文标签，非空     | minLength=1 |

动态键值：string。键的具体白名单、条件与权限按组件说明校验。

<a id="schema-balancetemplatespec"></a>

### BalanceTemplateSpec

只读余额模板规格，供表单展示固定方法/路径/认证和单位；不表示本系统已经对该账户实测。

| 字段                     | 类型/组件                                           | 必填 | 可空 | 默认/省略                       | 字段说明                                            | 约束                                   |
| ------------------------ | --------------------------------------------------- | ---- | ---- | ------------------------------- | --------------------------------------------------- | -------------------------------------- |
| `http_method`            | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模板余额查询HTTP方法                                | enum=["GET", "POST"]                   |
| `path`                   | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模板余额接口的相对路径或规格明确的URL，不含秘密     | 无额外格式限制；仍遵守所属组件业务规则 |
| `auth_field_keys`        | array&lt;string&gt;                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所需认证字段键，标签/控件从同响应balance_fields读取 | 无额外格式限制；仍遵守所属组件业务规则 |
| `calculation_mode`       | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模板余额计算方式                                    | enum=["DIRECT", "SUBTRACT"]            |
| `currency_mode`          | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模板余额单位为固定值还是允许选择                    | enum=["FIXED", "CHOICE"]               |
| `fixed_currency_or_unit` | string / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | FIXED时非空；CHOICE时null                           | 无额外格式限制；仍遵守所属组件业务规则 |
| `currency_options`       | array&lt;[DisplayOption](#schema-displayoption)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | CHOICE时非空；FIXED时[]，不可任意增加新币种         | 无额外格式限制；仍遵守所属组件业务规则 |
| `value_path`             | string / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | DIRECT时非空，否则null                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `total_path`             | string / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | SUBTRACT时非空，否则null                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `used_path`              | string / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | SUBTRACT时非空，否则null                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `description`            | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本地化余额规格说明                                  | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-providerbalancesummary"></a>

### ProviderBalanceSummary

供应商列表直接渲染的余额状态摘要。无配置返回mode=NONE、query_status=NEVER_QUERIED，其余未产生值为null/UNKNOWN；读取不请求供应商。来源为同一供应商的本地配置与最近状态，后端批量关联，不逐行调用B04。

| 字段                              | 类型/组件                          | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                             | 约束                                        |
| --------------------------------- | ---------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `last_balance_value`              | [Decimal](#schema-decimal) / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近一次成功查询的精确余额，未成功为 null                                                                                            | 无额外格式限制；仍遵守所属组件业务规则      |
| `last_balance_unit`               | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近成功余额的实际原币种或单位，未成功为 null                                                                                        | 无额外格式限制；仍遵守所属组件业务规则      |
| `last_attempt_at`                 | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近查询尝试时间；从未查询为 null                                                                                                    | 无额外格式限制；仍遵守所属组件业务规则      |
| `last_success_at`                 | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近成功查询时间；失败不会覆盖该时间                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则      |
| `query_status`                    | string                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 最近一次终态查询状态，不代表当前是否有在途任务                                                                                       | enum=["NEVER_QUERIED", "SUCCESS", "FAILED"] |
| `error_code`                      | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 稳定错误码，成功/无错时 null                                                                                                         | 无额外格式限制；仍遵守所属组件业务规则      |
| `alert_state`                     | string                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前阈值状态；UNKNOWN 不代表正常余额                                                                                                 | enum=["UNKNOWN", "NORMAL", "LOW"]           |
| `active_run_id`                   | string / null                      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 当前在途余额任务 UUID；没有在途或终态已完成时 null                                                                                   | 无额外格式限制；仍遵守所属组件业务规则      |
| `mode`                            | string                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前余额查询模式                                                                                                                     | enum=["NONE", "TEMPLATE", "CUSTOM"]         |
| `alert_enabled`                   | boolean                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否启用余额阈值状态评估；不代表会投递消息                                                                                           | 无额外格式限制；仍遵守所属组件业务规则      |
| `threshold`                       | [Decimal](#schema-decimal) / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 未配置时null；不是内部计费币种                                                                                                       | 无额外格式限制；仍遵守所属组件业务规则      |
| `notification_delivery_supported` | boolean                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前系统是否具备余额通知投递能力；本版按已确认范围返回 false，不表示通知已发送，不是供应商可配置开关或研发进度                       | const=false                                 |
| `error_params`                    | [ErrorParams](#schema-errorparams) | 是   | 否   | 无静态默认；实际本地状态        | 当前状态对应的安全错误参数，从ma_balance_state.error_params读取；无错误为{}，与query_status/error_code同次更新，不拼接其他查询的详情 | 按ErrorParams白名单                         |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-providerlistitem"></a>

### ProviderListItem

供应商列表行，直接满足实例名/模板/地址/安全等级/数量/备注/时间/余额。没有public_config、秘密配置键及无用详情；编辑时读取P04。

| 字段                | 类型/组件                                                | 必填 | 可空 | 默认/省略                       | 字段说明                                                         | 约束                                          |
| ------------------- | -------------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `id`                | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                         | format="uuid"                                 |
| `name`              | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                                 | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_key`      | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 只读供应商模板注册键                                             | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_name`     | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按实例固定模板版本投影的本地化模板名称，不跟随当前发布批次重解释 | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_icon_key` | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 受控本地图标键；未知键显示通用图标，不从外部URL加载              | 无额外格式限制；仍遵守所属组件业务规则        |
| `base_url`          | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整供应商 Base URL；禁止携带用户名密码或秘密查询参数            | 无额外格式限制；仍遵守所属组件业务规则        |
| `security_level`    | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商网络安全分类标签；不是出口审批或网络许可                   | enum=["INTERNET", "TRUSTED_CLOUD", "PRIVATE"] |
| `notes`             | string / null                                            | 是   | 是   | 无静态默认；省略语义见组件/接口 | 可空备注，去除秘密后原文保存                                     | 无额外格式限制；仍遵守所属组件业务规则        |
| `model_count`       | integer                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该供应商关联的当前可见物理模型数量                               | minimum=0                                     |
| `version`           | integer                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                           | minimum=1                                     |
| `created_at`        | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                  | format="date-time"                            |
| `updated_at`        | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                  | format="date-time"                            |
| `balance_summary`   | [ProviderBalanceSummary](#schema-providerbalancesummary) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 与列表一致的本地余额摘要                                         | 无额外格式限制；仍遵守所属组件业务规则        |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modellistitem"></a>

### ModelListItem

模型列表行；展示模型名称/上游ID/供应商/模板图标/模态/状态/健康时间，保留操作版本。基础配置与价格详情按点击读取，不在列表每行请求M04。

| 字段                         | 类型/组件                              | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                                                          |
| ---------------------------- | -------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`                         | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                                                                 |
| `model_id_at_gateway`        | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | minLength=1；maxLength=128                                                    |
| `model_id_at_provider`       | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | minLength=1；maxLength=512                                                    |
| `provider_id`                | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                                                                 |
| `provider_name`              | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前供应商实例显示名称                                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_template_key`      | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属供应商模板稳定键                                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_template_name`     | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按实例固定模板版本投影的本地化模板名称，不跟随当前发布批次重解释                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_template_icon_key` | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 受控模板图标键，未知使用通用图标                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `input_modalities`           | array&lt;string&gt;                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 输入模态集合；未知为空数组，不添加笼统 type                                                                                                                                   | uniqueItems=true                                                              |
| `output_modalities`          | array&lt;string&gt;                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 输出模态集合；未知为空数组                                                                                                                                                    | uniqueItems=true                                                              |
| `tags`                       | array&lt;string&gt;                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 能力标签及自定义标签；流式由规范化注册键识别                                                                                                                                  | uniqueItems=true                                                              |
| `status`                     | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                                                                                                    | enum=["DRAFT", "TESTING", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "RETIRED"] |
| `health_status`              | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 独立健康状态，不与模型生命周期互相替代                                                                                                                                        | enum=["UNKNOWN", "HEALTHY", "UNHEALTHY", "CHECKING"]                          |
| `health_checked_at`          | string / null                          | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最近健康任务完成时间；未查为 null                                                                                                                                             | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `versions`                   | [ModelVersions](#schema-modelversions) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 基础、生命周期、授权、健康、价格的独立版本集合                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `created_at`                 | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                                                                               | format="date-time"                                                            |
| `updated_at`                 | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                                                                               | format="date-time"                                                            |
| `security_level`             | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商网络安全分类标签；不是出口审批或网络许可                                                                                                                                | enum=["INTERNET", "TRUSTED_CLOUD", "PRIVATE"]                                 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-provideroption"></a>

### ProviderOption

模型表单专用供应商最小目录；只在模型管理范围内返回这些公开字段，不返回认证配置，不要求providers:READ。

| 字段                | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                                         | 约束                                          |
| ------------------- | --------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `id`                | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                         | format="uuid"                                 |
| `name`              | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                                 | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_key`      | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 只读供应商模板注册键                                             | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_name`     | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按实例固定模板版本投影的本地化模板名称，不跟随当前发布批次重解释 | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_icon_key` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 受控本地图标键；未知键显示通用图标，不从外部URL加载              | 无额外格式限制；仍遵守所属组件业务规则        |
| `base_url`          | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整供应商 Base URL；禁止携带用户名密码或秘密查询参数            | 无额外格式限制；仍遵守所属组件业务规则        |
| `security_level`    | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商网络安全分类标签；不是出口审批或网络许可                   | enum=["INTERNET", "TRUSTED_CLOUD", "PRIVATE"] |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-provideroptionpage"></a>

### ProviderOptionPage

M09模型创建/编辑供应商候选，支持默认分页搜索和显式全量。paginate=false时page/page_size成对为null，items为全部可见匹配项且total=items.length；分页时两字段为整数。两种模式保持相同权限、筛选、稳定排序及一致性快照。

| 字段        | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                  | 约束                                                                   |
| ----------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `items`     | array&lt;[ProviderOption](#schema-provideroption)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 分页时当前页、全量时全部可见匹配项；空结果返回[]，全量不静默截断。                        | 无额外格式限制；仍遵守所属组件业务规则                                 |
| `page`      | integer / null                                        | 是   | 是   | 无静态默认；省略语义见组件/接口 | 分页时当前页码，从1开始；不分页时null。与另一分页字段成对同为空或同为整数，字段始终必返。 | minimum=1（仅整数分支）；与另一分页字段成对为空或成对整数              |
| `page_size` | integer / null                                        | 是   | 是   | 无静态默认；省略语义见组件/接口 | 分页时每页条数1～100；不分页时null。与另一分页字段成对同为空或同为整数，字段始终必返。    | minimum=1；maximum=100（仅整数分支）；与另一分页字段成对为空或成对整数 |
| `total`     | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一合法可见范围及筛选条件下的总数；不分页等于items.length，不泄露不可见项数量。          | minimum=0                                                              |

未声明字段：拒绝（`additionalProperties=false`）。

条件约束（与OpenAPI一致）：

```json
{
  "allOf": [
    {
      "if": {
        "properties": {
          "page": {
            "type": "null"
          }
        },
        "required": ["page"]
      },
      "then": {
        "properties": {
          "page_size": {
            "type": "null"
          }
        }
      },
      "else": {
        "properties": {
          "page_size": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          }
        }
      }
    }
  ]
}
```

<a id="schema-tagoption"></a>

### TagOption

标签编辑器的已有值建议。目录只读，由内置规格和当前可见模型标签去重生成；允许原型已有的自定义输入，不新建标签管理功能。

| 字段    | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                           | 约束                                   |
| ------- | --------- | ---- | ---- | ------------------------------- | -------------------------------------------------- | -------------------------------------- |
| `value` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 保存到模型tags的原始稳定值；自定义值就是管理员原文 | 无额外格式限制；仍遵守所属组件业务规则 |
| `label` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内置标签按用户语言显示；自定义标签原文显示         | 无额外格式限制；仍遵守所属组件业务规则 |
| `kind`  | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 标签来源类别                                       | enum=["BUILT_IN", "CUSTOM"]            |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-tagoptionpage"></a>

### TagOptionPage

M10当前可见标签去重候选，支持默认分页搜索和显式全量。paginate=false时page/page_size成对为null，items为全部可见匹配项且total=items.length；分页时两字段为整数。两种模式保持相同权限、筛选、稳定排序及一致性快照。

| 字段        | 类型/组件                                   | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                  | 约束                                                                   |
| ----------- | ------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `items`     | array&lt;[TagOption](#schema-tagoption)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 分页时当前页、全量时全部可见匹配项；空结果返回[]，全量不静默截断。                        | 无额外格式限制；仍遵守所属组件业务规则                                 |
| `page`      | integer / null                              | 是   | 是   | 无静态默认；省略语义见组件/接口 | 分页时当前页码，从1开始；不分页时null。与另一分页字段成对同为空或同为整数，字段始终必返。 | minimum=1（仅整数分支）；与另一分页字段成对为空或成对整数              |
| `page_size` | integer / null                              | 是   | 是   | 无静态默认；省略语义见组件/接口 | 分页时每页条数1～100；不分页时null。与另一分页字段成对同为空或同为整数，字段始终必返。    | minimum=1；maximum=100（仅整数分支）；与另一分页字段成对为空或成对整数 |
| `total`     | integer                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一合法可见范围及筛选条件下的总数；不分页等于items.length，不泄露不可见项数量。          | minimum=0                                                              |

未声明字段：拒绝（`additionalProperties=false`）。

条件约束（与OpenAPI一致）：

```json
{
  "allOf": [
    {
      "if": {
        "properties": {
          "page": {
            "type": "null"
          }
        },
        "required": ["page"]
      },
      "then": {
        "properties": {
          "page_size": {
            "type": "null"
          }
        }
      },
      "else": {
        "properties": {
          "page_size": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          }
        }
      }
    }
  ]
}
```

<a id="schema-lifecycleevent"></a>

### LifecycleEvent

模型详情生命周期时间线的最小审计投影。只读取该可见模型的生命周期事件，不返回原始before/after、价格、秘密或其他对象事件；无需audit:READ。

| 字段          | 类型/组件                                    | 必填 | 可空 | 默认/省略                       | 字段说明                                                   | 约束                                                                                                                                                    |
| ------------- | -------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | string                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 已有管理审计事件UUID；本接口稳定事件标识                   | format="uuid"                                                                                                                                           |
| `occurred_at` | string                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件发生时间，UTC                                          | format="date-time"                                                                                                                                      |
| `action`      | string                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模型生命周期动作的稳定码，前端按固定枚举翻译               | enum=["CREATED", "ADMISSION_STARTED", "ADMISSION_PASSED", "ADMISSION_FAILED", "APPROVED", "REJECTED", "SUSPENDED", "RESUMED", "RETIRED", "REACTIVATED"] |
| `from_status` | string / null                                | 是   | 是   | 无静态默认；省略语义见组件/接口 | 创建前无状态时null                                         | 无额外格式限制；仍遵守所属组件业务规则                                                                                                                  |
| `to_status`   | string                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                 | enum=["DRAFT", "TESTING", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "RETIRED"]                                                                           |
| `actor`       | [IdentitySnapshot](#schema-identitysnapshot) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件发生时的操作者快照，自动执行为AUTO，不JOIN当前用户补名 | 无额外格式限制；仍遵守所属组件业务规则                                                                                                                  |
| `reason`      | string / null                                | 是   | 是   | 无静态默认；省略语义见组件/接口 | 未填写时null                                               | 无额外格式限制；仍遵守所属组件业务规则                                                                                                                  |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-lifecycleeventpage"></a>

### LifecycleEventPage

按occurred_at及事件UUID稳定倒序分页；模型无事件返回[]。

| 字段        | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                     | 约束                                   |
| ----------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------- | -------------------------------------- |
| `items`     | array&lt;[LifecycleEvent](#schema-lifecycleevent)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页结果，空页返回[]       | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`      | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页，从1开始              | minimum=1                              |
| `page_size` | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页大小，默认20、最大100  | minimum=1；maximum=100                 |
| `total`     | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一权限范围和筛选条件下总数 | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-invocationapidisplay"></a>

### InvocationAPIDisplay

检测结果显示用的历史接口引用；不包含认证或适配器内部实现信息。

| 字段           | 类型/组件     | 必填 | 可空 | 默认/省略                       | 字段说明                                                           | 约束                                   |
| -------------- | ------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| `id`           | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 检测时启用接口记录的UUID，原配置删除后仍只是历史标识               | format="uuid"                          |
| `api_key`      | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 标准接口稳定键或服务端自定义标识                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `kind`         | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 标准/自定义接口                                                    | enum=["STANDARD", "CUSTOM"]            |
| `path`         | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | STANDARD为null；CUSTOM为当时路径，不能读当前配置代替               | 无额外格式限制；仍遵守所属组件业务规则 |
| `display_name` | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当时接口的本地化显示名称；自定义项包括可识别路径，来自冻结显示依据 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modeldisplaysnapshot"></a>

### ModelDisplaySnapshot

任务历史中的最小模型/供应商展示快照，从ma_check_jobs.model_snapshot投影；不能依赖价格权限、当前模型/供应商配置或已删来源。

| 字段                       | 类型/组件                                       | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                   |
| -------------------------- | ----------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `physical_model_id`        | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时模型UUID                                                                                                                                                                | format="uuid"                          |
| `model_id_at_gateway`      | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `model_id_at_provider`     | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时上游ID/部署名                                                                                                                                                           | 无额外格式限制；仍遵守所属组件业务规则 |
| `provider_id`              | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商UUID                                                                                                                                                              | format="uuid"                          |
| `provider_name`            | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商实例名称原文                                                                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_key`             | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时模板键                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_name`            | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从任务冻结的模板标签协商得出的显示名称                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_icon_key`        | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当时受控图标键；未知用通用图标                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_catalog_binding` | [CatalogBinding](#schema-catalogbinding)        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次执行/显示所冻结供应商模板来源；model/price两键为null，不能混入模型或价格另一历史批次                                                                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `model_catalog_binding`    | [CatalogBinding](#schema-catalogbinding) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 模型原内置规格的独立历史来源；无来源null，price键为null。供应商改绑后可与template_catalog_binding不同批，不表示当前适配承诺                                                   | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-checkcounts"></a>

### CheckCounts

历史列表的项目统计，不包含费用或价格。总项数为这些互斥计数之和，不把REUSED或不适用当实际新调用。

| 字段                   | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                      | 约束      |
| ---------------------- | --------- | ---- | ---- | ------------------------------- | ----------------------------- | --------- |
| `passed_items`         | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | PASS 项数                     | minimum=0 |
| `failed_items`         | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | FAIL 项数                     | minimum=0 |
| `error_items`          | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | ERROR 项数                    | minimum=0 |
| `not_applicable_items` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | NOT_APPLICABLE 项数           | minimum=0 |
| `reused_items`         | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | REUSED 项数；不算本次模型调用 | minimum=0 |
| `waiting_items`        | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | WAITING 项数                  | minimum=0 |
| `running_items`        | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | RUNNING 项数                  | minimum=0 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-checkjobsummary"></a>

### CheckJobSummary

准入/健康历史列表行。直接提供时间、类型、结果、触发人及模型显示信息；不返回items、HTTP细节或费用，点击C03/H05再读完整CheckJob。

| 字段                   | 类型/组件                                                         | 必填 | 可空 | 默认/省略                       | 字段说明                                                                      | 约束                                                 |
| ---------------------- | ----------------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| `id`                   | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                      | format="uuid"                                        |
| `physical_model_id`    | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                      | format="uuid"                                        |
| `purpose`              | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | ADMISSION 准入或 HEALTH 健康；HTTP 摘要组件另用其自身枚举                     | enum=["ADMISSION", "HEALTH"]                         |
| `trigger_type`         | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | MANUAL 人工触发或 AUTO 自动调度                                               | enum=["MANUAL", "AUTO"]                              |
| `triggered_by`         | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 人工触发人的 UUID；自动任务可空，费用始终归 system                            | 无额外格式限制；仍遵守所属组件业务规则               |
| `triggered_by_display` | [IdentitySnapshot](#schema-identitysnapshot)                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当时触发人：MANUAL为冻结用户名字，AUTO为自动任务身份；不要求pricing:READ      | 无额外格式限制；仍遵守所属组件业务规则               |
| `model_display`        | [ModelDisplaySnapshot](#schema-modeldisplaysnapshot)              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 任务时模型与供应商显示引用，不从CostRecord取值                                | 无额外格式限制；仍遵守所属组件业务规则               |
| `status`               | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                    | enum=["QUEUED", "RUNNING", "COMPLETED", "CANCELLED"] |
| `result`               | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 任务汇总结果；未结束时 null，不能把 ACCEPTED 当 PASS                          | 无额外格式限制；仍遵守所属组件业务规则               |
| `created_at`           | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                               | format="date-time"                                   |
| `started_at`           | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 实际开始时间；尚未开始为空时以字段可空定义为准                                | 无额外格式限制；仍遵守所属组件业务规则               |
| `completed_at`         | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 终态完成时间；未完成为 null                                                   | 无额外格式限制；仍遵守所属组件业务规则               |
| `counts`               | [CheckCounts](#schema-checkcounts)                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 历史行通过/失败等计数                                                         | 无额外格式限制；仍遵守所属组件业务规则               |
| `check_types`          | array&lt;string&gt;                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本轮计划/历史实际包含的检测类型集合，供列表展示；不以ADMISSION/HEALTH用途代替 | uniqueItems=true                                     |
| `invocation_apis`      | array&lt;[InvocationAPIDisplay](#schema-invocationapidisplay)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本轮接口去重摘要；历史行不必逐项请求详情以补接口名称                          | 无额外格式限制；仍遵守所属组件业务规则               |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-metricrateinput"></a>

### MetricRateInput

价格写入分项：只提交稳定指标键、单位及精确单价；不可提交或覆盖服务端名称/单位标签。

| 字段         | 类型/组件                  | 必填 | 可空 | 默认/省略                       | 字段说明                         | 约束                                   |
| ------------ | -------------------------- | ---- | ---- | ------------------------------- | -------------------------------- | -------------------------------------- |
| `metric_key` | string                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 必须属于模型适配白名单           | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit`       | string                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 必须匹配适配单位                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit_price` | [Decimal](#schema-decimal) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 精确单价字符串；非负，不经过浮点 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-metricratedisplay"></a>

### MetricRateDisplay

价格读取分项，写接口只接受MetricRateInput；名字不取当前适配目录以免改写历史语义。

| 字段           | 类型/组件                  | 必填 | 可空 | 默认/省略                       | 字段说明                                                               | 约束                                   |
| -------------- | -------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| `metric_key`   | string                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 必须属于模型适配白名单                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit`         | string                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 必须匹配适配单位                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit_price`   | [Decimal](#schema-decimal) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 精确单价字符串；非负，不经过浮点                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `display_name` | string                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按当前请求语言从此价格版本冻结标签中选出的指标短名称                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit_label`   | string                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按当前请求语言从该版本冻结标签中选出的计价单位文本；不改变unit/divisor | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-priceperioddisplay"></a>

### PricePeriodDisplay

完整读取价格时段。业务时段名原文；各计量显示标签来自对应价格版本快照。

| 字段           | 类型/组件                                                   | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                          | 约束                                   |
| -------------- | ----------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `name`         | string                                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                                                                                                                  | minLength=1；maxLength=128             |
| `is_fallback`  | boolean                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否兜底时段；每个价格版本恰好一个                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `conditions`   | array&lt;[ConditionRow](#schema-conditionrow)&gt;           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 有序原始条件行，每行支持多个weekdays；保存/读取保持行数、行分组和输入顺序，不合并或展开；兜底为空。非兜底至少一行，所有时段展开后的窗口不得重叠。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `metric_rates` | array&lt;[MetricRateDisplay](#schema-metricratedisplay)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前时段完整指标与费率                                                                                                                            | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-pricedisplaymetric"></a>

### PriceDisplayMetric

一个计量项在创建价格版本时被冻结的展示规格；每个metric_key恰一项且与价格时段指标集合一致。

| 字段            | 类型/组件                                | 必填 | 可空 | 默认/省略                       | 字段说明                        | 约束                                   |
| --------------- | ---------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------- | -------------------------------------- |
| `metric_key`    | string                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该价格版本的稳定计量指标键      | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit`          | string                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对应稳定计价单位                | 无额外格式限制；仍遵守所属组件业务规则 |
| `display_names` | [LocaleLabelMap](#schema-localelabelmap) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 发布/改价时冻结的指标名称标签集 | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit_labels`   | [LocaleLabelMap](#schema-localelabelmap) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同版本冻结的单位标签集          | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-pricedisplaysnapshot"></a>

### PriceDisplaySnapshot

ma_price_versions.display_snapshot的完整不可变结构；费用复制至PriceSnapshot.display_snapshot。外层现有catalog_revision/adapter_revision记录目录版本，不在这里重复。普通R01/R02只返回已选语言的显示字段，不传整个多语言标签集。

| 字段              | 类型/组件                                                     | 必填 | 可空 | 默认/省略                       | 字段说明                                          | 约束                                   |
| ----------------- | ------------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------- | -------------------------------------- |
| `schema_version`  | integer                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 不可变显示快照结构版本，当前1                     | const=1                                |
| `fallback_locale` | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 已注册BCP47回退语言；必须在该快照所有标签集中存在 | 无额外格式限制；仍遵守所属组件业务规则 |
| `created_by`      | [IdentitySnapshot](#schema-identitysnapshot)                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 创建价格版本时用户身份事实，不依赖该用户继续存在  | 无额外格式限制；仍遵守所属组件业务规则 |
| `metrics`         | array&lt;[PriceDisplayMetric](#schema-pricedisplaymetric)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 与该价格版本所有时段的计量项一一对应              | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-importedmodelview"></a>

### ImportedModelView

导入完成后的最小配置回显，支持引导下一步直接显示已保存名称与接口并使用真实版本。

| 字段                       | 类型/组件                                           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                                                          |
| -------------------------- | --------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `physical_model_id`        | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 已创建或当前可见已存在的新版物理模型UUID                                                                                                                                      | format="uuid"                                                                 |
| `model_id_at_gateway`      | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `model_id_at_provider`     | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实际保存后的上游ID                                                                                                                                                            | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_id`              | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商UUID                                                                                                                                                                    | format="uuid"                                                                 |
| `provider_name`            | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商实例名                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `status`                   | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                                                                                                    | enum=["DRAFT", "TESTING", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "RETIRED"] |
| `versions`                 | [ModelVersions](#schema-modelversions)              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实际保存后的全部版本；后续检测/发布必须回传，禁止猜初值1                                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `invocation_apis`          | array&lt;[InvocationAPI](#schema-invocationapi)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实际保存的标准协议及透传配置，按保存顺序回显。没有配置时为 []。                                                                                                               | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `catalog_model_version_id` | string / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 该对象实际采用的内置型号来源；没有可信匹配为null。历史来源不随目录发布或供应商改绑自动更新，不表示当前仍可适配                                                                | 无额外格式限制；仍遵守所属组件业务规则                                        |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-importbatchitem"></a>

### ImportBatchItem

导入逐行结果。前端按 input_index 映射回提交时的行序。恢复或幂等重放返回固化结果，对象不可见时不披露其 UUID 或名称。

| 字段                | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                                                                       | 约束                                             |
| ------------------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| `input_index`       | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对应请求数组的零起始下标，用于逐项反馈                                         | minimum=0                                        |
| `physical_model_id` | string / null                                         | 是   | 是   | 无静态默认；省略语义见组件/接口 | 新版物理模型 UUID；不接受旧逻辑模型或 model_resources ID                       | 无额外格式限制；仍遵守所属组件业务规则           |
| `status`            | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                     | enum=["CREATED", "SKIPPED_EXISTING", "REJECTED"] |
| `code`              | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | CREATED 与 SKIPPED_EXISTING 为 OK，REJECTED 返回该行错误码                     | 无额外格式限制；仍遵守所属组件业务规则           |
| `params`            | [ErrorParams](#schema-errorparams)                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | REJECTED 必有 reason_code，fields 使用相对于该行的路径。参数不含秘密或原始报文 | 无额外格式限制；仍遵守所属组件业务规则           |
| `model`             | [ImportedModelView](#schema-importedmodelview) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 成功/当前可见的SKIPPED_EXISTING时返回；未创建或对象不可见时null                | 无额外格式限制；仍遵守所属组件业务规则           |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-importbatchresult"></a>

### ImportBatchResult

D02专用结果。导入不会请求模型；返回实际接口/版本可直接进入引导，无需每行M04。

| 字段              | 类型/组件                                               | 必填 | 可空 | 默认/省略                       | 字段说明                   | 约束                                   |
| ----------------- | ------------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------- | -------------------------------------- |
| `items`           | array&lt;[ImportBatchItem](#schema-importbatchitem)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 与输入顺序一一对应         | 无额外格式限制；仍遵守所属组件业务规则 |
| `succeeded_count` | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 成功创建条数               | minimum=0                              |
| `skipped_count`   | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 重复已有条数，不计成功创建 | minimum=0                              |
| `failed_count`    | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 未创建失败条数             | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-batchmodelcontext"></a>

### BatchModelContext

批量检测/发布逐模型显示上下文，不携带完整配置/秘密/价格。

| 字段                   | 类型/组件                              | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                                                          |
| ---------------------- | -------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `physical_model_id`    | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前可见模型UUID                                                                                                                                                              | format="uuid"                                                                 |
| `model_id_at_gateway`  | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `model_id_at_provider` | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次操作时上游ID                                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_id`          | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属供应商UUID                                                                                                                                                                | format="uuid"                                                                 |
| `provider_name`        | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商实例显示名                                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `status`               | string                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                                                                                                    | enum=["DRAFT", "TESTING", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "RETIRED"] |
| `versions`             | [ModelVersions](#schema-modelversions) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该项受理/发布后的实际版本                                                                                                                                                     | 无额外格式限制；仍遵守所属组件业务规则                                        |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-balancerecipientdisplay"></a>

### BalanceRecipientDisplay

余额通知配置的最小用户显示资料；不是通用身份查询。B06只列可见启用人员；B01对已选但不可见/不存在的ID返回空名称的不可用占位，不从selected_ids越权查人。

| 字段                 | 类型/组件      | 必填 | 可空 | 默认/省略                       | 字段说明                                                                     | 约束                                   |
| -------------------- | -------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `user_id`            | string         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定用户UUID，保存仍提交recipient_user_ids；不可见已选项只保留原配置中已知ID | format="uuid"                          |
| `username`           | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 已选对象不可见/不存在时null                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `display_name`       | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 不可见/不存在时null，不能补查填名                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `department_id`      | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 不可返回时null                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `department_name`    | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 不可返回时null                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `department_path`    | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 不可返回时null，不泄露越界祖先                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `email`              | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 未配置或主体不可见时null；不提供其他联系方式                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `email_valid`        | boolean / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 主体不可见时null，不能由空值推断存在                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `selectable`         | boolean        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前是否可作为此用途的接收者；仅启用、可见且非system                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `unavailable_reason` | string / null  | 是   | 是   | 无静态默认；省略语义见组件/接口 | 可选时null；EMAIL缺邮箱仍可选用于IN_APP，保存EMAIL另校验                     | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-balancerecipientoptionpage"></a>

### BalanceRecipientOptionPage

余额配置选人搜索/分页；q包含可见部门及所有后代人员搜索，department_id固定包含子部门，按user_id去重后分页；只返回当前用户管理范围启用、非system人员，不返回部门接收对象，不需identity.users或model.permissions权限。

| 字段             | 类型/组件                                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                 | 约束                                   |
| ---------------- | ----------------------------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `items`          | array&lt;[BalanceRecipientDisplay](#schema-balancerecipientdisplay)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页结果，空页返回[]                                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`           | integer                                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页，从1开始                                                                                          | minimum=1                              |
| `page_size`      | integer                                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页大小，默认20、最大100                                                                              | minimum=1；maximum=100                 |
| `total`          | integer                                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一权限范围和筛选条件下总数                                                                             | minimum=0                              |
| `selected_items` | array&lt;[BalanceRecipientDisplay](#schema-balancerecipientdisplay)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 可选provider_id指定有权限的现有配置时补回当前页外已选项；不接受任意selected_ids查询。没有provider_id时[] | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelauthorizationsummary"></a>

### ModelAuthorizationSummary

身份页面所需最小模型展示引用；仅名称、供应商、模态及可用性相关状态，不返回官方绑定/内部适配器/配置版本/价格。名称已随行提供，不要求模型详情权限。

| 字段                         | 类型/组件           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                                                          |
| ---------------------------- | ------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`                         | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                                                                 |
| `model_id_at_gateway`        | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | minLength=1；maxLength=128                                                    |
| `model_id_at_provider`       | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | minLength=1；maxLength=512                                                    |
| `provider_id`                | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                                                                 |
| `provider_name`              | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前供应商实例显示名称                                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_template_key`      | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属供应商模板稳定键                                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_template_name`     | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属模板的本地化显示名称                                                                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_template_icon_key` | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 受控模板图标键，未知使用通用图标                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `input_modalities`           | array&lt;string&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 输入模态集合；未知为空数组，不添加笼统 type                                                                                                                                   | uniqueItems=true                                                              |
| `output_modalities`          | array&lt;string&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 输出模态集合；未知为空数组                                                                                                                                                    | uniqueItems=true                                                              |
| `status`                     | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                                                                                                    | enum=["DRAFT", "TESTING", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "RETIRED"] |
| `health_status`              | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 独立健康状态，不与模型生命周期互相替代                                                                                                                                        | enum=["UNKNOWN", "HEALTHY", "UNHEALTHY", "CHECKING"]                          |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelauthorizationsummarypage"></a>

### ModelAuthorizationSummaryPage

身份模型授权选择器的分页候选；并非模型详情读取权限。保存时重新验证主体/模型状态与授权范围，候选不是授权凭证。

| 字段        | 类型/组件                                                                   | 必填 | 可空 | 默认/省略                       | 字段说明                                                 | 约束                                   |
| ----------- | --------------------------------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| `items`     | array&lt;[ModelAuthorizationSummary](#schema-modelauthorizationsummary)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 仅ACTIVE且未由当前主体直接授权的可选模型，不泄露无权对象 | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`      | integer                                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页，从1开始                                          | minimum=1                              |
| `page_size` | integer                                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页默认20、最大100                                      | minimum=1；maximum=100                 |
| `total`     | integer                                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 相同主体/范围/搜索条件的候选总数                         | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-customapiview"></a>

### CustomAPIView

> 历史双数组的回显字段。当前模型已保存配置见 [InvocationAPI](#schema-invocationapi)。

| 字段       | 类型   | 必填 | 说明                                                            |
| ---------- | ------ | ---- | --------------------------------------------------------------- |
| `protocol` | string | 是   | 启用协议标识，与 `supported_invocation_apis` 同一位置的值一致。 |
| `path`     | string | 是   | 已配置相对上游路径。必须以 `/` 开头且不含空白。                 |

<a id="schema-catalogbinding"></a>

### CatalogBinding

不可变数据库目录来源绑定；同一对象内五键必须指向同一完整发布批次。运行模板、模型原来源、价格来源分别保存对象，允许它们属于不同历史批次；引用只用于追溯，不代表当前可采用/可适配，也不能替代已固化的完整内容。

| 字段                       | 类型/组件     | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                  | 约束                                   |
| -------------------------- | ------------- | ---- | ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `catalog_release_id`       | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | ma_catalog_releases.id，准确目录发布批次UUID                                                              | format="uuid"                          |
| `catalog_revision`         | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对应发布批次唯一可读revision；与ID一致，不是项目评审版本                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_version_id`      | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该批次ma_catalog_provider_templates.id                                                                    | format="uuid"                          |
| `catalog_model_version_id` | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 模型目录条目UUID；仅模板来源或未匹配型号时null                                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_price_version_id` | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 仅OFFICIAL_REFERENCE官方价格目录UUID；无官方参考null。企业默认通过独立default_reference追溯，不复用此键。 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modelidavailability"></a>

### ModelIdAvailability

模型调用ID即时占用检查结果，仅供当前表单提示；不预留名称、不保证之后保存仍可用，也不是模型详情读取接口。

| 字段                             | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                          | 约束                                   |
| -------------------------------- | --------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `normalized_model_id_at_gateway` | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端按与最终保存相同规则去首尾空白后的调用ID；不改变大小写、不做Unicode规范化；前端以此值提示及提交。           | minLength=1；maxLength=128             |
| `available`                      | boolean   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前检查时刻，除合法exclude_model_id自身外，系统全局是否没有完全相同调用ID。false仅表示不可用，不返回占用者信息。 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-pricingbasis"></a>

### PricingBasis

每一内部价格版本固化的schema3计价依据；服务端判定，客户端不能写source/kind。完整保存产品默认与官方原币参考，实际计费使用已持久化内部价；40新增自动APPLIED，旧管理员CONFIRMED历史保留，不能通过JOIN当前目录重建历史。 数据库中的default_reference以DBEnterpriseDefaultPricingSnapshot保全period_name_labels和fallback_locale；公开EnterpriseDefaultPricingTemplate去掉这两个私有键，再从冻结语言集投影periods[].name。价格/费用/审计保全私有快照，不查当前目录重建历史，公开响应仍拒绝额外字段。 当前仅使用有序ConditionRow新结构，不提供此次升级前旧格式读取。

| 字段                  | 类型/组件                                                                           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 约束                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema_version`      | integer                                                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 计价依据快照结构版本，当前3；官方/默认规则均保留有序ConditionRow。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | const=3                                                                                                                                                                                                      |
| `kind`                | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | ENTERPRISE_DEFAULT_CONFIRMED=首次创建/导入提交与适用产品默认规则语义完全相同；OFFICIAL_PREFILL_CONFIRMED=无默认时首次官方参考后确认；ENTERPRISE_DEFAULT_ZERO=无默认且真实缺价时首次完整FIXED零价；ENTERPRISE_CONFIGURED=修改默认后的自定义价或后续任何改价（包括恢复默认）。由服务端判定，不能仅凭数字碰巧相同伪造来源。 首次是否原样采用默认：先按is_fallback及规范化conditions定位对应时段，再比较完整指标/Decimal费率/模式；name可为该同一时段已发布的任一语言标签，同语言下时段标签发布时必须唯一，不能以当前请求语言变化误判自定义。非已发布别名或改规则/费率记ENTERPRISE_CUSTOM。 40修订新增ENTERPRISE_DEFAULT_APPLIED=服务端自动采用企业默认、OFFICIAL_REFERENCE_APPLIED=自动采用官方原数（F40-01已确认，不换汇）、ZERO_FALLBACK_APPLIED=真实缺价或官方复杂规则无法表达时自动全0；三者source均BUILT_IN，不冒充CONFIRMED。 | enum=["OFFICIAL_PREFILL_CONFIRMED", "ENTERPRISE_CONFIGURED", "ENTERPRISE_DEFAULT_ZERO", "ENTERPRISE_DEFAULT_CONFIRMED", "ENTERPRISE_DEFAULT_APPLIED", "OFFICIAL_REFERENCE_APPLIED", "ZERO_FALLBACK_APPLIED"] |
| `default_zero_reason` | string / null                                                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 仅ENTERPRISE_DEFAULT_ZERO或ZERO_FALLBACK_APPLIED非空，新ZERO_FALLBACK_APPLIED允许PRICE_UNAVAILABLE/NO_PUBLIC_PRICE/UNSUPPORTED_RULE；旧ENTERPRISE_DEFAULT_ZERO仍只允许前两项；其他kind为null。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则                                                                                                                                                                       |
| `official_reference`  | [BuiltinPricingTemplate](#schema-builtinpricingtemplate) / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 有catalog_price_version_id必须非空且ID一致，包括后续改价继承的旧参考；无参考为null。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 无额外格式限制；仍遵守所属组件业务规则                                                                                                                                                                       |
| `default_reference`   | [EnterpriseDefaultPricingTemplate](#schema-enterprisedefaultpricingtemplate) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 独立完整产品默认规则快照；与catalog_default_price_version_id共同为空或共同非空且ID一致。可以与official_reference并存，后者只供参考；默认未被原样采用时仍能保留形成依据。 历史公开读取时使用其内部冻结标签投影时段名；私有标签/回退键不暴露，不从当前目录补译。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则                                                                                                                                                                       |

未声明字段：拒绝（`additionalProperties=false`）。

条件约束（与OpenAPI一致）：

```json
{
  "allOf": [
    {
      "if": {
        "properties": {
          "kind": {
            "description": "旧人工真实缺价零价或新自动缺价/复杂规则零价。",
            "enum": ["ENTERPRISE_DEFAULT_ZERO", "ZERO_FALLBACK_APPLIED"]
          }
        },
        "required": ["kind"]
      },
      "then": {
        "properties": {
          "default_zero_reason": {
            "type": "string",
            "enum": ["PRICE_UNAVAILABLE", "NO_PUBLIC_PRICE", "UNSUPPORTED_RULE"],
            "description": "真实归零理由必填非null；复杂官方规则使用UNSUPPORTED_RULE。"
          },
          "official_reference": {
            "type": "null",
            "description": "默认免费不是官方报价。"
          },
          "default_reference": {
            "type": "null",
            "description": "缺价/复杂规则零价不是已发布产品默认。"
          }
        }
      },
      "else": {
        "properties": {
          "default_zero_reason": {
            "type": "null",
            "description": "非零价兜底来源没有归零理由。"
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "description": "首次官方参考后明确确认。",
            "enum": ["OFFICIAL_PREFILL_CONFIRMED", "OFFICIAL_REFERENCE_APPLIED"]
          }
        },
        "required": ["kind"]
      },
      "then": {
        "properties": {
          "official_reference": {
            "$ref": "#/components/schemas/BuiltinPricingTemplate",
            "description": "完整原币官方参考必须存在。"
          },
          "default_reference": {
            "type": "null",
            "description": "官方预填确认仅在没有适用产品默认时形成。"
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "enum": ["ENTERPRISE_DEFAULT_CONFIRMED", "ENTERPRISE_DEFAULT_APPLIED"]
          }
        },
        "required": ["kind"]
      },
      "then": {
        "properties": {
          "default_reference": {
            "$ref": "#/components/schemas/EnterpriseDefaultPricingTemplate"
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "const": "ENTERPRISE_DEFAULT_ZERO"
          }
        },
        "required": ["kind"]
      },
      "then": {
        "properties": {
          "default_zero_reason": {
            "type": "string",
            "enum": ["PRICE_UNAVAILABLE", "NO_PUBLIC_PRICE"],
            "description": "历史人工确认零价保持原原因集合；复杂规则自动归零使用ZERO_FALLBACK_APPLIED。"
          }
        }
      }
    }
  ]
}
```

40修订：新增`ENTERPRISE_DEFAULT_APPLIED`、`OFFICIAL_REFERENCE_APPLIED`、`ZERO_FALLBACK_APPLIED`，均为`source=BUILT_IN`，schema_version仍为3及原五键；不冒充人工CONFIRMED。官方原数自动应用、复杂规则全0、失配价保护及无计量项未定价例外已按F40-01～04确认。完整条件约束以同步设计JSON为准。

<a id="schema-pricingpreparation"></a>

### PricingPreparation

独立只读价格准备，适用企业默认优先于官方数字；无默认且真实缺价或官方复杂规则无法表达时完整零价建议。无metric返回NOT_APPLICABLE/null预填并允许F40-04检测和上架例外；不在读取时建价，不替代D03的事务准备。

| 字段                       | 类型/组件                                                                           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                                                                                                                                                                                                           | 约束                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `provider_id`              | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次可管理的供应商实例UUID。                                                                                                                                                                                                                                                                                                                                                       | format="uuid"                                                                                    |
| `provider_version`         | integer                                                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 准备时供应商实例版本；创建/导入回传expected_provider_version。                                                                                                                                                                                                                                                                                                                     | minimum=1                                                                                        |
| `model_id_at_provider`     | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 规范化上游模型ID/部署名；不凭部署名推断官方型号。                                                                                                                                                                                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `catalog_binding`          | [CatalogBinding](#schema-catalogbinding)                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例固定模板批次及可信型号/选中官方参考的完整关联；未匹配型号时model/price ID为null。                                                                                                                                                                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `metric_specs`             | array&lt;[MetricSpec](#schema-metricspec)&gt;                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所选已适配调用接口的完整计量指标全集及显示单位；尚无已识别计量规格时为空，不造request指标或阻止原PRD允许的手工创建。调用协议不支持与无计量规格分开处理。                                                                                                                                                                                                                           | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `billing_currency`         | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前总部内部币种；未配置为CNY，不是官方参考币种。                                                                                                                                                                                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `currency_source`          | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部币种来源。                                                                                                                                                                                                                                                                                                                                                                     | enum=["HEADQUARTERS", "DEFAULT_CNY"]                                                             |
| `billing_time_zone`        | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版内部计费时区固定Asia/Shanghai。                                                                                                                                                                                                                                                                                                                                                | const="Asia/Shanghai"                                                                            |
| `time_zone_source`         | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版不新增系统时区设置。                                                                                                                                                                                                                                                                                                                                                           | enum=["DEFAULT_ASIA_SHANGHAI"]                                                                   |
| `reference_state`          | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 官方参考事实：AVAILABLE有可表达官方参考且适用已知指标；PRICE_UNAVAILABLE无法获取定价；NO_PUBLIC_PRICE无公开单价；UNSUPPORTED_RULE复杂或不完整规则。metric_specs为空是无可配置计量项，不能借本状态伪造免费单价。 NOT_APPLICABLE仅服务端确定metric_specs=[]，无需准备价格参考；不是无法获取定价或免费。                                                                              | enum=["AVAILABLE", "PRICE_UNAVAILABLE", "NO_PUBLIC_PRICE", "UNSUPPORTED_RULE", "NOT_APPLICABLE"] |
| `official_reference`       | [BuiltinPricingTemplate](#schema-builtinpricingtemplate) / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | AVAILABLE非空；NOT_APPLICABLE/其他状态为null。NOT_APPLICABLE仅表示实际没有计量规格，不读取/泄露价格参考；无价原因不能来自权限隐藏。                                                                                                                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `prefill_origin`           | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 待确认内部表单建议来源：适用ENTERPRISE_DEFAULT优先，其次OFFICIAL_NUMERIC_REFERENCE，再符合真实缺价或复杂规则归零条件的ENTERPRISE_DEFAULT_ZERO，否则NONE；此预填来源不等于落库PricingBasis.kind。不是已生效价格。                                                                                                                                                                   | enum=["ENTERPRISE_DEFAULT", "OFFICIAL_NUMERIC_REFERENCE", "ENTERPRISE_DEFAULT_ZERO", "NONE"]     |
| `internal_pricing_prefill` | [PricingInput](#schema-pricinginput) / null                                         | 是   | 是   | 无静态默认；省略语义见组件/接口 | 完整待确认内部规则。适用产品默认优先（0有效，不与官方逐字段混合）；无默认才按可表达官方数字/真实缺价全0；无默认且官方复杂规则时为完整FIXED零价建议，只有无计量项时null。币种取当前预算缺省CNY；首次expected_price_version=0；官方与默认参考ID分别准确带回。                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `default_reference`        | [EnterpriseDefaultPricingTemplate](#schema-enterprisedefaultpricingtemplate) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 固定批次可信型号命中的完整产品默认；优先用于预填。无默认或真实无计量项null；不完整/不兼容默认不得当成未配置静默回退。 默认时段名是产品模板文案：M13/M14的default_reference.periods[].name和内部预填按Accept-Language从固定批次period_name_labels投影，缺译用所属模板fallback_locale。官方参考时段名保持官方原文，管理员已保存的period.name保持确认原文，切语言不重命名既有内部价。 | 无额外格式限制；仍遵守所属组件业务规则                                                           |

未声明字段：拒绝（`additionalProperties=false`）。

条件组合约束（与机器契约一致，业务引用匹配仍由服务端事务校验）：

```json
{
  "allOf": [
    {
      "if": {
        "properties": {
          "reference_state": {
            "const": "NOT_APPLICABLE",
            "description": "真实无计量规格分支。"
          }
        },
        "required": ["reference_state"]
      },
      "then": {
        "properties": {
          "metric_specs": {
            "type": "array",
            "maxItems": 0,
            "description": "真实空计量集合。"
          },
          "official_reference": {
            "type": "null",
            "description": "不读取价格参考。"
          },
          "internal_pricing_prefill": {
            "type": "null",
            "description": "无可配置价。"
          },
          "prefill_origin": {
            "const": "NONE",
            "description": "没有预填。"
          },
          "default_reference": {
            "type": "null",
            "description": "真实无计量项不读取默认价格。"
          }
        }
      },
      "else": {
        "properties": {
          "metric_specs": {
            "type": "array",
            "minItems": 1,
            "description": "准备价格时必须有真实非空计量规格。"
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "reference_state": {
            "const": "AVAILABLE"
          }
        },
        "required": ["reference_state"]
      },
      "then": {
        "properties": {
          "official_reference": {
            "$ref": "#/components/schemas/BuiltinPricingTemplate"
          }
        }
      },
      "else": {
        "properties": {
          "official_reference": {
            "type": "null"
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "default_reference": {
            "type": "object"
          }
        },
        "required": ["default_reference"]
      },
      "then": {
        "properties": {
          "prefill_origin": {
            "const": "ENTERPRISE_DEFAULT"
          },
          "internal_pricing_prefill": {
            "$ref": "#/components/schemas/PricingInput"
          }
        }
      },
      "else": {
        "if": {
          "properties": {
            "reference_state": {
              "const": "AVAILABLE"
            }
          },
          "required": ["reference_state"]
        },
        "then": {
          "properties": {
            "prefill_origin": {
              "const": "OFFICIAL_NUMERIC_REFERENCE"
            },
            "internal_pricing_prefill": {
              "$ref": "#/components/schemas/PricingInput"
            }
          }
        },
        "else": {
          "if": {
            "properties": {
              "reference_state": {
                "enum": ["PRICE_UNAVAILABLE", "NO_PUBLIC_PRICE", "UNSUPPORTED_RULE"]
              }
            },
            "required": ["reference_state"]
          },
          "then": {
            "properties": {
              "prefill_origin": {
                "const": "ENTERPRISE_DEFAULT_ZERO"
              },
              "internal_pricing_prefill": {
                "$ref": "#/components/schemas/PricingInput"
              }
            }
          },
          "else": {
            "properties": {
              "prefill_origin": {
                "const": "NONE"
              },
              "internal_pricing_prefill": {
                "type": "null"
              }
            }
          }
        }
      }
    }
  ]
}
```

<a id="schema-modelidentityinput"></a>

### ModelIdentityInput

M05 的完整身份及协议域。上游身份仅 DRAFT 可改。RETIRED 可修改网关名称及协议路径，提交时锁定字段回传原值。目录来源须匹配当前目标。

| 字段                       | 类型/组件                                                     | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                   |
| -------------------------- | ------------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `provider_id`              | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                          |
| `model_id_at_gateway`      | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | minLength=1；maxLength=128             |
| `model_id_at_provider`     | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | minLength=1；maxLength=512             |
| `invocation_apis`          | array&lt;[InvocationAPIInput](#schema-invocationapiinput)&gt; | 是   | 否   | 必传                            | 完整有序配置。已有行回传 ID。                                                                                                                                                 | maxItems=32                            |
| `catalog_model_version_id` | string / null                                                 | 否   | 是   | 无静态默认；省略语义见组件/接口 | 可选当前基础来源；显式null清除，省略且供应商/上游ID未变则保留；目标改变时后端重新核实或清除不成立来源。新选择须匹配供应商固定批次，不以型号字符串猜Azure部署身份              | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

条件组合约束（与机器契约一致，业务引用匹配仍由服务端事务校验）：

DRAFT 显式传 `invocation_apis: []` 可清空。RETIRED 编辑时至少保留一行，可同次替换。

<a id="schema-modelmetadatainput"></a>

### ModelMetadataInput

M05 元信息完整域，DRAFT、ACTIVE、SUSPENDED、RETIRED 可按权限保存。六个键必填：未知集合[]、未知数值及描述null，不省略清空。编辑不修改身份、接口、准入周期或生命周期，不自动触发/取消检测。

| 字段                | 类型/组件           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                  | 约束                                   |
| ------------------- | ------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `input_modalities`  | array&lt;string&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 输入模态集合；未知为空数组，不添加笼统 type                               | uniqueItems=true                       |
| `output_modalities` | array&lt;string&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 输出模态集合；未知为空数组                                                | uniqueItems=true                       |
| `context_window`    | integer / null      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 模型上下文 Token 整数，未知 null，界面 1K=1000                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `max_output_tokens` | integer / null      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 最大输出 Token 整数，未知 null                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `tags`              | array&lt;string&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 能力标签及自定义标签；流式由规范化注册键识别                              | uniqueItems=true                       |
| `description`       | string / null       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 管理员填写的模型说明原文；未知或未填为null，不按Accept-Language自动翻译。 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-enterprisedefaultpricingtemplate"></a>

### EnterpriseDefaultPricingTemplate

产品/研发按型号预置、随不可变数据库目录批次发布的只读企业默认规则。FIXED/TIME_BASED及非零/零单价均可；必须覆盖适用的完整计量项。不是官方报价，没有产品管理写接口；发布更新不覆盖已保存价格/费用。 默认时段名是产品模板文案：M13/M14的default_reference.periods[].name和内部预填按Accept-Language从固定批次period_name_labels投影，缺译用所属模板fallback_locale。官方参考时段名保持官方原文，管理员已保存的period.name保持确认原文，切语言不重命名既有内部价。 数据库中的default_reference以DBEnterpriseDefaultPricingSnapshot保全period_name_labels和fallback_locale；公开EnterpriseDefaultPricingTemplate去掉这两个私有键，再从冻结语言集投影periods[].name。价格/费用/审计保全私有快照，不查当前目录重建历史，公开响应仍拒绝额外字段。

| 字段                               | 类型/组件                                                 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                                                  | 约束                                   |
| ---------------------------------- | --------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `catalog_default_price_version_id` | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | price_kind=ENTERPRISE_DEFAULT的不可变ma_catalog_prices条目UUID。                                                                                                                                                          | format="uuid"                          |
| `catalog_model_version_id`         | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该默认规则适用的准确ma_catalog_models条目；不凭部署名猜型号。                                                                                                                                                             | format="uuid"                          |
| `catalog_release_id`               | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一完整目录批次UUID。                                                                                                                                                                                                    | format="uuid"                          |
| `catalog_revision`                 | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同批次不可变发布revision；不代表项目评审版本。                                                                                                                                                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `adapter_revision`                 | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该型号计量映射对应的后端适配器版本。                                                                                                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `currency_mode`                    | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 产品默认数值模板不携带官方币种；使用保存时的内部预算币种，缺省CNY，不换汇。                                                                                                                                               | const="SYSTEM_BILLING_CURRENCY"        |
| `pricing_mode`                     | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 固定价 FIXED 或分时价 TIME_BASED                                                                                                                                                                                          | enum=["FIXED", "TIME_BASED"]           |
| `time_zone`                        | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部默认分时规则固定按Asia/Shanghai解释。                                                                                                                                                                                 | const="Asia/Shanghai"                  |
| `periods`                          | array&lt;[PricePeriodInput](#schema-priceperiodinput)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整固定/分时默认规则；periods[].name按当前请求语言从该版本冻结标签投影，规则条件、单位及费率不随语言改变。不是管理员已保存价格时段名称。 时段及其中conditions均按输入顺序保存/返回，保留每行weekdays集合；不合并或拆行。 | minItems=1                             |
| `rounding`                         | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部Decimal舍入规则。                                                                                                                                                                                                     | const="HALF_EVEN"                      |
| `amount_scale`                     | integer                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部金额小数精度。                                                                                                                                                                                                        | const=18                               |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-defaultpricingpreparation"></a>

### DefaultPricingPreparation

M14只读产品/研发按型号发布的企业默认规则，固定实例目录批次。现有模型模式仅读取当前价格版本用于并发断言，不把当前价当默认、不修改价格；不查询官方报价。M13负责创建优先级和完整参考事实，二者解析同一适用默认。

| 字段                       | 类型/组件                                                                           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                                                                                                                                                                                                           | 约束                                                   |
| -------------------------- | ----------------------------------------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `provider_id`              | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次可管理的供应商实例UUID。                                                                                                                                                                                                                                                                                                                                                       | format="uuid"                                          |
| `provider_version`         | integer                                                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 准备时供应商实例版本；创建/导入回传expected_provider_version。                                                                                                                                                                                                                                                                                                                     | minimum=1                                              |
| `model_id_at_provider`     | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 规范化上游模型ID/部署名；不凭部署名推断官方型号。                                                                                                                                                                                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则                 |
| `catalog_binding`          | [CatalogBinding](#schema-catalogbinding)                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例固定模板批次及可信型号；本接口不读取官方参考，所以catalog_price_version_id恒null。企业默认独立完整来源在default_reference中，不能把默认ID填入官方参考键。                                                                                                                                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则                 |
| `metric_specs`             | array&lt;[MetricSpec](#schema-metricspec)&gt;                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所选已适配调用接口的完整计量指标全集及显示单位；尚无已识别计量规格时为空，不造request指标或阻止原PRD允许的手工创建。调用协议不支持与无计量规格分开处理。                                                                                                                                                                                                                           | 无额外格式限制；仍遵守所属组件业务规则                 |
| `billing_currency`         | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前总部内部币种；未配置为CNY，不是官方参考币种。                                                                                                                                                                                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则                 |
| `currency_source`          | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部币种来源。                                                                                                                                                                                                                                                                                                                                                                     | enum=["HEADQUARTERS", "DEFAULT_CNY"]                   |
| `billing_time_zone`        | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版内部计费时区固定Asia/Shanghai。                                                                                                                                                                                                                                                                                                                                                | const="Asia/Shanghai"                                  |
| `time_zone_source`         | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版不新增系统时区设置。                                                                                                                                                                                                                                                                                                                                                           | enum=["DEFAULT_ASIA_SHANGHAI"]                         |
| `state`                    | string                                                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | AVAILABLE=完整适用产品默认；NOT_CONFIGURED=可信型号未预置默认或未匹配可信型号；NOT_APPLICABLE=确无计量项。已存在但失配/损坏不是NOT_CONFIGURED，应返回目录错误。                                                                                                                                                                                                                    | enum=["AVAILABLE", "NOT_CONFIGURED", "NOT_APPLICABLE"] |
| `default_reference`        | [EnterpriseDefaultPricingTemplate](#schema-enterprisedefaultpricingtemplate) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 固定批次可信型号命中的完整产品默认；优先用于预填。无默认或真实无计量项null；不完整/不兼容默认不得当成未配置静默回退。 默认时段名是产品模板文案：M13/M14的default_reference.periods[].name和内部预填按Accept-Language从固定批次period_name_labels投影，缺译用所属模板fallback_locale。官方参考时段名保持官方原文，管理员已保存的period.name保持确认原文，切语言不重命名既有内部价。 | 无额外格式限制；仍遵守所属组件业务规则                 |
| `internal_pricing_prefill` | [PricingInput](#schema-pricinginput) / null                                         | 是   | 是   | 无静态默认；省略语义见组件/接口 | AVAILABLE为完整默认数值按当前内部币种形成的待确认规则，默认参考ID准确带回。现有模型模式expected_price_version取实际当前值，官方参考键省略以保留已有参考；创建前模式expected_price_version=0且官方参考null，最终创建用M13取得完整官方/默认上下文。其他state为null，不自行回退官方价或免费。                                                                                         | 无额外格式限制；仍遵守所属组件业务规则                 |
| `model_id`                 | string / null                                                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 现有模型模式返回该模型UUID；创建前模式null。不接受任意无权模型作为查询上下文。                                                                                                                                                                                                                                                                                                     | 无额外格式限制；仍遵守所属组件业务规则                 |

未声明字段：拒绝（`additionalProperties=false`）。

条件组合约束（与机器契约一致，业务引用匹配仍由服务端事务校验）：

```json
{
  "allOf": [
    {
      "if": {
        "properties": {
          "state": {
            "const": "AVAILABLE"
          }
        },
        "required": ["state"]
      },
      "then": {
        "properties": {
          "metric_specs": {
            "minItems": 1
          },
          "default_reference": {
            "$ref": "#/components/schemas/EnterpriseDefaultPricingTemplate"
          },
          "internal_pricing_prefill": {
            "$ref": "#/components/schemas/PricingInput"
          }
        }
      },
      "else": {
        "properties": {
          "default_reference": {
            "type": "null"
          },
          "internal_pricing_prefill": {
            "type": "null"
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "state": {
            "const": "NOT_APPLICABLE"
          }
        },
        "required": ["state"]
      },
      "then": {
        "properties": {
          "metric_specs": {
            "maxItems": 0
          }
        }
      },
      "else": {
        "properties": {
          "metric_specs": {
            "minItems": 1
          }
        }
      }
    }
  ]
}
```

## 5. 条件必填、空值和省略的补充规则

| 组件/字段                 | 明确语义                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ProviderCreate            | 无 expected_version；name/template_key/template_version_id/base_url/security_level/public_config 必填；notes 省略为 null，balance_config 省略则余额 NONE；秘密按模板条件必填。                                                                                                    |
| ProviderUpdate            | expected_version必填，禁止template_key及template_version_id；基础配置完整替换；notes 省略保持、null 清空；balance_config 省略保持；secrets 省略/空字符串保留，clear_secret_fields 明确清除；必需秘密清除且无替换返回 422。                                                        |
| ModelCreate               | 基础四项必填；其余元信息按字段默认；health 默认关闭/360；initial_grants 默认空；pricing 省略尝试已核实且币种相符的内置价，否则未定价，不填假零价。                                                                                                                                |
| ModelUpdate               | 至少提交base/metadata/grants/pricing/health一域；base仅DRAFT且expected_base_version，metadata全状态且expected_metadata_version；health需其版本；授权/价格自带版本；仅版本参数422。                                                                                                |
| ModelUpdate.base          | 仅完整身份/协议域，必填五类字段含完整自定义接口集合；不提交base表示该域不变。模态/标签/上下文/最大输出/描述改用metadata完整六字段，null/[]显式清空，不接受跨域字段。                                                                                                              |
| 自定义接口 id             | 创建条目时省略或 null，由后端分配；更新时既有条目带 id，必须属于本模型；不得传其他模型 ID。                                                                                                                                                                                       |
| 标准调用接口              | 40修订中D02及空草稿响应允许两者皆空；D03/C01检测仍要求标准或已适配自定义合计至少一项。M03仍要求接口非空；M05仅DRAFT基础编辑允许空集合。自定义路径匹配不到适配协议时明确拒绝，不猜协议、不要求用户写脚本。                                                                         |
| BalanceConfigInput/Update | 首次 config version=0；独立 B02 必传 expected_version；嵌入已有 provider 配置时也必传，首次可为 0。mode NONE 时禁用告警，query_config={}，currency/threshold 为 null，recipient/channels 可空；TEMPLATE 单位按模板；CUSTOM 新建省略币种默认 CNY，显式 null 不合法；编辑省略保持。 |
| CUSTOM 余额查询           | method/url/auth_type/calculation_mode 必填；DIRECT 必填 value_path；SUBTRACT 必填 total_path/used_path，以 Decimal 计算总额减已用；两值同币种/单位，任一路径缺失/非法均失败，不能补 0 或再次调用接口。GET body=null；POST body 可为空对象；字段路径不执行脚本。                   |
| 余额认证秘密              | NONE 无秘密；BEARER 使用 secrets.token；HEADER 使用 auth_header_name 与 secrets.header_value；TEMPLATE 的键取 P01.balance_fields。秘密不准出现在公开 query_config/body/url。                                                                                                      |
| 余额接收者/渠道           | 创建且启用预警时未传 recipient_user_ids 则取当前启用管理员，未传 channels 默认 IN_APP；必须有合法接收者和渠道；保存配置选择 EMAIL 时所有接收者须有有效邮箱，否则 422。已有配置编辑省略则保持；明确空数组且 alert_enabled=true 返回 422。threshold 启用时 >0；本版仍不投递。       |
| PricePeriodInput          | FIXED 恰一个 is_fallback=true、conditions=[]；TIME_BASED 恰一个兜底、非兜底至少一个窗口；同周窗口不得重叠，各时段指标集合相同。                                                                                                                                                   |
| Decimal                   | 数据库字段上限：金额/单价 20 位整数+18 位小数，归一数量 26 位整数+12 位小数；请求超精度拒绝，未知为 null，金额计算按已通过的HALF_EVEN对每个分项舍入18位后求和。JSON 字符串不使用指数。                                                                                            |
| CheckJob 价格权限         | pricing_details_visible=false 时每项 cost=null，summary 不含 cost_status/currency/known_amount/total_amount；后台仍完整保存费用。                                                                                                                                                 |
| CheckSummary 总额         | 只有所有应计项目币种一致且金额完整时 total_amount 非空；复用项不计本次成本，不适用项为 NOT_SENT，不重复累计历史费用。                                                                                                                                                             |
| GrantDelta                | add 与 remove_grant_ids 同时提交，空数组可表示该类无变更；相同主体冲突 422；后端原子保存，前端删除确认不转成 confirmed 或 proof 字段。                                                                                                                                            |
| SubjectGrantReplace       | physical_model_ids 为本主体可管理集合的完整目标；后端保留调用者不可见关系。不是当前分页列表的覆盖保存，前端必须汇总完整受管理集合。                                                                                                                                               |
| 未来 PROJECT              | 本版 subject_type 明确不接收 PROJECT；未来需评审后扩展枚举、主体校验与来源解析，不会默认生效。                                                                                                                                                                                    |
| 动态选项一致性            | DynamicField.options和Template.auth_modes的value为稳定提交值，label是显示文本；选项值须与validation_schema.enum一致。visible_when只控制可见，required_when只控制必填，二者不能互相代替。                                                                                          |
| V1.2显示字段只读          | template_name/icon_key、provider_name、指标display_name/unit_label、actor及recipient回显仅响应字段；写接口拒绝这些字段，仍提交稳定ID/key和经许可的业务值。                                                                                                                        |
| Model/ListItem            | Model详情所有回显键必返，null/[]表示未获取；列表返回安全等级、health_checked_at和操作versions，不把详情裁剪误做列表漏字段。                                                                                                                                                       |
| Provider列表              | P02直接返回模板显示信息及balance_summary，无须P01补名字或逐行B04。model_count仅当前可见数量；删除仍完整检查全部依赖权限，不能据此误判空供应商。                                                                                                                                   |
| 历史记录                  | C02/H02返回CheckJobSummary含check_types/接口显示摘要/触发人；C03/H05返回项目详情。检测显示不依赖pricing:READ的CostRecord。                                                                                                                                                        |
| PriceDisplaySnapshot      | 事件时创建人和BCP47指标/单位标签保存于新display_snapshot列；至少zh-CN/en，fallback_locale必须有标签。普通价格响应只返协商后标签，费用完整快照另外保留全部标签；不从当前目录改写历史。                                                                                             |
| 价格当前高亮              | 比较R03.price_version或M04.versions.price与历史版本号；不在固化PricingVersion中塞入会随时间漂移的is_current。                                                                                                                                                                     |
| M08价格权限               | models READ或WRITE允许读取模板元信息；无pricing:READ时pricing_details_visible=false、builtin_pricing=null、pricing_state=HIDDEN，不能由模型模板读取绕过价格权限。提交价格仍需pricing:WRITE。                                                                                      |
| A12部门树                 | 无q按parent_id读取可见直接子节点，省略parent_id返回可见根；带q按范围搜索并带可见ancestors；q与parent_id互斥。真实范围外父部门不返回，has_children仅统计可见子节点。                                                                                                               |
| A13授权候选               | 按目标主体同时校验对应identity能力和model.permissions能力；只返回ACTIVE且未直授的最小模型引用。继承关系不等于直授。ACTIVE仅限制本用途新增，已有非ACTIVE关系可保留/撤销，M03/A02模型侧DRAFT授权不受影响。候选不是保存授权凭证，保存时重新验证。                                    |
| B06/已选人员              | B06只列可见启用且非system人员；可用provider_id读取其真实已选集合形成selected_items，禁止任意selected_ids。B01已选不可见人员只保留原已知ID与通用不可用占位，姓名/邮箱等为null。                                                                                                    |
| Discovery统计             | stats.scope=LOADED，只覆盖已加载快照且不随当前分页；added+addable=loaded；name_conflicts是addable子集，不重复相加。建议名称的冲突提示不能代替保存事务唯一检查，也不透露冲突模型是谁。                                                                                             |
| ImportBatchResult         | CREATED/SKIPPED_EXISTING/REJECTED三种结果；成功model含实际versions及接口，前端不得猜base=1。失败或不可见已有对象model=null，不能据错误补查其名称。                                                                                                                                |

## 6. 旧草案路径与新版路径对照

本表用于退役核对，左列不是新系统可调用端点。整个模型业务 API 不提供兼容层。

| 编号 | 旧草案路径（退役）                                                     | 全新路径                                                                            |
| ---- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P01  | `GET /api/v1/provider-templates`                                       | `GET /api/v1/model-access/provider-templates`                                       |
| P02  | `GET /api/v1/providers`                                                | `GET /api/v1/model-access/providers`                                                |
| P03  | `POST /api/v1/providers`                                               | `POST /api/v1/model-access/providers`                                               |
| P04  | `GET /api/v1/providers/{provider_id}`                                  | `GET /api/v1/model-access/providers/{provider_id}`                                  |
| P05  | `PUT /api/v1/providers/{provider_id}`                                  | `PUT /api/v1/model-access/providers/{provider_id}`                                  |
| P06  | `DELETE /api/v1/providers/{provider_id}`                               | `DELETE /api/v1/model-access/providers/{provider_id}`                               |
| D01  | `POST /api/v1/providers/{provider_id}/models/discover`                 | `POST /api/v1/model-access/providers/{provider_id}/models/discover`                 |
| D02  | `POST /api/v1/providers/{provider_id}/models/import`                   | `POST /api/v1/model-access/providers/{provider_id}/models/import`                   |
| D03  | `POST /api/v1/providers/{provider_id}/models/admission-tests`          | `POST /api/v1/model-access/providers/{provider_id}/models/admission-tests`          |
| D04  | `POST /api/v1/providers/{provider_id}/models/publish`                  | `POST /api/v1/model-access/providers/{provider_id}/models/publish`                  |
| D05  | `GET /api/v1/providers/{provider_id}/model-discoveries/{discovery_id}` | `GET /api/v1/model-access/providers/{provider_id}/model-discoveries/{discovery_id}` |
| M01  | `GET /api/v1/models`                                                   | `GET /api/v1/model-access/models`                                                   |
| M02  | `GET /api/v1/models/summary`                                           | `GET /api/v1/model-access/models/summary`                                           |
| M03  | `POST /api/v1/models`                                                  | `POST /api/v1/model-access/models`                                                  |
| M04  | `GET /api/v1/models/{model_id}`                                        | `GET /api/v1/model-access/models/{model_id}`                                        |
| M05  | `PUT /api/v1/models/{model_id}`                                        | `PUT /api/v1/model-access/models/{model_id}`                                        |
| M06  | `DELETE /api/v1/models/{model_id}`                                     | `DELETE /api/v1/model-access/models/{model_id}`                                     |
| M07  | `PUT /api/v1/models/{model_id}/status`                                 | `PUT /api/v1/model-access/models/{model_id}/status`                                 |
| M08  | `GET /api/v1/models/templates`                                         | `GET /api/v1/model-access/models/templates`                                         |
| M09  | `—（V1.2补齐，无旧路径）`                                              | `GET /api/v1/model-access/model-options/providers`                                  |
| M10  | `—（V1.2补齐，无旧路径）`                                              | `GET /api/v1/model-access/model-options/tags`                                       |
| M11  | `—（V1.2补齐，无旧路径）`                                              | `GET /api/v1/model-access/models/{model_id}/lifecycle-events`                       |
| C01  | `POST /api/v1/models/{model_id}/admission-tests`                       | `POST /api/v1/model-access/models/{model_id}/admission-tests`                       |
| C02  | `GET /api/v1/models/{model_id}/admission-tests`                        | `GET /api/v1/model-access/models/{model_id}/admission-tests`                        |
| C03  | `GET /api/v1/models/{model_id}/admission-tests/{test_id}`              | `GET /api/v1/model-access/models/{model_id}/admission-tests/{test_id}`              |
| C04  | `GET /api/v1/models/{model_id}/admission-tests/latest`                 | `GET /api/v1/model-access/models/{model_id}/admission-tests/latest`                 |
| H01  | `POST /api/v1/models/{model_id}/health-checks`                         | `POST /api/v1/model-access/models/{model_id}/health-checks`                         |
| H02  | `GET /api/v1/models/{model_id}/health-checks`                          | `GET /api/v1/model-access/models/{model_id}/health-checks`                          |
| H03  | `GET /api/v1/models/{model_id}/health-checks/latest`                   | `GET /api/v1/model-access/models/{model_id}/health-checks/latest`                   |
| H04  | `PUT /api/v1/models/{model_id}/health-config`                          | `PUT /api/v1/model-access/models/{model_id}/health-config`                          |
| H05  | `GET /api/v1/models/{model_id}/health-checks/{test_id}`                | `GET /api/v1/model-access/models/{model_id}/health-checks/{test_id}`                |
| A01  | `GET /api/v1/models/{model_id}/permissions`                            | `GET /api/v1/model-access/models/{model_id}/permissions`                            |
| A02  | `PUT /api/v1/models/{model_id}/permissions`                            | `PUT /api/v1/model-access/models/{model_id}/permissions`                            |
| A03  | `POST /api/v1/models/permissions/batch`                                | `POST /api/v1/model-access/models/permissions/batch`                                |
| A04  | `GET /api/v1/users/{user_id}/accessible-models`                        | `GET /api/v1/model-access/users/{user_id}/accessible-models`                        |
| A05  | `GET /api/v1/users/{user_id}/model-grants`                             | `GET /api/v1/model-access/users/{user_id}/model-grants`                             |
| A06  | `PUT /api/v1/users/{user_id}/model-grants`                             | `PUT /api/v1/model-access/users/{user_id}/model-grants`                             |
| A07  | `GET /api/v1/departments/{department_id}/model-grants`                 | `GET /api/v1/model-access/departments/{department_id}/model-grants`                 |
| A08  | `PUT /api/v1/departments/{department_id}/model-grants`                 | `PUT /api/v1/model-access/departments/{department_id}/model-grants`                 |
| A09  | `GET /api/v1/groups/{group_id}/model-grants`                           | `GET /api/v1/model-access/groups/{group_id}/model-grants`                           |
| A10  | `PUT /api/v1/groups/{group_id}/model-grants`                           | `PUT /api/v1/model-access/groups/{group_id}/model-grants`                           |
| A11  | `GET /api/v1/users/{user_id}/model-grant-sources`                      | `GET /api/v1/model-access/users/{user_id}/model-grant-sources`                      |
| A12  | `GET /api/v1/model-permission-subjects`                                | `GET /api/v1/model-access/model-permission-subjects`                                |
| A13  | `—（V1.2补齐，无旧路径）`                                              | `GET /api/v1/model-access/model-permission-models`                                  |
| R01  | `GET /api/v1/models/{model_id}/pricing`                                | `GET /api/v1/model-access/models/{model_id}/pricing`                                |
| R02  | `POST /api/v1/models/{model_id}/pricing`                               | `POST /api/v1/model-access/models/{model_id}/pricing`                               |
| R03  | `GET /api/v1/models/{model_id}/pricing/current`                        | `GET /api/v1/model-access/models/{model_id}/pricing/current`                        |
| B01  | `GET /api/v1/providers/{provider_id}/balance-config`                   | `GET /api/v1/model-access/providers/{provider_id}/balance-config`                   |
| B02  | `PUT /api/v1/providers/{provider_id}/balance-config`                   | `PUT /api/v1/model-access/providers/{provider_id}/balance-config`                   |
| B03  | `POST /api/v1/providers/{provider_id}/balance-query`                   | `POST /api/v1/model-access/providers/{provider_id}/balance-query`                   |
| B04  | `GET /api/v1/providers/{provider_id}/balance`                          | `GET /api/v1/model-access/providers/{provider_id}/balance`                          |
| B05  | `GET /api/v1/providers/{provider_id}/balance-queries/{run_id}`         | `GET /api/v1/model-access/providers/{provider_id}/balance-queries/{run_id}`         |
| B06  | `—（V1.2补齐，无旧路径）`                                              | `GET /api/v1/model-access/balance-recipient-options`                                |

## 7. 评审与验证边界

本文件按原PRD及重新核验摘要一致的原型资源细化页面读写契约；本轮不把浏览器导航超时写成实际UI验收通过。仅细化既有产品功能和新接口设计，不代表 R01～R09、数据库专项、默认时区、Decimal 精度/依赖、Rerank 或供应商字段差异已通过。供应商研究仍为 2026-11-06 的官方资料快照，本次补充没有重新调用供应商。所有真实 API、浏览器联调、鉴权/权限、数据库、计费和上游调用测试均 `not_run`。

## 8. 数据库目录版本的条件契约（本轮修订）

模板/内置型号/价格目录的权威来源为数据库完整不可变发布批次；后端代码仅提供已允许的适配执行逻辑。新目录包是导入介质，不能作为运行时兜底。P01/M08仍为现有只读接口，不新增目录CRUD、管理后台或版本选择页面。

| 场景                   | 请求及响应规则                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新建供应商             | P01取当前批次；P03提交准确template_version_id+template_key。当前批次已变化且该版本不再允许新绑定时409 CATALOG_CHANGED，保留草稿重新读取，不静默按新规则保存。                                                     |
| 编辑已有供应商         | 先P04取原绑定，再P01?provider_id读取旧规格；P05普通编辑回传原ID，目录发布不影响。通过既有模板选择明确改选当前模板版本（可同key）才改绑定；无新升级按钮，不自动复验/下架。                                         |
| 模型目录读取           | M08提供provider_id时固定该实例模板批次；响应带catalog_release_id/catalog_revision，续页回传批次。无provider时默认当前，明确历史批次只读不授予新绑定资格。                                                         |
| 发现与导入             | D01首次固定配置/模板/目录批次；D05和D02从快照读取，续页和幂等恢复不重取current。显式型号ID与服务器候选一致；手工无选择首次受理固定可信匹配或null。                                                                |
| 模型来源               | catalog_model_version_id表示实际采用来源，不代表已通过检测或当前仍适配。DRAFT基础改目标须重核或清除，目录发布/供应商改绑不自动回写旧模型元信息。                                                                  |
| 价格参考输入           | PricingInput.catalog_price_version_id省略：R02/M05继承当前参考，无旧价/M03为null；显式null清除。保留同当前价旧参考允许历史批次；改选另一ID须实例固定批次及可信型号匹配。保存始终ENTERPRISE_CUSTOM，无可写source。 |
| 创建价格前置（40修订） | D02不配置价格；M03不强制价格，显式对象仍按原权限保存。D03/C01初价准备规则与F40已确认边界见40；目录不自动覆盖已有有效BUILT_IN或企业自定义价。                                                                      |
| 历史关联               | CatalogBinding五键同批一致；template_catalog_binding、model_catalog_binding和价格catalog_binding分别保存，允许各自历史批次不同。费用和任务仍完整自持事实，不JOIN当前目录重释。                                    |
| 目录并发与幂等         | 首次命令受理固化catalog_context；同key重放、逐项恢复、后台发送不得重新解析当前发布指针。CATALOG_CHANGED为409，CATALOG_INCOMPATIBLE为422，CATALOG_UNAVAILABLE为503；均不得自动换版本重发。                         |

价格隐藏权限、秘密隔离、Decimal、单次模型请求、DRAFT基础限制和其余已确认范围保持。目录版本ID均为服务端校验的关联，不是客户端扩大权限或伪造BUILT_IN/VERIFIED的凭据。V1.2数据库专项和32项已获用户回执；本版新增设计仍须按变更范围核对，未实施。

## 9. 模型调用ID检查与已确认评审落实（V1.3）

M12仅用于创建、DRAFT编辑和引导导入的保存前提示；最终唯一性仍由M03/M05/D02事务及数据库全局唯一索引保证，不新增预留表、检查令牌或命名空间。

| 场景        | 确切行为                                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 规范化      | 固定Unicode White_Space 25码点去首尾空白；与Go strings.TrimSpace约定集合一致，不用JavaScript trim代替服务端。规范化后1～128个码点，保留大小写及内部字符，不做Unicode规范化；U+0000不允许写入。              |
| 创建        | 仅model.models:WRITE；省略exclude_model_id。全局精确比对，不能只查当前可见列表。                                                                                                                            |
| 编辑        | 带当前model UUID。先对象WRITE/范围校验；不存在/不可见统一404且不执行占用查询；非DRAFT返回409。合法对象才能从占用集合排除自身，不能任意排除竞争者。                                                          |
| 信息保护    | 仅返回规范化输入及available。占用者无论可见与否都只显示“该调用ID不可用”；无owner/name/provider/部门/数量/状态、无推荐可用ID，无前缀检索。此布尔结果是完成全局唯一预检所需最小事实，不等于完全隐藏名称占用。 |
| 输入错误    | query形状/UUID非法400 MALFORMED_REQUEST；规范化为空/超长/包含NUL为422 VALIDATION_FAILED。认证失败401、无WRITE403。                                                                                          |
| 并发        | 检查不锁定/预留ID，available=true后仍可能被抢先保存；最终409 NAME_CONFLICT仅给本字段错误，不披露占用者。所有尚未物理删除的状态均占用ID。                                                                    |
| 导入        | 前端对本批草稿先以相同规则查重，再作M12逐项提示；最终D02再次校验本批及已保存记录，先识别既有上游ID跳过，再仅对待创建项同批查重；重复名项REJECTED。                                                          |
| 前端竞态    | 输入变化使旧结果立即失效；只接受仍匹配当前输入和exclude对象的最新请求结果。检查失败不能当可用；只改授权、价格或健康无需调用M12。                                                                            |
| 缓存/副作用 | 所有响应no-store；不触发模型请求、不写命令或目录、不增加Idempotency-Key。预检不是授权凭证，保存再校验权限/范围/状态/版本。                                                                                  |

R03的接口集合规则已同步请求、响应及组合约束；ImportItem省略配置时先解析可信建议再作业务校验，不能凭原始缺字段误判。R09本版计费时区缺省Asia/Shanghai，time_zone_source为DEFAULT_ASIA_SHANGHAI，不新增系统时区配置或接口；用户显示时区与计费分开。R08已选择5分钟截止，按真实结果保存ERROR/UNKNOWN，不自动重发或后补结算。

## 10. V1.3：官方参考与内部价确认闭环

官方目录只存真实原币参考及官方来源，不用内部手册价格。M08/M13不按总部币种过滤官方价；单一报价唯一解析，多币种目录发布须明确preferred_reference_currency，只决定参考选择，不新增币种下拉框。目录pricing_unavailable_reason仅PRICE_UNAVAILABLE、NO_PUBLIC_PRICE、UNSUPPORTED_RULE或null；无参考且无明确理由的发布包不合格。

| 阶段/条件                              | 契约                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 准备                                   | M13先需models:WRITE及实例范围；真实metric非空才需pricing:READ，确空走NOT_APPLICABLE；传provider_id、上游ID、所选标准/自定义接口及可选可信目录型号。解析已适配metric全集；纯手工无目录也必须可解析，未知调用协议拒绝；调用已适配但无计量规格时metric_specs=[]，不造request单价。                                                                                                                                                                           |
| 有官方参考                             | 始终独立显示原币原单位/官方来源；只有无适用产品默认且官方规则完整可表达时，internal_pricing_prefill才借用官方数值，currency采用预算币种缺省CNY。有完整产品默认则按默认预填，不混入官方值。管理员仍须确认保存；不是换汇，不承诺相同购买力或复刻官方账单。无默认且官方复杂/指标不完整时不选最低档、不自动填0。                                                                                                                                              |
| 无价默认免费                           | 无适用产品默认、服务端确认非空计量指标且PRICE_UNAVAILABLE/NO_PUBLIC_PRICE/UNSUPPORTED_RULE时准备完整FIXED全指标0；D03自动应用，手工价格配置仍明确保存。缺权限HIDDEN/null、目录或运行错误不能转免费；已有完整适用默认时按默认预填（包括非零或分时），不能因官方无价/复杂而改为免费。                                                                                                                                                                       |
| 首次保存（历史契约；40已替代创建前置） | 原M03及D02每个待创建项pricing键必填：有指标为完整对象且expected_price_version=0；仅服务端确无指标可null，不建价格版本并保持UNPRICED；expected_provider_version必填。有官方参考需带准确catalog_price_version_id，有产品默认需带准确catalog_default_price_version_id；两类引用独立，无对应参考显式null。缺字段422；确无计量规格是原PRD允许的无价创建，不静默补价。提交价格对象需要pricing:WRITE，确无指标null分支不扩大价格权限，不自动授予READ/WRITE权限。 |
| 并发                                   | PricingInput.currency必填，是已展示的预算币种断言。保存币种不同409 BILLING_CURRENCY_CHANGED，实例版本不同409 VERSION_CONFLICT；刷新准备并让管理员确认，禁止原CNY数字自动当USD。目录选择固定，保存重新验可信绑定，准备不发预留票据。                                                                                                                                                                                                                       |
| 批量恢复                               | D02先记录固定上下文，逐项事务；未执行项遇实例/币种变化安全REJECTED，已提交项不回滚不重算。重放同命令读取既有结果，不改用最新目录/币种解释已接受数值。                                                                                                                                                                                                                                                                                                     |
| 来源                                   | 首次语义原样确认完整产品默认为BUILT_IN/ENTERPRISE_DEFAULT_CONFIRMED（可非零/分时）；无默认且非空指标+真实缺价+无官方参考+FIXED全0才BUILT_IN/ENTERPRISE_DEFAULT_ZERO；无默认首次带官方参考为ENTERPRISE_CUSTOM/OFFICIAL_PREFILL_CONFIRMED；修改默认或其他/后续改价为ENTERPRISE_CUSTOM/ENTERPRISE_CONFIGURED。source/kind均只读，不接受confirmed或客户端声明已二次确认。                                                                                     |
| 历史                                   | PricingBasis schema3五键必填，default_reference与official_reference独立。真实缺价0理由非空且两参考null；其他理由null。两个目录ID分别与各自完整参考配对。企业数字/币种/规则、产品默认及官方原币参考分别冻结，默认私有语言集完整保留；后续目录/预算/模型删除不能改检测费用快照。                                                                                                                                                                            |
| 未知事实                               | 已知内部单价0不自动补齐缺失usage、未知发送结果或计算溢出；这些仍以UNKNOWN/null事实记录，不把未知费用改为已算0。                                                                                                                                                                                                                                                                                                                                           |

BILLING_CURRENCY_CHANGED归409（预算配置在读写间变化），PRICE_RULE_INVALID/METRIC_UNSUPPORTED归422，M13未知接口CUSTOM_API_UNSUPPORTED归422；对象越界与不存在统一404。模型调用ID输入须在框架字段长度校验之前按固定Unicode White_Space 25码点规范化；x-normalize-before-validation标注此要求，规范化后1～128且拒绝U+0000。

计量边界：M13保留独立价格准备，无已识别计量项时metric_specs=[]、reference_state=NOT_APPLICABLE、prefill_origin=NONE、internal_pricing_prefill=null，不生成伪免费价。40修订中D02不配置价格、M03不强制价格；F40-04已确认无计量项仍可检测并在满足其他条件后上架，不生成空价，前端显示“未匹配的计价模式”，金额保持未定价。历史实现D03改接口后PROFILE_MISMATCH继续检测；F40-03仅针对有metric而已有价失配改为准备失败，不自动覆盖或归零。

M13条件权限：先校验models:WRITE和供应商模型用途范围、解析非秘密计量规格。metric_specs=[]时返回NOT_APPLICABLE、reference/prefill=null、prefill_origin=NONE及provider_version，不读取或泄露任何官方/企业价，不要求pricing:READ/WRITE；用户仍可显式pricing=null保存原PRD允许的手工模型。metric非空才要求pricing:READ，403不可冒充空集合/缺价，保存价对象仍需pricing:WRITE。NOT_APPLICABLE必须空指标且无预填；其他reference_state必须非空指标。PricingBasis与source/参考是否存在的条件已编码OpenAPI组合约束；全部0、相同目录ID及指标完整性仍由保存事务校验。

## 11. 2026-11-10前端协同四项确认

本节与上方字段契约共同为当前设计；旧版本回执保留历史，全部任务仍pending。

| 事项        | 当前明确规则                                                                                                                                                                                                                                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M05编辑     | 非DRAFT只锁五类身份/协议字段；metadata六字段在TESTING/PENDING_REVIEW/ACTIVE/SUSPENDED/RETIRED同样可改，版本独立。身份域DRAFT、元信息任意状态，复合请求全事务。                                                                                                                                                                                                         |
| 检测并发    | 任务冻结metadata_version及输入/计划，不因编辑重算费用或偷偷增加调用。元信息编辑不强制下架/复验；准入审核不以metadata版本差异一律阻断。显式复用则检查当前有效计划/探针完整性，新流式不能复用缺流式的旧接口结果；纯描述变更不机械失效。                                                                                                                                  |
| 默认优先    | 按型号随数据库目录批次发布的只读产品默认优先；不存在时才官方数字，再符合真缺价规则的0。0是有效默认。默认和官方参考独立版本/完整快照，已有企业价格和费用不随目录发布变化。M14只读无管理写接口；创建M13包含优先级，无需重复M14。                                                                                                                                         |
| 保存来源    | 首次原样默认为BUILT_IN/ENTERPRISE_DEFAULT_CONFIRMED；首次编辑默认、后续含恢复默认均为ENTERPRISE_CUSTOM/ENTERPRISE_CONFIGURED并保留真实来源。先按is_fallback与规范化conditions定位默认时段，再比Decimal费率、完整指标和模式；name允许该同一时段已发布任一语言标签（同语言必须唯一），不把语言切换误记CUSTOM。自定义时段名或规则变化记CUSTOM；不允许来源ID替代规则校验。 |
| B06部门找人 | q用户命中OR可见部门名命中后含全部子部门人员；显式department_id再AND约束。去重后分页，只返回/保存具体用户，部门是筛选条件。新增成员不自动成为接收人；不新增部门收件关系或邮件投递。                                                                                                                                                                                     |
| 多语言      | P01认证字段和选项、M13/M14/R03计量指标/单位等按Accept-Language；省略按会话语言，缺译用该版本fallback_locale。技术key/value/路径/枚举不译；固定产品枚举由前端国际化；管理员原文不译。历史名称从冻结语言集投影，切换语言不采用新目录版本。                                                                                                                               |

供应商编辑以`P01?provider_id=…`读取原固定模板的本地化标签；例如同一字段`key=api_key`在zh-CN返回“API密钥”、en返回“API key”，提交键始终为api_key。价格模板同一`metric_key=input_tokens`可返回“输入Token”/“Input tokens”，`unit=MILLION_TOKENS`不变；默认费率与币种不因语言切换变化。模板端点响应缓存必须按当前用户/语言及固定目录版本隔离，不能跨语言复用显示文案。

默认计价的时段名同样属于模板多语言范围。产品发布时在source_detail.period_name_labels按稳定目录时段名保存语言集；M13/M14仅投影所选语言的periods[].name和预填名。默认历史快照内部保全period_name_labels/fallback_locale，公开去掉两个私有键并只从冻结语言集选择；已有企业价格的period.name是管理员确认原文，不因切换语言或目录更新而重命名。默认采用比较以is_fallback/规范化conditions对应时段，接受其发布的任一语言标签；同语言下重名默认时段不得发布，以免混淆。官方参考时段名保持原始来源文案。

检测历史的公开ModelProviderSnapshot是最小投影，metadata_version指向内部实际冻结的完整六项元信息。DBModelProviderSnapshot内部另存输入/输出模态、上下文、最大输出及描述（tags已存在），响应去掉这五项私有字段和presentation。连续复用从DBReuseSourceSnapshot已扁平复制的内部完整快照核对有效探针/计划，不依赖公开投影或当前模型，不因源任务清理而丢验证事实。

## 12. ADJ-01～ADJ-04已审调整（2026-11-11）

该次ADJ评审仅为A01增加显式paginate=false，其他分页接口在当时未改变；本轮另获批准的M08/M09/M10调整见§13。价格条件组件由Window改为ConditionRow，weekdays为严格升序的多选星期集合，conditions数组保留原始行序和分组。直接/递归受影响接口为D02、M03、M05、M08、M13、M14、R01/R02/R03、C01/C03/C04、H01/H03/H05，共15个；不向原本无价格内容的M04追加价格字段。

当前无历史业务数据，因此仅设计当前新结构：PricingBasis=3、PriceSnapshot=2、CostRuleSnapshot随父费用快照保持条件行；不新增LegacyWindow或旧版本兼容读取。新旧审阅原件和P1/P2完成证据由项目保留，未来产生的价格历史与检测费用仍按固化事实读取。

保存的有序编辑结构进入幂等HMAC，不能按时间或星期排序、不能合并/展开条件后计算摘要；相同键但不同分组/行序返回409 IDEMPOTENCY_CONFLICT。首次默认来源判定另用临时展开后的计价语义比较，不改变真实保存结构。字段非法与重叠仍使用422 PRICE_RULE_INVALID/VALIDATION_FAILED，并按原始periods[i].conditions[j]定位。

## 13. M08/M09/M10可选不分页查询（2026-11-11已批准）

三个接口复用A01的分页开关契约：默认paginate=true、page=1、page_size=20且最大100；单独page_size仍合法。paginate=false禁止显式page/page_size（422 VALIDATION_FAILED），开关空值/非true或false/重复为400 MALFORMED_REQUEST。不接受page_size=0、-1或超大页长表示全量。

响应继续使用ModelTemplatePage/ProviderOptionPage/TagOptionPage：page/page_size始终必返且成对null或整数；非分页total=items.length，空结果items=[]/total=0；全量不静默截断。同一次响应的items、total和关联展示字段来自同一数据库一致性快照，权限与筛选不因全量放宽。筛选后的“全部”只指全部合法匹配候选，不是全局对象全集。

- M08两种模式均固定目录批次；按template_key、model_id_at_provider、catalog_model_version_id升序。provider_id仍可省略，无provider默认当前批次的原语义保持；表单建议选定供应商后加载，单型号预填用既有型号筛选，不要求读取全部供应商目录。pricing权限、官方参考/企业默认分工不变；不调用上游。
- M09保持q按实例名/模板名搜索及name、id排序，只返ProviderOption最小投影；M10保持内置优先、同类value排序及value去重，q按value/当前语言label搜索。两者当前范围、语言和秘密边界不变。
- 三者是候选/预填目录，M04仍是已有供应商与标签的回显来源；搜索、未加载候选、空结果及失败均不能清空已有选择。前端可按需全量或继续分页搜索，不强制全量加载。

不新增数据库字段、索引、迁移、管理后台或API路径；56操作/42路径/136组件不变。已批准规格纳入待办V14-18及关联组合/交付验收；业务和前端联调仍为not_run，不修改P1/P2完成状态。

## 12. 40修订字段和发布边界（历史设计）

本次同步设计字典、04-openapi-review.json及04-operation-index.json作为未实施目标；contracts/releases/model-access-v14下正式OpenAPI、client、operation-index、示例均保留原发布事实。旧生成契约尚不能发送本节新输入，实施后由源定义生成并同版发布，不手工改JSON制造已实现。

- D02：`ImportItem.supported_invocation_apis/custom_invocation_apis`允许合计0；`pricing`可省略/null，非空拒绝。D02响应接口数组保持真实[]，price版本0。
- D03/C01：不新增客户端价格对象；服务端准备价格，返回实际任务与版本。目录缺失/故障明确失败；无metric未定价例外、复杂规则零价、已有失配价拒绝分别按F40已确认规则处理，不混为免费。
- R03：补充`INTERFACES_NOT_CONFIGURED`未定价原因；无接口与确无计量分别表达。
- M03：价格不强制；若显式提供仍按原价格权限及完整参数校验，不能一并放宽接口数。
- 价格来源/自动采用形成依据及对应错误码最终随40数据库和API契约实施生成；不能把自动准备记作管理员确认。

### F40-04 已确认的无计量项展示与费用边界（未实施）

至少一个接口真实可适配，但完整解析结果metric_specs=[]时，D03/C01允许继续检测；D04/M07 APPROVE在其他准入、权限、版本及状态条件满足后允许上架。不创建rates=[]价格或虚构零价版本；R03为state=UNPRICED、unpriced_reason=METRIC_SPEC_UNAVAILABLE、metric_specs=[]，从未建价时price=null/price_version=0，有历史价格时保留历史而不作为本次适用价。前端计价模式显示“未匹配的计价模式”（按当前用户语言翻译）；不新增PricingMode枚举，实际价格模式仍只有FIXED/TIME_BASED。空接口草稿的INTERFACES_NOT_CONFIGURED与本例不同，不能藉此绕过D03接口非空校验。

检测保存可取得的原始usage、调用事实和system/总部费用归属；无法计算的金额为null/UNPRICED，不记0、不标COMPLETE，未知用量不得补0。控制面负责本系统管理检测事实；实际用户请求的数据面系统须遵守同一事实语义，但外部获取/投递协议仍属后续规划，本轮不新增数据面实现或宣称已验。后续补齐计量适配后，经获授权的检测准备或独立价格配置采用实际指标；目录发布、读取和健康检查不自动改价，不回算历史或覆盖已有企业价。

## 2026-11-12：公共权限导航对接补充

`GET /api/v1/me/permissions` 已补齐 model 分组和 model_providers/model_models 两叶子，分别映射 model.providers READ、model.models READ；响应结构/schema_version=3保持，目录版本按内容更新。该公共接口不计为新增模型业务API，字段及前端路径说明见[07末节](07-前端协同对接指南.md#2026-11-12新版模型接入导航正式对接)。价格/授权/检测/审核保留为页内能力，不添加侧栏。

### 2026-11-12追加的公共导航目录

项目管理及成本与预算三个菜单加入公共导航：完整19叶子/5分组，`navigation.groups.maxItems=5`，items上限20及schema_version=3保持。新增资源 identity.projects/cost.bills/cost.expenses/cost.budgets，默认仅超管显式读写。无新增模型业务API，也未交付项目/费用/预算业务API；路由映射与职责边界见[07最后一节](07-前端协同对接指南.md#2026-11-12追加项目管理成本与预算菜单)。

## 产品澄清后的字段和调用约束

| 接口或字段                  | 现行含义                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| A01/A02 USER_GROUP          | 模型详情用户组关系全局读写，保存/撤销/重放及Added回读一致；其他主体范围不变                             |
| A06/A08/A10/A14新增状态     | ACTIVE或PENDING_REVIEW，已有非ACTIVE保留/撤销不变                                                       |
| A13候选状态                 | ACTIVE或PENDING_REVIEW且未由该主体直接授权                                                              |
| 用户组成员部门选项 group_id | 可选规范UUID；省略为本部门子树新增候选；提供仅允许FULL，无parent_id，返回该组真实成员部门的最小平面选项 |
| P05模板字段                 | ProviderUpdate中不再声明template_key/template_version_id，未知字段按strict-json拒绝；模板key与版本固定  |
| C05                         | 可选独立诊断，不是C01/D03的前置条件，不签发预检证明                                                     |
| C01/D03                     | 直接提交，保留正式价格、版本、状态、权限校验及现有费用与上架规则                                        |

## 现有组成员部门筛选只读入口

`GET /api/v1/groups/{group_id}/member-departments`，operationId为`listGroupExistingMemberDepartments`；要求完整会话及`identity.groups READ`。无正文，path的group_id为必填规范UUID，query支持可选locale和search（最多128个Unicode字符）。返回200，data.items为MemberDepartment最小平面列表：id、parent_id（null）、display_name、has_children（false）、matched；search仅返回组内真实成员部门的匹配项，不补全外部祖先。组不存在404，无权限403；输入错误400或422。分页和树加载继续使用新增候选专用入口的原约定。

原`/api/v1/groups/member-department-options`及其group_id模式保持WRITE权限；只读成员页使用上述新入口，不能借此读取新增候选目录。
