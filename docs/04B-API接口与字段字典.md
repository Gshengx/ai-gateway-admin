# 模型接入 V1.4：设计阶段 API 接口与字段文档

评审状态更新（2026-11-10）：本文件相关原评审及V13增量已明确通过，见[19](19-V1.3评审结论归档.md)；事实待核见20，未来执行顺序见21。尚未实施。

版本：**1.3 评审决议落实与原型续修稿**；日期：2026-11-09。**当前55项操作均为新模型业务API，尚未实现。V1.2原32项已有用户回执；本版落实决议并列明新增设计，不把设计通过当作运行通过。** 本文可独立用于前端接口评审；业务流程补充见 [04 主文](04-接口API设计评审.md) 与 [07 前端指南](07-前端协同对接指南.md)，机器契约见 [OpenAPI 3.1](04-openapi-review.json)。

## 1. 新契约边界与公共约定

所有完整 URI 均从 `/api/v1/model-access` 开始。旧 `/api/v1/providers`、`/api/v1/models` 及身份路径中的旧 model-grants 等模型业务端点全部退役，不提供别名、重定向或双写。此处“v1”是新模块 API 初版，不承诺旧模块兼容。用户/部门/用户组账号主数据仍来自独立身份模块，本文不重建登录或身份 CRUD。

- 认证：使用外部公共会话 Cookie（OpenAPI 的 `ais_session` 仅示意）；所有写操作还要当前 CSRF 和幂等键。每个请求都做当前权限/范围检查。
- 金额、单价和用量统一十进制字符串；`null` 表示未知，不等于 0；日期时间为 RFC3339 UTC，计价时区另有字段。
- 普通对象拒绝未知键；动态模板字段由本版 P01 的 `fields/balance_fields` 明确定义。动态并不意味着接受任意字段。
- 写请求 JSON：省略字段、显式 null、空数组含义不同；以下表列出是否必填/可空/默认，条件规则同样必须执行。请求无需包含响应专有字段。
- 所有新模型写请求的幂等事实写入全新 `ma_command_requests`；不复用旧 `control_command_requests` 的模型命令记录。公共审计由独立审计模块承载。
- 本文 `P01` 等是评审追踪编号，`operationId=modelAccessV14…` 是新机器标识；不继承旧 M1/M2 模型 operationId。

### 1.1 响应封装

| 字段       | 类型           | 必填 | 可空           | 说明                                                                      |
| ---------- | -------------- | ---- | -------------- | ------------------------------------------------------------------------- |
| code       | string         | 是   | 否             | 成功为 OK；失败为稳定本地化错误码                                         |
| data       | 各接口结果组件 | 是   | 仅指定接口允许 | 完整字段见具体接口；错误时恒为 null；C04/H03 无历史时成功 data=null       |
| params     | object         | 是   | 否             | 成功通常为 {}；失败按 [ErrorParams](#schema-errorparams) 白名单，不含秘密 |
| request_id | string UUID    | 是   | 否             | 本次控制面请求跟踪标识                                                    |

所有写请求的 202 只代表受理，任务结果须 GET；任务上游失败保存在 data.status/result，不伪装成管理会话 401。成功对象的未必填字段表示有条件省略，不表示可随意缺少必填字段。

### 1.2 通用错误

| HTTP | 错误码                                                                                                                                                                                 | 处理语义                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 400  | MALFORMED_REQUEST                                                                                                                                                                      | 无效 JSON、未知键或参数形状错误                                          |
| 401  | UNAUTHENTICATED                                                                                                                                                                        | 按共享身份登录处理，不自动重放模型检测                                   |
| 403  | FORBIDDEN / CSRF_INVALID / OUT_OF_SCOPE / RESOURCE_DISABLED / PASSWORD_CHANGE_REQUIRED / TERMS_ACCEPTANCE_REQUIRED                                                                     | 当前会话、权限、范围或共享账号限制                                       |
| 404  | NOT_FOUND                                                                                                                                                                              | 不存在或不可见，路径子资源必须属于其父对象                               |
| 409  | VERSION_CONFLICT / STATE_CONFLICT / IDEMPOTENCY_CONFLICT / IDEMPOTENCY_IN_PROGRESS / CHECK_IN_PROGRESS / OPERATION_BUSY / DISCOVERY_STALE / OPERATION_RESULT_UNKNOWN / CATALOG_CHANGED | 重新读取受影响对象；禁止自动覆盖或换键重试                               |
| 410  | DISCOVERY_EXPIRED                                                                                                                                                                      | 发现快照过期，重新获取或手工录入                                         |
| 422  | VALIDATION_FAILED 及各接口业务字段错误                                                                                                                                                 | 按 params.fields 定位字段；不向上游补发猜测请求                          |
| 422  | CATALOG_INCOMPATIBLE                                                                                                                                                                   | 模板/型号/价格版本关联不匹配，保留草稿并重新选择正确目录来源；不自动混版 |
| 503  | CATALOG_UNAVAILABLE                                                                                                                                                                    | 目录数据不可用或代码不支持；不回退代码目录，由运维恢复后明确继续         |
| 500  | INTERNAL_ERROR                                                                                                                                                                         | 保留 request_id；先确认原动作结果，不自动发起第二次探测                  |

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

本次增加M09/M10/M11/A13/B06五项只读接口，补齐原型已有供应商选项、标签目录、生命周期时间线、已上架模型授权选择器和余额接收人选择器；不是新增产品模块。模型选择器不要求供应商管理权限，授权选择器不要求模型详情权限，余额选人不借用模型授权的主体范围。

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
| [C01](#api-c01) | `POST /api/v1/model-access/models/{model_id}/admission-tests`                       | [CheckInput](#schema-checkinput)                         | [CheckJob](#schema-checkjob)                                           | 202  |
| [C02](#api-c02) | `GET /api/v1/model-access/models/{model_id}/admission-tests`                        | 无                                                       | [CheckJobPage](#schema-checkjobpage)                                   | 200  |
| [C03](#api-c03) | `GET /api/v1/model-access/models/{model_id}/admission-tests/{test_id}`              | 无                                                       | [CheckJob](#schema-checkjob)                                           | 200  |
| [C04](#api-c04) | `GET /api/v1/model-access/models/{model_id}/admission-tests/latest`                 | 无                                                       | [CheckJob](#schema-checkjob)                                           | 200  |
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

业务、并发与事务规则：只读数据库已发布模板；默认当前批次，可按catalog_release_id固定读取；provider_id模式仅返回该实例绑定模板及原字段/认证规格，显式批次必须匹配。enabled仅指新采用资格，不能据旧版非current禁止普通编辑。运行数据无代码/配置目录兜底；不返回实施排序、研究台账或项目审批状态。

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

业务、并发与事务规则：expected_version、template_key、template_version_id必填。原绑定ID普通编辑保持旧模板规则，即使目录默认已更新；明确选择不同ID（可同key）只允许当前可采用模板，完整校验配置及秘密语义，不把同名不同义旧秘密直接继承。模板改绑定与其他实际配置修改均按原规则推进相应provider/connection版本，仅目录发布不推进实例版本；不自动准入/下架；notes/秘密/余额省略语义保持。

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

权限：`model.providers:WRITE AND model.models:WRITE；有计量规格并提交pricing对象另需model.pricing:WRITE`。

业务、并发与事务规则：先检查权限及expected_provider_version，首次受理固定实例/目录和预算币种上下文。每个新建项显式提交pricing：有metric为完整对象并验pricing:WRITE，服务端确无metric时仅允许null且不建价版本，expected_price_version=0；价格确认/参考/默认0规则同M03。逐项事务，恢复不按最新目录或币种重解释已受理值；执行某项前币种或实例改变，则该项及尚未执行项安全REJECTED，已完成结果保持。先识别既有上游ID并SKIPPED_EXISTING，不覆盖基础或价格；只对待创建项的规范化调用ID同批查重，重复名项全部REJECTED，不让跳过项虚占新名。最终全局数据库唯一冲突NAME_CONFLICT不披露占用对象。发现模式来源由可信快照固定，显式ID须一致；最终标准或已适配自定义至少一项，返回实际模型/来源/接口/版本。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `provider_id`     | string | 是   | 否   | format="uuid"                          | 当前可见供应商UUID                                                                           |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [ImportInput](#schema-importinput)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [ImportBatchResult](#schema-importbatchresult)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`DISCOVERY_EXPIRED`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`、`NAME_CONFLICT`、`BILLING_CURRENCY_CHANGED`、`PRICE_RULE_INVALID`、`METRIC_UNSUPPORTED`、`VERSION_CONFLICT`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[ImportBatchItem](#schema-importbatchitem), [ImportItem](#schema-importitem)。

<a id="api-d03"></a>

### D03 引导保存接口并逐模型提交检测

`POST /api/v1/model-access/providers/{provider_id}/models/admission-tests`；operationId：`modelAccessV14D03`。

权限：`model.models:WRITE,model.admission:WRITE`。

业务、并发与事务规则：逐模型原子保存DRAFT接口和创建任务；所有权限先检查，结果逐项返回 最终标准和已适配自定义接口合计至少一项，允许纯自定义Rerank，不虚选标准接口。 接口变更可能使旧企业价PROFILE_MISMATCH，沿既有规则继续检测并固化UNPRICED事实；不因此新增价格硬门槛，不静默扩指标、填0或重解释旧价。管理员可用M05的base+pricing同事务明确更正。

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

业务、并发与事务规则：全部创建域同一事务，不触发检测。必须提交pricing键及expected_provider_version：有metric为完整内部价，服务端确无metric时仅允许null并保持UNPRICED/不建价版本；价格expected_price_version=0。M13只准备建议，保存才确认内部价；官方参考数字不是换汇或已生效费用。服务端重验目录/可信型号、提供商版本、预算币种及适配指标；有可用官方参考时回传准确参考ID并冻结原币快照。首次有metric、真实缺价且确认FIXED全指标0记BUILT_IN/ENTERPRISE_DEFAULT_ZERO，其他记ENTERPRISE_CUSTOM；复杂价规不自动补0。调用ID同M12规范化、全局区分大小写，由数据库唯一约束兜底409 NAME_CONFLICT；标准或已适配自定义至少一项。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [ModelCreate](#schema-modelcreate)。

成功：HTTP **201**，封装字段见 §1.1；`data` 完整字段见 [Model](#schema-model)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`NAME_CONFLICT`、`PROVIDER_MODEL_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`、`BILLING_CURRENCY_CHANGED`、`PRICE_RULE_INVALID`、`METRIC_UNSUPPORTED`、`VERSION_CONFLICT`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[CustomAPIInput](#schema-customapiinput), [CustomAPIView](#schema-customapiview), [HealthInput](#schema-healthinput), [InvocationAPI](#schema-invocationapi), [ModelVersions](#schema-modelversions), [OfficialModelBinding](#schema-officialmodelbinding), [PricingInput](#schema-pricinginput), [Subject](#schema-subject)。

<a id="api-m04"></a>

### M04 物理模型详情

`GET /api/v1/model-access/models/{model_id}`；operationId：`modelAccessV14M04`。

权限：`model.models:READ`。

业务、并发与事务规则：授权/价格/检查历史由独立READ权限接口读取，不因看模型就泄露全部主体

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                           |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID       |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Model](#schema-model)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[CustomAPIView](#schema-customapiview), [HealthInput](#schema-healthinput), [InvocationAPI](#schema-invocationapi), [ModelVersions](#schema-modelversions), [OfficialModelBinding](#schema-officialmodelbinding)。

<a id="api-m05"></a>

### M05 复合表单保存修改域

`PUT /api/v1/model-access/models/{model_id}`；operationId：`modelAccessV14M05`。

权限：`按提交域model.models/permissions/pricing:WRITE`。

业务、并发与事务规则：仅提交修改域且整体事务；base仅DRAFT，供应商/上游ID变化后重新核实或清理不成立模型来源，不自动重写原价格。pricing明确保存新ENTERPRISE_CUSTOM版本，参考目录ID按PricingInput继承/清除/新选规则，不能借目录绑定绕过分域权限、版本或秘密规则。 调用ID采用与M12相同规范化和全局区分大小写唯一规则，最终保存不依赖预检；并发唯一冲突返回安全NAME_CONFLICT，不返回占用对象。 最终标准和已适配自定义接口合计至少一项，允许纯自定义Rerank，不虚选标准接口。 提交pricing时currency必填，是当前预算币种断言，变化409 BILLING_CURRENCY_CHANGED；明确保存新企业价，不自动将官方原币改标或换汇。pricing_basis冻结依据及完整原币参考，后续改价为ENTERPRISE_CONFIGURED。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [ModelUpdate](#schema-modelupdate)。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [Model](#schema-model)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`STATE_CONFLICT`、`VERSION_CONFLICT`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`、`NAME_CONFLICT`、`BILLING_CURRENCY_CHANGED`、`PRICE_RULE_INVALID`、`METRIC_UNSUPPORTED`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[CustomAPIView](#schema-customapiview), [GrantDelta](#schema-grantdelta), [HealthInput](#schema-healthinput), [InvocationAPI](#schema-invocationapi), [ModelBase](#schema-modelbase), [ModelVersions](#schema-modelversions), [OfficialModelBinding](#schema-officialmodelbinding), [PricingInput](#schema-pricinginput)。

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

该接口使用的嵌套组件：[CustomAPIView](#schema-customapiview), [HealthInput](#schema-healthinput), [InvocationAPI](#schema-invocationapi), [ModelVersions](#schema-modelversions), [OfficialModelBinding](#schema-officialmodelbinding)。

<a id="api-m08"></a>

### M08 模型内置规格

`GET /api/v1/model-access/models/templates`；operationId：`modelAccessV14M08`。

权限：`model.models:READ OR model.models:WRITE`。

业务、并发与事务规则：只读数据库固定批次内置型号。默认无provider取当前；provider_id取该可见实例固定模板批次，显式catalog_release_id必须一致；续页回传固定批次，不能混合新发布。返回型号/模板/批次准确关联、元信息和适配计量规格；目录不代表实例型号已VERIFIED。只有pricing READ返回builtin_pricing，其他HIDDEN/null；提交自定义价仍须pricing WRITE。不提供目录管理功能。 builtin_pricing仅官方原币参考，不按总部币种筛选；多币种按目录首选。首次创建另用M13完整准备并显式保存pricing，HIDDEN/null不代表企业免费资格。

| 位置   | 参数                   | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                                 |
| ------ | ---------------------- | ------- | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| query  | `page`                 | integer | 否   | 否   | minimum=1                              | 页码，从 1 开始；省略为 1。                                                                              |
| query  | `page_size`            | integer | 否   | 否   | minimum=1；maximum=100                 | 每页条数，省略 20，上限 100。                                                                            |
| query  | `template_key`         | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 供应商模板稳定键；与provider_id同时提供时必须匹配该实例固定模板                                          |
| query  | `model_id_at_provider` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 按上游模型ID或可信官方绑定筛选该固定批次的内置型号；不从部署名猜官方型号                                 |
| query  | `provider_id`          | string  | 否   | 否   | format="uuid"                          | 模型表单当前可见供应商实例UUID；仅按模型用途范围校验，不要求完整供应商管理权限；提供时使用其固定模板批次 |
| query  | `catalog_release_id`   | string  | 否   | 否   | format="uuid"                          | 首次响应返回的固定批次UUID，续页原样回传；与provider_id同时提供时必须匹配实例固定批次，禁止混批次        |
| header | `Accept-Language`      | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                                       |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [ModelTemplatePage](#schema-modeltemplatepage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

该接口使用的嵌套组件：[ModelTemplate](#schema-modeltemplate)。

<a id="api-m09"></a>

### M09 模型表单可选供应商

`GET /api/v1/model-access/model-options/providers`；operationId：`modelAccessV14M09`。

权限：`model.models:READ OR model.models:WRITE`。

业务、并发与事务规则：满足model.models READ或WRITE任一即可；仍校验当前模型管理范围。只返回ProviderOption的公开字段，不能读取供应商秘密/完整配置，无需providers:READ。按实例名/模板名搜索，稳定分页；已有选中供应商由M04直接回显，不要求选项出现在第一页。；稳定排序为实例name、id升序。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                             |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | ---------------------------------------------------- |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                          |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                        |
| query  | `q`               | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 搜索本用途可见选项，去首尾空白；空字符串视为未筛选。 |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。   |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [ProviderOptionPage](#schema-provideroptionpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[ProviderOption](#schema-provideroption)。

<a id="api-m10"></a>

### M10 模型表单已有标签目录

`GET /api/v1/model-access/model-options/tags`；operationId：`modelAccessV14M10`。

权限：`model.models:READ OR model.models:WRITE`。

业务、并发与事务规则：满足model.models READ或WRITE任一即可。内置标签与当前可见模型的已有自定义标签去重后分页；按value/当前语言label搜索。只读建议目录，新增自定义值仍由原模型保存接受，不创建独立标签维护功能。编辑已选值来自M04.tags，不能仅用当前页选项覆盖原值。；先内置后自定义，同类按value稳定升序。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                             |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | ---------------------------------------------------- |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                          |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                        |
| query  | `q`               | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 搜索本用途可见选项，去首尾空白；空字符串视为未筛选。 |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。   |

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

`POST /api/v1/model-access/models/{model_id}/admission-tests`；operationId：`modelAccessV14C01`。

权限：`model.admission:WRITE`。

业务、并发与事务规则：DRAFT、同模型互斥；每接口每项目一次，无自动重试；未执行项 result_detail=null、cost=null；等待项计数按计划返回，不能以空对象假充结果。；triggered_by_display/model_display及每项invocation_api与detail_text/suggestion_text独立于pricing权限，从任务时快照投影。

| 位置   | 参数              | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                     |
| ------ | ----------------- | ------ | ---- | ---- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| path   | `model_id`        | string | 是   | 否   | format="uuid"                          | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                 |
| header | `Accept-Language` | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                           |
| header | `Idempotency-Key` | string | 是   | 否   | minLength=1；maxLength=128             | 同一次人工操作保持的 1～128 字符唯一键；请求变更必须使用新键；不授权自动重试。               |
| header | `X-CSRF-Token`    | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 共享认证上下文提供的 CSRF 令牌。名称在实施契约中与现认证配置绑定，示例名称不代表新认证系统。 |

请求体：必填 JSON 对象，完整字段见 [CheckInput](#schema-checkinput)。

成功：HTTP **202**，封装字段见 §1.1；`data` 完整字段见 [CheckJob](#schema-checkjob)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`STATE_CONFLICT`、`CHECK_IN_PROGRESS`、`VERSION_CONFLICT`、`CUSTOM_API_UNSUPPORTED`、`CSRF_INVALID`、`IDEMPOTENCY_CONFLICT`、`IDEMPOTENCY_IN_PROGRESS`、`OPERATION_RESULT_UNKNOWN`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

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

该接口使用的嵌套组件：[CustomAPIView](#schema-customapiview), [HealthInput](#schema-healthinput), [InvocationAPI](#schema-invocationapi), [ModelVersions](#schema-modelversions), [OfficialModelBinding](#schema-officialmodelbinding)。

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

业务、并发与事务规则：每页同集合版本，保存传差异不传全量；越界主体名称不泄露

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                                 | 参数说明                                                                                                           |
| ------ | ----------------- | ------- | ---- | ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| path   | `model_id`        | string  | 是   | 否   | format="uuid"                             | 当前可见新版物理模型UUID，不接受旧逻辑模型ID                                                                       |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                      | 页码，从 1 开始；省略为 1。                                                                                        |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100        | 每页条数，省略 20，上限 100。                                                                                      |
| query  | `subject_type`    | string  | 否   | 否   | enum=["DEPARTMENT", "USER_GROUP", "USER"] | 主体类型 DEPARTMENT/USER_GROUP/USER；候选查询必填。                                                                |
| query  | `q`               | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则    | 可选搜索关键字；供应商按名称/API地址/备注，模型按两类模型ID/说明，授权主体按显示名。去首尾空白；空字符串等同未传。 |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则    | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                                                 |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [GrantPage](#schema-grantpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[Grant](#schema-grant)。

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

业务、并发与事务规则：同一新grants库和范围策略；CAS新表 ma_grant_state.revision 对应 authorization_version，更新各受影响模型grant_version；混合增删前端确认；authorization_version 只保护直接关系集合，任意模型直接授权变更均推进；身份成员/部门变化不推进，但保存必须现时重校验范围/主体状态。粗粒度冲突允许重新读取。；只对本次新增直授模型要求当前ACTIVE；已存在的非ACTIVE直接关系允许保留或撤销，不因候选筛选而默删；保存按实际增删差异验证，不能把未出现在候选的既有授权当作无效。

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

业务、并发与事务规则：同一新grants库和范围策略；CAS新表 ma_grant_state.revision 对应 authorization_version，更新各受影响模型grant_version；混合增删前端确认；authorization_version 只保护直接关系集合，任意模型直接授权变更均推进；身份成员/部门变化不推进，但保存必须现时重校验范围/主体状态。粗粒度冲突允许重新读取。；只对本次新增直授模型要求当前ACTIVE；已存在的非ACTIVE直接关系允许保留或撤销，不因候选筛选而默删；保存按实际增删差异验证，不能把未出现在候选的既有授权当作无效。

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

业务、并发与事务规则：同一新grants库和范围策略；CAS新表 ma_grant_state.revision 对应 authorization_version，更新各受影响模型grant_version；混合增删前端确认；authorization_version 只保护直接关系集合，任意模型直接授权变更均推进；身份成员/部门变化不推进，但保存必须现时重校验范围/主体状态。粗粒度冲突允许重新读取。；只对本次新增直授模型要求当前ACTIVE；已存在的非ACTIVE直接关系允许保留或撤销，不因候选筛选而默删；保存按实际增删差异验证，不能把未出现在候选的既有授权当作无效。

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

`GET /api/v1/model-access/model-permission-subjects`；operationId：`modelAccessV14A12`。

权限：`model.permissions:READ OR model.permissions:WRITE`。

业务、并发与事务规则：服务端会话范围，拒绝任意scope根；仅返回可供当前操作选择主体；不含system或PROJECT；DEPARTMENT无q时按parent_id逐层分页，未传parent_id返回可见根；有q时跨当前可见子树搜索，行带ancestors用于定位，禁止与parent_id混用。USER支持department_id+q并含username；USER_GROUP忽略部门含义但无关参数应拒绝。选中回显使用已授权Grant.subject_name或合法候选，不任意按ID扩权查人。；部门同级按身份sort_order、id升序；用户/组按名称及稳定ID升序。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                                 | 参数说明                                                                                                           |
| ------ | ----------------- | ------- | ---- | ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
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

业务、并发与事务规则：按subject_type同时校验USER/DEPARTMENT对应identity.users、USER_GROUP对应identity.groups的READ或WRITE之一，以及model.permissions READ或WRITE之一和当前主体/模型管理范围。仅返回ACTIVE、未由该主体直接授权的模型；部门/组继承不等于该主体直授，不据此错误排除。无需models:READ，不返回模型完整配置/价格。保存仍现时校验；不可见主体统一404。；按model_id_at_gateway、id稳定升序。；ACTIVE限制仅用于主体页面本次新增候选，不限制M03初始授权/A02模型侧DRAFT授权，且不影响已有非ACTIVE关系的展示、保留和撤销。

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

业务、并发与事务规则：保存ENTERPRISE_CUSTOM新版本；expected_price_version仍控制并发。catalog_price_version_id省略继承当前参考、显式null清除；相同旧参考可保留历史批次，新选参考必须匹配实例固定批次及可信型号。服务端币种/指标，分时无重叠且恰一兜底；仅新发送使用新价，历史显示/来源从本版本快照读取，不查当前目录重释。 提交pricing时currency必填，是当前预算币种断言，变化409 BILLING_CURRENCY_CHANGED；明确保存新企业价，不自动将官方原币改标或换汇。pricing_basis冻结依据及完整原币参考，后续改价为ENTERPRISE_CONFIGURED。

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

`GET /api/v1/model-access/models/{model_id}/pricing/current`；operationId：`modelAccessV14R03`。

权限：`model.pricing:READ`。

业务、并发与事务规则：读取模型实际当前价格，不从当前目录价覆盖。已有BUILT_IN和企业价都独立固化；无价返回UNPRICED/null；返回指标来自当前执行所适用的固定规格，价格参考可能为旧批次且不表示仍适配，币种/指标按实际校验。

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

### B06 余额预警接收用户选项

`GET /api/v1/model-access/balance-recipient-options`；operationId：`modelAccessV14B06`。

权限：`model.providers:READ OR model.providers:WRITE`。

业务、并发与事务规则：满足providers READ或WRITE任一即可，在操作者现有用户管理范围内仅查启用且非system的用户；q匹配显示名/username/邮箱。返回本用途所需最小资料与邮箱有效性。provider_id必须可见；selected_items只来自其已保存配置，失效/越界只给通用占位，不泄露身份是否存在。新建默认当前管理员由会话上下文取得，不能任意查人。；按display_name、username、user_id稳定升序；selected_items保持原配置ID顺序。

| 位置   | 参数              | 类型    | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                       |
| ------ | ----------------- | ------- | ---- | ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| query  | `page`            | integer | 否   | 否   | default=1；minimum=1                   | 页码，从 1 开始；省略为 1。                                                                    |
| query  | `page_size`       | integer | 否   | 否   | default=20；minimum=1；maximum=100     | 每页条数，省略 20，上限 100。                                                                  |
| query  | `q`               | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 搜索本用途可见选项，去首尾空白；空字符串视为未筛选。                                           |
| query  | `provider_id`     | string  | 否   | 否   | format="uuid"                          | 编辑现配置时可传，用该供应商已选ID补回当前页外selected_items；不能传任意selected_ids查询用户。 |
| header | `Accept-Language` | string  | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                             |

请求体：无。不要发送 JSON body；DELETE 的版本在 query。

成功：HTTP **200**，封装字段见 §1.1；`data` 完整字段见 [BalanceRecipientOptionPage](#schema-balancerecipientoptionpage)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`OUT_OF_SCOPE`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`；每项 HTTP 与恢复语义见 §1.2，错误体见 [Error](#schema-error)。

该接口使用的嵌套组件：[BalanceRecipientDisplay](#schema-balancerecipientdisplay)。

<a id="api-m12"></a>

### M12 模型调用ID可用性检查

`GET /api/v1/model-access/model-options/model-id-availability`

权限：`model.models:WRITE；编辑排除自身另验当前对象管理范围及DRAFT状态`。

业务、并发与事务规则：先验证当前会话与model.models:WRITE；有exclude_model_id先校验对象可管理且为DRAFT，不存在/不可见统一404 NOT_FOUND，合法但非DRAFT为409 STATE_CONFLICT，再做占用查询。按固定Unicode White_Space集合去首尾空白，规范化后1～128码点；全局、区分大小写精确比较，合法排除自身；所有未物理删除状态均占用ID。仅返回规范化ID与available，不返回占用模型/供应商/部门/状态/数量或建议名。只读、不预留、不发检查令牌、不创建命令，Cache-Control:no-store。最终M03/M05/D02仍同规则校验并由数据库唯一约束兜底，竞争失败为409 NAME_CONFLICT。

| 位置   | 参数                  | 类型   | 必填 | 可空 | 默认/限制                              | 参数说明                                                                                                                       |
| ------ | --------------------- | ------ | ---- | ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| query  | `model_id_at_gateway` | string | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 创建或编辑的候选调用ID。固定Unicode White_Space集合去首尾空白后，非空且不超过128码点；保留内部字符及大小写，不做NFC/NFKC。     |
| query  | `exclude_model_id`    | string | 否   | 否   | format="uuid"                          | 仅编辑时传当前模型UUID；必须先通过该对象当前WRITE权限/管理范围及DRAFT状态检查。不存在或不可见统一404，不接受任意排除其他模型。 |
| header | `Accept-Language`     | string | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                                                                             |

请求体：无。

成功：HTTP 200，外层封装的 `data` 为 [ModelIdAvailability](#schema-modelidavailability)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`STATE_CONFLICT`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

所有响应返回`Cache-Control: no-store`；不要求Idempotency-Key，也不返回检查票据。

<a id="api-m13"></a>

### M13 创建或导入前价格准备

`GET /api/v1/model-access/model-options/pricing-preparation`

权限：`model.models:WRITE及供应商模型用途范围；服务端metric_specs非空时另需model.pricing:READ，确空分支不需价格权限`。

业务、并发与事务规则：先model.models:WRITE和实例模型用途范围校验；服务端解析metric_specs，确空时直接返回NOT_APPLICABLE、空指标、reference/prefill=null、prefill_origin=NONE及非秘密实例/目录版本，不读取价格且不需pricing:READ；非空时再验pricing:READ，失败403绝不能当无价或免费。按实例固定目录批次与所选已适配标准/自定义接口解析完整metric_specs；合计至少一项，未适配调用协议拒绝；已适配调用但无计量规格返回metric_specs=[]及NOT_APPLICABLE，不伪造指标、不裁剪手工创建。不调用真实模型、余额或供应商定价API。官方参考按目录preferred_reference_currency选择：单一报价可唯一解析，多币种发布必须指定真实首选；不按内部币种过滤。有可表达且覆盖全部指标的官方原币参考时返回原币参考与仅数字预填的内部价；有已识别指标且PRICE_UNAVAILABLE/NO_PUBLIC_PRICE才预填完整FIXED全0；UNSUPPORTED_RULE不预填。内部币种总部配置缺省CNY。返回provider_version和完整来源；所有响应no-store，不预留/写命令。有指标保存必须完整pricing；服务端确无指标时显式pricing=null且UNPRICED/不建价格版本；保存重验版本、币种、完整指标及参考ID；准备不是授权或保存凭据。

| 位置   | 参数                        | 类型                | 必填 | 可空 | 默认/限制                              | 参数说明                                                              |
| ------ | --------------------------- | ------------------- | ---- | ---- | -------------------------------------- | --------------------------------------------------------------------- |
| query  | `provider_id`               | string              | 是   | 否   | format="uuid"                          | 必须可管理；不存在/越界统一404。                                      |
| query  | `model_id_at_provider`      | string              | 是   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 纯手工和目录型号均必填；不从名称猜官方绑定。                          |
| query  | `supported_invocation_apis` | array&lt;string&gt; | 否   | 否   | uniqueItems=true                       | 重复query参数form/explode；与custom_api_paths合计至少一项。           |
| query  | `custom_api_paths`          | array&lt;string&gt; | 否   | 否   | uniqueItems=true                       | 重复query参数form/explode；后端识别协议，不接受客户端适配器键或脚本。 |
| query  | `catalog_model_version_id`  | string              | 否   | 否   | format="uuid"                          | 选择目录时回传，校验实例固定批次/模板和可信型号；不匹配拒绝。         |
| header | `Accept-Language`           | string              | 否   | 否   | 无额外格式限制；仍遵守所属组件业务规则 | 当前用户偏好的支持语言；省略时按现有会话语言协商。                    |

请求体：无。

成功：HTTP 200，外层封装的 `data` 为 [PricingPreparation](#schema-pricingpreparation)。

错误：`UNAUTHENTICATED`、`FORBIDDEN`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`RESOURCE_DISABLED`、`PASSWORD_CHANGE_REQUIRED`、`TERMS_ACCEPTANCE_REQUIRED`、`INTERNAL_ERROR`、`CUSTOM_API_UNSUPPORTED`、`METRIC_UNSUPPORTED`、`CATALOG_CHANGED`、`CATALOG_INCOMPATIBLE`、`CATALOG_UNAVAILABLE`；HTTP与恢复语义见§1.2，完整错误体见[Error](#schema-error)。

所有响应`Cache-Control: no-store`；无Idempotency-Key、检查票据或预留。

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

CustomAPIInput 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段   | 类型/组件     | 必填 | 可空 | 默认/省略                       | 字段说明                             | 约束                                   |
| ------ | ------------- | ---- | ---- | ------------------------------- | ------------------------------------ | -------------------------------------- |
| `id`   | string / null | 否   | 是   | 无静态默认；省略语义见组件/接口 | 当前对象的稳定 UUID，不以名称代替    | 无额外格式限制；仍遵守所属组件业务规则 |
| `path` | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 相对上游路径；用户不填写名称、适配器 | maxLength=2048；pattern="^/[^\\s]*$"   |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-invocationapi"></a>

### InvocationAPI

InvocationAPI 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                   | 类型/组件     | 必填 | 可空 | 默认/省略                       | 字段说明                                   | 约束                                   |
| ---------------------- | ------------- | ---- | ---- | ------------------------------- | ------------------------------------------ | -------------------------------------- |
| `id`                   | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                   | format="uuid"                          |
| `api_key`              | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 标准键或系统生成CUSTOM_UUID                | 无额外格式限制；仍遵守所属组件业务规则 |
| `kind`                 | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象类型，允许值见枚举                     | enum=["STANDARD", "CUSTOM"]            |
| `path`                 | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 自定义上游相对路径；标准接口由适配器决定   | 无额外格式限制；仍遵守所属组件业务规则 |
| `adapter_key`          | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 只读适配键                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `adapter_revision`     | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端适配器规格版本，保证历史可追溯       | 无额外格式限制；仍遵守所属组件业务规则 |
| `streaming_applicable` | boolean       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 此接口是否适用流式检查；须结合模型流式标签 | 无额外格式限制；仍遵守所属组件业务规则 |
| `applicability_reason` | string / null | 否   | 是   | 无静态默认；省略语义见组件/接口 | 接口不适用原因码；适用时可为空             | 无额外格式限制；仍遵守所属组件业务规则 |

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

| 字段                | 类型/组件                                                    | 必填 | 可空 | 默认/省略                       | 字段说明                                                    | 约束                                                                                        |
| ------------------- | ------------------------------------------------------------ | ---- | ---- | ------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `key`               | string                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端注册的稳定字段或模板键                                | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `label`             | string                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按Accept-Language翻译                                       | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `value_type`        | string                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 字段输入值类型；SECRET 值只写不回显                         | enum=["STRING", "INTEGER", "BOOLEAN", "SECRET", "JSON"]                                     |
| `required`          | boolean                                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否无条件必填；条件必填另由 required_when 表达             | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `required_when`     | array&lt;[FieldCondition](#schema-fieldcondition)&gt; / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | null 表示没有条件规则；required=true 时无条件必填           | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `default`           | [JsonValue](#schema-jsonvalue)                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模板给出的默认值；null 表示不设默认，不代表自动清空现值     | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `options`           | array&lt;[DisplayOption](#schema-displayoption)&gt;          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 动态下拉/单选的选项；空数组表示自由输入或无选项             | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `description`       | string                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象说明文字，按当前用户语言返回或按输入原文保存            | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `validation_schema` | [FieldValidationSchema](#schema-fieldvalidationschema)       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 字段完整校验结构；具体配置实例按模板发布，不能由客户端改写  | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `visible_when`      | array&lt;[FieldCondition](#schema-fieldcondition)&gt; / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | null表示始终可见；隐藏字段不得沿用其不再适用的秘密          | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `control`           | string                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 前端表单控件；STRING仍可按本字段选择单行/多行，SECRET不回显 | enum=["TEXT", "PASSWORD", "TEXTAREA", "SELECT", "RADIO", "NUMBER", "SWITCH", "JSON_EDITOR"] |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-template"></a>

### Template

Template 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                              | 类型/组件                                                 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                 | 约束                                   |
| --------------------------------- | --------------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `key`                             | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端注册的稳定字段或模板键                                                                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `name`                            | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                                                                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
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
| `template_version_id`             | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 不可变模板版本行UUID；创建或明确改选模板时回传，普通编辑保留实例原绑定                                                                   | format="uuid"                          |
| `catalog_release_id`              | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模板所属完整目录发布批次，与外层读取上下文一致                                                                                           | format="uuid"                          |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-window"></a>

### Window

左闭右开；跨午夜拆行；所有条件不得重叠

| 字段           | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                      | 约束                    |
| -------------- | --------- | ---- | ---- | ------------------------------- | --------------------------------------------- | ----------------------- |
| `weekday`      | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | ISO 星期，1 周一至 7 周日                     | minimum=1；maximum=7    |
| `start_minute` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当天开始分钟，0 表示 00:00，区间含开始点      | minimum=0；maximum=1439 |
| `end_minute`   | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当天结束分钟，1440 表示 24:00，区间不含结束点 | minimum=1；maximum=1440 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-priceperiodinput"></a>

### PricePeriodInput

PricePeriodInput 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段           | 类型/组件                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                         | 约束                                   |
| -------------- | ------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `name`         | string                                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                 | minLength=1；maxLength=128             |
| `is_fallback`  | boolean                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否兜底时段；每个价格版本恰好一个               | 无额外格式限制；仍遵守所属组件业务规则 |
| `conditions`   | array&lt;[Window](#schema-window)&gt;                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 星期与分钟窗口；兜底或固定价为空，非兜底不得重叠 | 无额外格式限制；仍遵守所属组件业务规则 |
| `metric_rates` | array&lt;[MetricRateInput](#schema-metricrateinput)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本时段全部已适配计价项，不得任意增删             | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-pricinginput"></a>

### PricingInput

管理员确认的完整内部计价规则；创建/导入也必须显式提交。FIXED恰一个无条件fallback，TIME_BASED另有具名条件时段；适配指标及单位不可增删。currency是已展示预算币种的并发断言，不是自选币种或换汇请求。

| 字段                       | 类型/组件                                                 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                                                                                                                                 | 约束                                   |
| -------------------------- | --------------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `expected_price_version`   | integer                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 读取到的当前价格版本；首次无价为 0                                                                                                                                                                                                                                                                       | minimum=0                              |
| `currency`                 | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 必填当前M13/R03展示的内部预算币种；总部未配置为CNY。服务端保存时重验，不同返回409 BILLING_CURRENCY_CHANGED，禁止把同一数字改解释为新币种。                                                                                                                                                               | pattern="^[A-Z]{3}$"                   |
| `pricing_mode`             | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 固定价 FIXED 或分时价 TIME_BASED                                                                                                                                                                                                                                                                         | enum=["FIXED", "TIME_BASED"]           |
| `periods`                  | array&lt;[PricePeriodInput](#schema-priceperiodinput)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整计价时段；固定价恰一个兜底，分时价按规则设置                                                                                                                                                                                                                                                         | minItems=1                             |
| `reason`                   | string                                                    | 否   | 否   | 无静态默认；省略语义见组件/接口 | 本次改价原因，可省略，用于操作审计；不套用模型暂停或审核拒绝的前端必填规则                                                                                                                                                                                                                               | maxLength=512                          |
| `catalog_price_version_id` | string / null                                             | 否   | 是   | 无静态默认；省略语义见组件/接口 | 可选官方参考条目UUID，不是可写source或内部计价币种。首次M03/D02如M13返回官方参考必须回传该ID，服务端重验同固定批次/可信型号并冻结原币参考；无参考传null。R02/M05省略继承旧参考、显式null清除；保留同一旧参考允许历史批次，改选另一条须匹配当前实例固定批次。内部费率由本请求明确保存，不自动复制或换汇。 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-pricingversion"></a>

### PricingVersion

不可变内部企业价格版本。source=BUILT_IN仅首次缺价时确认完整默认免费0，ENTERPRISE_CUSTOM为其他管理员显式保存；官方参考另由pricing_basis冻结，不自动复制生效或换汇。目录更新不覆写企业价或历史费用。

| 字段                       | 类型/组件                                                     | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                      | 约束                                   |
| -------------------------- | ------------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `id`                       | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                      | format="uuid"                          |
| `physical_model_id`        | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                      | format="uuid"                          |
| `version`                  | integer                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                                                        | minimum=1                              |
| `source`                   | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端来源：BUILT_IN仅首次确认的企业默认免费0；ENTERPRISE_CUSTOM为其他明确企业价。不是官方价格币种/实施优先级，客户端不可写。 | enum=["BUILT_IN", "ENTERPRISE_CUSTOM"] |
| `currency`                 | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 创建该价格版本时固化的总部内部币种，未配置为CNY；不随后续总部配置变化重写                                                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `time_zone`                | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | IANA 计费时区，与当前用户的显示时区区分                                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `pricing_mode`             | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 固定价 FIXED 或分时价 TIME_BASED                                                                                              | enum=["FIXED", "TIME_BASED"]           |
| `periods`                  | array&lt;[PricePeriodDisplay](#schema-priceperioddisplay)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该历史版本完整价格规则，不从当前模型目录补显示                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `adapter_revision`         | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端适配器规格版本，保证历史可追溯                                                                                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_revision`         | string / null                                                 | 否   | 是   | 无静态默认；省略语义见组件/接口 | catalog_binding对应发布批次revision；无目录参考可空，不取当前发布版本填历史                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `rounding`                 | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该版本固化的金额舍入规则，R02已确认HALF_EVEN；历史不随之后规则改变。                                                          | enum=["HALF_EVEN"]                     |
| `amount_scale`             | integer                                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该版本固化的Decimal金额小数位数，R02已确认18位。                                                                              | const=18                               |
| `created_at`               | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                               | format="date-time"                     |
| `created_by`               | string                                                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                      | format="uuid"                          |
| `created_by_display`       | [IdentitySnapshot](#schema-identitysnapshot)                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从display_snapshot.created_by读的当时创建人；原用户删改不影响历史                                                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_price_version_id` | string / null                                                 | 是   | 是   | 无静态默认；省略语义见组件/接口 | 官方价格参考UUID；默认免费0为null，其他企业价可有参考。参考币种与内部currency允许不同，不表示换汇或等值。                     | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_binding`          | [CatalogBinding](#schema-catalogbinding) / null               | 是   | 是   | 无静态默认；省略语义见组件/接口 | 存在catalog_price_version_id时非空并与之对应；无目录来源null。允许与当前供应商模板/模型原来源属于不同历史批次，不据此改价     | 无额外格式限制；仍遵守所属组件业务规则 |
| `pricing_basis`            | [PricingBasis](#schema-pricingbasis)                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部价生成依据及完整原币参考快照；创建后不可变。                                                                              | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-metricspec"></a>

### MetricSpec

MetricSpec 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段              | 类型/组件           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                 | 约束                                   |
| ----------------- | ------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `metric_key`      | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 适配器定义的计量指标键                                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit`            | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该指标计价单位，如 MILLION_TOKENS，取适配器规格                                                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit_divisor`    | integer             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 单价对应的数量分母；百万 Token 为 1000000                                                                | minimum=1                              |
| `description`     | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象说明文字，按当前用户语言返回或按输入原文保存                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `usage_mapping`   | array&lt;string&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 官方用量来源的字段路径列表                                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `exclusive_group` | string / null       | 否   | 是   | 无静态默认；省略语义见组件/接口 | 互斥计量组键，防止缓存/模态重复计费；无则 null                                                           | 无额外格式限制；仍遵守所属组件业务规则 |
| `included_in`     | string / null       | 否   | 是   | 无静态默认；省略语义见组件/接口 | 该指标包含在哪个总量指标中；无则 null                                                                    | 无额外格式限制；仍遵守所属组件业务规则 |
| `display_name`    | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前规格查询按Accept-Language取发布目录名称；嵌入历史PriceSnapshot时使用当时冻结的名称，不查当前目录重建 | 无额外格式限制；仍遵守所属组件业务规则 |
| `unit_label`      | string              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前规格查询取发布目录的本地化计价单位；嵌入历史PriceSnapshot时使用当时冻结标签，不由前端猜unit          | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-currentpricing"></a>

### CurrentPricing

CurrentPricing 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                | 类型/组件                                       | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                     | 约束                                             |
| ------------------- | ----------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `state`             | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前取价状态：PRICED 有适用价格，UNPRICED 未定价，CURRENCY_MISMATCH 价格币种与当前内部币种不一致；不是模型生命周期状态       | enum=["PRICED", "UNPRICED", "CURRENCY_MISMATCH"] |
| `price`             | [PricingVersion](#schema-pricingversion) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 价格对象或价格版本，按所属组件定义解释                                                                                       | 无额外格式限制；仍遵守所属组件业务规则           |
| `price_version`     | integer                                         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前价格版本号，0表示尚未创建价格版本；只在价变更时递增，可计费性由取价状态判断                                              | minimum=0                                        |
| `metric_specs`      | array&lt;[MetricSpec](#schema-metricspec)&gt;   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该模型适配器允许的固定计量指标规格                                                                                           | 无额外格式限制；仍遵守所属组件业务规则           |
| `billing_currency`  | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次/当前总部内部计费币种                                                                                                    | 无额外格式限制；仍遵守所属组件业务规则           |
| `billing_time_zone` | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版实际计费时区Asia/Shanghai；用户显示时区不影响计价，不新增系统时区设置。                                                  | 无额外格式限制；仍遵守所属组件业务规则           |
| `currency_source`   | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部币种来源：总部配置或默认 CNY                                                                                             | enum=["HEADQUARTERS", "DEFAULT_CNY"]             |
| `time_zone_source`  | string                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版计费时区固定缺省Asia/Shanghai，来源DEFAULT_ASIA_SHANGHAI；不新增系统时区配置。历史快照按事实保存，不随用户显示时区变动。 | enum=["DEFAULT_ASIA_SHANGHAI"]                   |
| `unpriced_reason`   | string / null                                   | 否   | 是   | 无静态默认；省略语义见组件/接口 | 缺少适用价格的稳定原因码；已定价为空                                                                                         | 无额外格式限制；仍遵守所属组件业务规则           |

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
| `template_version_id`      | string                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例当前固定的数据库模板版本UUID；普通编辑必须回传，发布目录不会自动改写                                    | format="uuid"                                 |
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

仅DRAFT可修改；数值为Token整数，未知null；无type字段

| 字段                        | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                   |
| --------------------------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `provider_id`               | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                          |
| `model_id_at_gateway`       | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | minLength=1；maxLength=128             |
| `model_id_at_provider`      | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | minLength=1；maxLength=512             |
| `supported_invocation_apis` | array&lt;string&gt;                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 启用的标准调用接口集合；可为空。与服务端已适配的custom_invocation_apis合计至少一项；不新增RERANK标准枚举。                                                                    | uniqueItems=true                       |
| `custom_invocation_apis`    | array&lt;[CustomAPIInput](#schema-customapiinput)&gt; | 否   | 否   | 无静态默认；省略语义见组件/接口 | 另行启用的自定义相对路径列表，由服务端识别已适配协议；完整配置域省略时按空集合处理，编辑须回传希望保留的已选自定义项                                                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `input_modalities`          | array&lt;string&gt;                                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 输入模态集合；未知为空数组，不添加笼统 type                                                                                                                                   | uniqueItems=true                       |
| `output_modalities`         | array&lt;string&gt;                                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 输出模态集合；未知为空数组                                                                                                                                                    | uniqueItems=true                       |
| `context_window`            | integer / null                                        | 否   | 是   | 无静态默认；省略语义见组件/接口 | 模型上下文 Token 整数，未知 null，界面 1K=1000                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `max_output_tokens`         | integer / null                                        | 否   | 是   | 无静态默认；省略语义见组件/接口 | 最大输出 Token 整数，未知 null                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `tags`                      | array&lt;string&gt;                                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 能力标签及自定义标签；流式由规范化注册键识别                                                                                                                                  | uniqueItems=true                       |
| `description`               | string / null                                         | 否   | 是   | 无静态默认；省略语义见组件/接口 | 对象说明文字，按当前用户语言返回或按输入原文保存                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_model_version_id`  | string / null                                         | 否   | 是   | 无静态默认；省略语义见组件/接口 | 可选当前基础来源；显式null清除，省略且供应商/上游ID未变则保留；目标改变时后端重新核实或清除不成立来源。新选择须匹配供应商固定批次，不以型号字符串猜Azure部署身份              | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

组合约束：标准接口或已适配自定义接口至少一项；不能两者皆空。

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

全部域一个创建事务，不触发检测。先M13取得适配计量、官方原币参考/缺价0预填及当前内部币种；管理员确认后有计量规格时显式提交完整pricing；确无计量规格则pricing=null。expected_provider_version保护准备至保存的供应商上下文；目录发布不能改既有模型/企业价。

| 字段                        | 类型/组件                                             | 必填 | 可空 | 默认/省略                                                          | 字段说明                                                                                                                                                                      | 约束                                   |
| --------------------------- | ----------------------------------------------------- | ---- | ---- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `provider_id`               | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口                                    | 稳定UUID                                                                                                                                                                      | format="uuid"                          |
| `model_id_at_gateway`       | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口                                    | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | minLength=1；maxLength=128             |
| `model_id_at_provider`      | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口                                    | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | minLength=1；maxLength=512             |
| `supported_invocation_apis` | array&lt;string&gt;                                   | 是   | 否   | 无静态默认；省略语义见组件/接口                                    | 启用的标准调用接口集合；可为空。与服务端已适配的custom_invocation_apis合计至少一项；不新增RERANK标准枚举。                                                                    | uniqueItems=true                       |
| `custom_invocation_apis`    | array&lt;[CustomAPIInput](#schema-customapiinput)&gt; | 否   | 否   | []                                                                 | 另行启用的自定义相对路径列表，由服务端识别已适配协议；完整配置域省略时按空集合处理，编辑须回传希望保留的已选自定义项                                                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `input_modalities`          | array&lt;string&gt;                                   | 否   | 否   | []                                                                 | 输入模态集合；未知为空数组，不添加笼统 type                                                                                                                                   | uniqueItems=true                       |
| `output_modalities`         | array&lt;string&gt;                                   | 否   | 否   | []                                                                 | 输出模态集合；未知为空数组                                                                                                                                                    | uniqueItems=true                       |
| `context_window`            | integer / null                                        | 否   | 是   | null                                                               | 模型上下文 Token 整数，未知 null，界面 1K=1000                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `max_output_tokens`         | integer / null                                        | 否   | 是   | null                                                               | 最大输出 Token 整数，未知 null                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `tags`                      | array&lt;string&gt;                                   | 否   | 否   | []                                                                 | 能力标签及自定义标签；流式由规范化注册键识别                                                                                                                                  | uniqueItems=true                       |
| `description`               | string / null                                         | 否   | 是   | null                                                               | 对象说明文字，按当前用户语言返回或按输入原文保存                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则 |
| `initial_grants`            | array&lt;[Subject](#schema-subject)&gt;               | 否   | 否   | []                                                                 | 创建时的初始直接授权；省略为空                                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `health`                    | [HealthInput](#schema-healthinput)                    | 否   | 否   | {"auto_health_check": false, "health_check_interval_minutes": 360} | 自动健康配置或健康配置版本，按组件具体类型解释                                                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `pricing`                   | [PricingInput](#schema-pricinginput) / null           | 是   | 是   | 无静态默认；省略语义见组件/接口                                    | 必填确认结果：有可配置metric必须提交完整内部价格（包括默认0，expected_price_version=0）；仅服务端确认metric_specs确为空时允许null，保存UNPRICED且不建价格版本，不伪造计量项。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_model_version_id`  | string                                                | 否   | 否   | 无静态默认；省略语义见组件/接口                                    | 可选的M08内置型号版本UUID；后端校验供应商固定批次/模板及可信型号匹配。省略时首次命令按固定批次匹配或记录null，不接受浏览器元信息作为可信来源                                  | format="uuid"                          |
| `expected_provider_version` | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口                                    | M13返回的provider_version；创建时与实例当前版本比较，变化返回409 VERSION_CONFLICT，先刷新准备数据再由管理员确认。                                                             | minimum=1                              |

未声明字段：拒绝（`additionalProperties=false`）。

组合约束：标准接口或已适配自定义接口至少一项；不能两者皆空。

<a id="schema-modelversions"></a>

### ModelVersions

ModelVersions 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段     | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                                       | 约束      |
| -------- | --------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------- | --------- |
| `base`   | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模型基础配置版本；只有基础信息保存递增                         | minimum=1 |
| `state`  | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 生命周期版本；每次状态转换递增                                 | minimum=1 |
| `grants` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模型授权集合版本；真实关系变化递增                             | minimum=1 |
| `health` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 自动健康配置版本；开关/周期变更递增                            | minimum=1 |
| `price`  | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前价格版本号；0表示尚未创建价格版本，非0不代表当前一定可计费 | minimum=0 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-model"></a>

### Model

物理模型详情与保存结果。所有展示/编辑回显字段必返；未知上下文/输出上限/说明为null，未知模态/标签/自定义接口为[]。model_id_at_gateway就是管理员定义的唯一模型名称，不另设可写name。

| 字段                         | 类型/组件                                            | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                                                          |
| ---------------------------- | ---------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `provider_id`                | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                                                                 |
| `model_id_at_gateway`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | minLength=1；maxLength=128                                                    |
| `model_id_at_provider`       | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | minLength=1；maxLength=512                                                    |
| `supported_invocation_apis`  | array&lt;string&gt;                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 启用的标准调用接口集合；可为空。与服务端已适配的custom_invocation_apis合计至少一项；不新增RERANK标准枚举。                                                                    | uniqueItems=true                                                              |
| `custom_invocation_apis`     | array&lt;[CustomAPIView](#schema-customapiview)&gt;  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 另行启用的自定义相对路径列表，由服务端识别已适配协议；完整配置域省略时按空集合处理，编辑须回传希望保留的已选自定义项                                                          | 无额外格式限制；仍遵守所属组件业务规则                                        |
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
| `invocation_apis`            | array&lt;[InvocationAPI](#schema-invocationapi)&gt;  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端解析的所有已启用标准及自定义接口                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `created_at`                 | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                                                                               | format="date-time"                                                            |
| `updated_at`                 | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                                                                                                               | format="date-time"                                                            |
| `created_by`                 | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                                                                                      | format="uuid"                                                                 |
| `provider_template_key`      | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属供应商模板稳定键                                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_template_name`     | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 按实例固定模板版本投影的本地化模板名称，不跟随当前发布批次重解释                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_template_icon_key` | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 受控模板图标键，未知使用通用图标                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_base_url`          | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属供应商当前公开API地址；仅此页面所需值，不返回其认证字段/其他配置                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `catalog_model_version_id`   | string / null                                        | 是   | 是   | 无静态默认；省略语义见组件/接口 | 该对象实际采用的内置型号来源；没有可信匹配为null。历史来源不随目录发布或供应商改绑自动更新，不表示当前仍可适配                                                                | 无额外格式限制；仍遵守所属组件业务规则                                        |

未声明字段：拒绝（`additionalProperties=false`）。

组合约束：标准接口或已适配自定义接口至少一项；不能两者皆空。

<a id="schema-modelupdate"></a>

### ModelUpdate

至少一个修改域；base需expected_base_version，health需其version；grants/pricing自带版本；所有提交域一起提交或回滚

| 字段                             | 类型/组件                            | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                       | 约束                                   |
| -------------------------------- | ------------------------------------ | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| `expected_base_version`          | integer                              | 否   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                         | minimum=1                              |
| `base`                           | [ModelBase](#schema-modelbase)       | 否   | 否   | 无静态默认；省略语义见组件/接口 | 基础配置域；只有 DRAFT 可以修改                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `grants`                         | [GrantDelta](#schema-grantdelta)     | 否   | 否   | 无静态默认；省略语义见组件/接口 | 授权差异域；与其他提交域整体事务                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `pricing`                        | [PricingInput](#schema-pricinginput) | 否   | 否   | 无静态默认；省略语义见组件/接口 | 可选价格修改域；提交则显式保存新企业价格版本并与其他域同事务，currency必填且重验当前总部币种。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `health`                         | [HealthInput](#schema-healthinput)   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 自动健康配置或健康配置版本，按组件具体类型解释                                                 | 无额外格式限制；仍遵守所属组件业务规则 |
| `expected_health_config_version` | integer                              | 否   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                         | minimum=1                              |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-statuscommand"></a>

### StatusCommand

拒绝/暂停前端必填原因，API可选并保存；不直接设置任意状态

| 字段                     | 类型/组件 | 必填 | 可空 | 默认/省略                       | 字段说明                                          | 约束                                                                    |
| ------------------------ | --------- | ---- | ---- | ------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `action`                 | string    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 生命周期动作；不接受任意目标状态                  | enum=["APPROVE", "REJECT", "SUSPEND", "RESUME", "RETIRE", "REACTIVATE"] |
| `expected_state_version` | integer   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                            | minimum=1                                                               |
| `reason`                 | string    | 否   | 否   | 无静态默认；省略语义见组件/接口 | 本次管理操作原因；可省略，拒绝/暂停时前端要求填写 | maxLength=512                                                           |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-modeltemplate"></a>

### ModelTemplate

同一数据库发布批次中的内置型号规格。目录是建议/来源，不是实例已经绑定的官方型号或实际调用验证；metadata中的实例型号绑定未核实时为完整UNKNOWN，不能凭目录字符串置VERIFIED。

| 字段                        | 类型/组件                                                       | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                    | 约束                                                                    |
| --------------------------- | --------------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `template_key`              | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 只读供应商模板注册键                                                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `model_id_at_provider`      | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `metadata`                  | [ModelMetadata](#schema-modelmetadata)                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 规范化元信息及字段来源，不包含内部手册价格                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `suggested_invocation_apis` | array&lt;string&gt;                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 建议启用的标准接口，不能据此替代模型实际能力确认                                                                                                                                            | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `metric_specs`              | array&lt;[MetricSpec](#schema-metricspec)&gt;                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该模型适配器允许的固定计量指标规格                                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `builtin_pricing`           | [BuiltinPricingTemplate](#schema-builtinpricingtemplate) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 有pricing:READ时返回当前型号的官方原币参考价；无可用参考或无权限为null，按pricing_state区分。多官方币种按目录preferred_reference_currency选择，不按内部预算币种过滤；不是模型已生效内部价。 | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `pricing_state`             | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 官方参考状态：AVAILABLE有可表达官方参考；NEEDS_CONFIGURATION无可用公开价格；UNSUPPORTED_RULE官方复杂/不完整规则无法表达；无pricing:READ为HIDDEN。不能从null/HIDDEN推断企业默认免费资格。    | enum=["AVAILABLE", "NEEDS_CONFIGURATION", "UNSUPPORTED_RULE", "HIDDEN"] |
| `pricing_details_visible`   | boolean                                                         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 具有model.pricing:READ才为true；false时builtin_pricing=null且pricing_state=HIDDEN，不能把不可见误作没有价格                                                                                 | 无额外格式限制；仍遵守所属组件业务规则                                  |
| `catalog_model_version_id`  | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该发布批次内置型号条目UUID；选择预填时回传，不能仅凭型号字符串猜来源                                                                                                                        | format="uuid"                                                           |
| `template_version_id`       | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属数据库模板版本UUID                                                                                                                                                                      | format="uuid"                                                           |
| `catalog_release_id`        | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 此模型和模板/内置价共同所属的发布批次UUID                                                                                                                                                   | format="uuid"                                                           |
| `catalog_revision`          | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该条目所属发布批次唯一可读版本                                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                  |

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

发现元信息/目录由可信快照读取；显式catalog_model_version_id须一致。手工无目录由首次命令固定实例批次匹配或null。省略接口时先解析可信候选/目录，最终标准或已适配自定义至少一项；有指标时pricing必须完整且对应实际启用接口指标；服务端确无指标时显式null。

| 字段                        | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                   |
| --------------------------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `model_id_at_provider`      | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商内上游模型 ID 或部署名，去首尾空白，区分大小写                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `model_id_at_gateway`       | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `supported_invocation_apis` | array&lt;string&gt;                                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 启用的标准调用接口集合；可为空。与服务端已适配的custom_invocation_apis合计至少一项；不新增RERANK标准枚举。                                                                    | 无额外格式限制；仍遵守所属组件业务规则 |
| `custom_invocation_apis`    | array&lt;[CustomAPIInput](#schema-customapiinput)&gt; | 否   | 否   | 无静态默认；省略语义见组件/接口 | 另行启用的自定义相对路径列表，由服务端识别已适配协议                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_model_version_id`  | string                                                | 否   | 否   | 无静态默认；省略语义见组件/接口 | 可选的M08内置型号版本UUID；后端校验供应商固定批次/模板及可信型号匹配。省略时首次命令按固定批次匹配或记录null，不接受浏览器元信息作为可信来源                                  | format="uuid"                          |
| `pricing`                   | [PricingInput](#schema-pricinginput) / null           | 是   | 是   | 无静态默认；省略语义见组件/接口 | 必填确认结果：有可配置metric必须提交完整内部价格（包括默认0，expected_price_version=0）；仅服务端确认metric_specs确为空时允许null，保存UNPRICED且不建价格版本，不伪造计量项。 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-importinput"></a>

### ImportInput

逐项事务，100项为技术批量上限，不限制总模型数。每个新建项必须明确提交pricing：有指标为完整配置，确无指标为null；已存在上游ID仍跳过，不覆盖旧价。首次受理固定供应商/目录/预算币种上下文，恢复不取最新目录重解释已接受价格。

| 字段                        | 类型/组件                                     | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                          | 约束                                   |
| --------------------------- | --------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `discovery_id`              | string / null                                 | 否   | 是   | 无静态默认；省略语义见组件/接口 | 发现快照 UUID；手工批量录入为 null 或省略                                                                         | 无额外格式限制；仍遵守所属组件业务规则 |
| `models`                    | array&lt;[ImportItem](#schema-importitem)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次操作的物理模型集合；技术批量上限不限制总模型规模                                                              | minItems=1；maxItems=100               |
| `expected_provider_version` | integer                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | M13返回的provider_version；创建时与实例当前版本比较，变化返回409 VERSION_CONFLICT，先刷新准备数据再由管理员确认。 | minimum=1                              |

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

| 字段                        | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                             | 约束                                   |
| --------------------------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `physical_model_id`         | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                             | format="uuid"                          |
| `expected_base_version`     | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                                               | minimum=1                              |
| `supported_invocation_apis` | array&lt;string&gt;                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 启用的标准调用接口集合；可为空。与服务端已适配的custom_invocation_apis合计至少一项；不新增RERANK标准枚举。           | uniqueItems=true                       |
| `custom_invocation_apis`    | array&lt;[CustomAPIInput](#schema-customapiinput)&gt; | 否   | 否   | 无静态默认；省略语义见组件/接口 | 另行启用的自定义相对路径列表，由服务端识别已适配协议；完整配置域省略时按空集合处理，编辑须回传希望保留的已选自定义项 | 无额外格式限制；仍遵守所属组件业务规则 |
| `reuse_job_id`              | string                                                | 否   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                                                             | format="uuid"                          |

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
| `model_provider_snapshot`   | [ModelProviderSnapshot](#schema-modelprovidersnapshot)     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商、模型和本项目调用接口的完整安全快照                                                                | 无额外格式限制；仍遵守所属组件业务规则                          |
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

| 字段                      | 类型/组件                                                         | 必填 | 可空 | 默认/省略                       | 字段说明                                                                         | 约束                                                 |
| ------------------------- | ----------------------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `id`                      | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                         | format="uuid"                                        |
| `physical_model_id`       | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                         | format="uuid"                                        |
| `purpose`                 | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | ADMISSION 准入或 HEALTH 健康；HTTP 摘要组件另用其自身枚举                        | enum=["ADMISSION", "HEALTH"]                         |
| `trigger_type`            | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | MANUAL 人工触发或 AUTO 自动调度                                                  | enum=["MANUAL", "AUTO"]                              |
| `triggered_by`            | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 人工触发人的 UUID；自动任务可空，费用始终归 system                               | 无额外格式限制；仍遵守所属组件业务规则               |
| `status`                  | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                       | enum=["QUEUED", "RUNNING", "COMPLETED", "CANCELLED"] |
| `result`                  | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 任务汇总结果；未结束时 null，不能把 ACCEPTED 当 PASS                             | 无额外格式限制；仍遵守所属组件业务规则               |
| `base_version`            | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                           | minimum=1                                            |
| `admission_epoch`         | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                                                         | format="uuid"                                        |
| `provider_version`        | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                           | minimum=1                                            |
| `planned_model_calls`     | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次计划的新模型调用项目数，不含不适用或复用项                                   | minimum=0                                            |
| `actual_model_calls`      | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 已持久确认进入HTTP调用的次数，不能证明上游收到                                   | minimum=0                                            |
| `unknown_model_calls`     | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 占用发送权但无法确认调用的数量                                                   | minimum=0                                            |
| `auxiliary_http_calls`    | integer                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 认证、上传、同任务轮询等辅助 HTTP 动作数                                         | minimum=0                                            |
| `created_at`              | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                  | format="date-time"                                   |
| `started_at`              | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 实际开始时间；尚未开始为空时以字段可空定义为准                                   | 无额外格式限制；仍遵守所属组件业务规则               |
| `deadline_at`             | string                                                            | 是   | 否   | 无静态默认；省略语义见组件/接口 | RFC3339 UTC时间                                                                  | format="date-time"                                   |
| `completed_at`            | string / null                                                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 终态完成时间；未完成为 null                                                      | 无额外格式限制；仍遵守所属组件业务规则               |
| `items`                   | array&lt;[CheckItem](#schema-checkitem)&gt;                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件                                 | 无额外格式限制；仍遵守所属组件业务规则               |
| `pricing_details_visible` | boolean                                                           | 是   | 否   | 无静态默认；省略语义见组件/接口 | 仅具有model.pricing:READ时返回完整cost和价格快照，否则cost=null且summary不含价费 | 无额外格式限制；仍遵守所属组件业务规则               |
| `summary`                 | [CheckSummary](#schema-checksummary)                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 检查项目计数及按权限裁剪的费用汇总                                               | 无额外格式限制；仍遵守所属组件业务规则               |
| `triggered_by_display`    | [IdentitySnapshot](#schema-identitysnapshot)                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当时触发人：MANUAL为冻结用户名字，AUTO为自动任务身份；不要求pricing:READ         | 无额外格式限制；仍遵守所属组件业务规则               |
| `model_display`           | [ModelDisplaySnapshot](#schema-modeldisplaysnapshot)              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 任务时模型与供应商显示引用，不从CostRecord取值                                   | 无额外格式限制；仍遵守所属组件业务规则               |
| `check_types`             | array&lt;string&gt;                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本轮计划/历史实际包含的检测类型集合，供列表展示；不以ADMISSION/HEALTH用途代替    | uniqueItems=true                                     |
| `invocation_apis`         | array&lt;[InvocationAPIDisplay](#schema-invocationapidisplay)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本轮接口去重摘要；历史行不必逐项请求详情以补接口名称                             | 无额外格式限制；仍遵守所属组件业务规则               |

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

| 字段                | 类型/组件                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                        | 约束                                                                                        |
| ------------------- | ------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `fields`            | object                                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 字段路径到稳定字段错误码的映射                  | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `current_version`   | integer                                                 | 否   | 否   | 无静态默认；省略语义见组件/接口 | 发生冲突时的当前可见版本                        | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `version_domain`    | string                                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 发生版本冲突的配置域                            | enum=["PROVIDER", "BASE", "STATE", "GRANTS", "HEALTH", "PRICE", "BALANCE", "AUTHORIZATION"] |
| `allowed_actions`   | array&lt;string&gt;                                     | 否   | 否   | 无静态默认；省略语义见组件/接口 | 当前状态允许的管理动作，仅提示，不授予权限      | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `job_id`            | string                                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 稳定UUID                                        | format="uuid"                                                                               |
| `reason_code`       | string                                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 稳定、可本地化的原因码，不含上游秘密原文        | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `retryable_by_user` | boolean                                                 | 否   | 否   | 无静态默认；省略语义见组件/接口 | 是否允许用户明确修正/重新发起，绝不表示自动重试 | 无额外格式限制；仍遵守所属组件业务规则                                                      |
| `details`           | array&lt;[SafeErrorDetail](#schema-safeerrordetail)&gt; | 否   | 否   | 无静态默认；省略语义见组件/接口 | 可安全显示的细分错误列表；无细节时可省略        | 无额外格式限制；仍遵守所属组件业务规则                                                      |

未声明字段：拒绝（`additionalProperties=false`）。

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

ModelTemplatePage 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                 | 类型/组件                                           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                     | 约束                                   |
| -------------------- | --------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `items`              | array&lt;[ModelTemplate](#schema-modeltemplate)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件                             | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`               | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从 1 开始的当前页码，默认 1                                                  | minimum=1                              |
| `page_size`          | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页条数，默认 20，上限 100                                                  | minimum=1；maximum=100                 |
| `total`              | integer                                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数                                      | minimum=0                              |
| `catalog_release_id` | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次读取固定的数据库目录发布批次；同一页及续页保持同批，不随当前指针变化混合 | format="uuid"                          |
| `catalog_revision`   | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该固定发布批次的唯一可读版本                                                 | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

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

| 字段        | 类型/组件                                               | 必填 | 可空 | 默认/省略                       | 字段说明                                         | 约束                                   |
| ----------- | ------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `items`     | array&lt;[AccessibleModel](#schema-accessiblemodel)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件 | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`      | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从 1 开始的当前页码，默认 1                      | minimum=1                              |
| `page_size` | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页条数，默认 20，上限 100                      | minimum=1；maximum=100                 |
| `total`     | integer                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数          | minimum=0                              |

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

GrantPage 字段契约；下列字段含义、必填与空值均是正式设计要求

| 字段                    | 类型/组件                           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                               | 约束                                   |
| ----------------------- | ----------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `items`                 | array&lt;[Grant](#schema-grant)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本页或当前对象的明细集合；元素完整字段见链接组件                                                                       | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`                  | integer                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从 1 开始的当前页码，默认 1                                                                                            | minimum=1                              |
| `page_size`             | integer                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 每页条数，默认 20，上限 100                                                                                            | minimum=1；maximum=100                 |
| `total`                 | integer                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前相同范围/筛选下总数，不是当前页条数                                                                                | minimum=0                              |
| `grant_version`         | integer                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                                                 | minimum=1                              |
| `authorization_version` | integer                             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 全新 ma_grant_state 单例 revision；仅保护模型直接授权集合的并发，不能冻结身份成员/部门等有效授权来源；保存时仍需重校验 | minimum=1                              |

未声明字段：拒绝（`additionalProperties=false`）。

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

数据库官方原币参考价投影，保留真实币种、计价单位、完整可表达规则和官方来源。不是物理模型内部价格；不按预算币种筛选，不因官方USD而判无CNY价。目录发布不改变已有企业价格。预填只借用数字，管理员确认内部价后才创建。

| 字段                       | 类型/组件                                                 | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                          | 约束                                   |
| -------------------------- | --------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `currency`                 | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原始价的币种；不能把外币改标成总部币种                                                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `time_zone`                | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 官方参考规则本身的生效时区，不取内部Asia/Shanghai替换；若不能无歧义表达则标UNSUPPORTED_RULE，不生成可用参考条目。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `pricing_mode`             | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 固定价 FIXED 或分时价 TIME_BASED                                                                                  | enum=["FIXED", "TIME_BASED"]           |
| `periods`                  | array&lt;[PricePeriodInput](#schema-priceperiodinput)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整计价时段；固定价恰一个兜底，分时价按规则设置                                                                  | minItems=1                             |
| `catalog_revision`         | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所属数据库目录发布批次revision，与catalog_price_version_id及外层型号来源一致                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `adapter_revision`         | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 适配器计量规格版本                                                                                                | 无额外格式限制；仍遵守所属组件业务规则 |
| `source_uris`              | array&lt;string&gt;                                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该已发布内置价条目的公开定价依据；无可公开来源时为空数组，不返回调研清单或项目审批链接                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `rounding`                 | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版参考结构的Decimal舍入约定HALF_EVEN；不声称复刻供应商最终账单。                                                | enum=["HALF_EVEN"]                     |
| `amount_scale`             | integer                                                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版Decimal金额精度18位；实际内部价另有独立快照。                                                                 | const=18                               |
| `catalog_price_version_id` | string                                                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | ma_catalog_prices不可变条目UUID；与外层ModelTemplate同一批次和型号，表单预填时可作为自定义价参考来源              | format="uuid"                          |

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

检测单项事件快照；无秘密；供应商/模型删除后仍可解释费用

| 字段                       | 类型/组件                                            | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                   |
| -------------------------- | ---------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `schema_version`           | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 快照格式版本                                                                                                                                                                  | const=1                                |
| `physical_model_id`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时物理模型 UUID                                                                                                                                                           | format="uuid"                          |
| `model_id_at_gateway`      | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | 无额外格式限制；仍遵守所属组件业务规则 |
| `model_id_at_provider`     | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时上游模型/部署 ID                                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `provider_id`              | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商实例 UUID                                                                                                                                                         | format="uuid"                          |
| `provider_name`            | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商实例名称                                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_key`             | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时模板键                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_revision`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时模板规格版本                                                                                                                                                            | 无额外格式限制；仍遵守所属组件业务规则 |
| `base_url`                 | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时不含秘密的供应商 Base URL                                                                                                                                               | 无额外格式限制；仍遵守所属组件业务规则 |
| `public_config`            | [ProviderPublicConfig](#schema-providerpublicconfig) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商非秘密配置，按当时模板白名单解释                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `official_model_binding`   | [OfficialModelBinding](#schema-officialmodelbinding) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 只读官方型号/部署绑定；代次不一致派生 STALE                                                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则 |
| `base_version`             | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时模型基础版本                                                                                                                                                            | minimum=1                              |
| `provider_version`         | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商版本                                                                                                                                                              | minimum=1                              |
| `connection_revision`      | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时供应商连接身份版本                                                                                                                                                      | minimum=1                              |
| `invocation_api`           | [InvocationAPI](#schema-invocationapi)               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 此费用执行项使用的接口及适配器版本快照                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则 |
| `tags`                     | array&lt;string&gt;                                  | 是   | 否   | 无静态默认；省略语义见组件/接口 | 模型能力标签                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_name`            | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 从冻结模板标签按请求语言投影的名称；不得读取当前目录冒充历史                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_icon_key`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 事件时受控模板图标键，未知用通用图标                                                                                                                                          | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_catalog_binding` | [CatalogBinding](#schema-catalogbinding)             | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次执行/显示所冻结供应商模板来源；model/price两键为null，不能混入模型或价格另一历史批次                                                                                      | 无额外格式限制；仍遵守所属组件业务规则 |
| `model_catalog_binding`    | [CatalogBinding](#schema-catalogbinding) / null      | 是   | 是   | 无静态默认；省略语义见组件/接口 | 模型原内置规格的独立历史来源；无来源null，price键为null。供应商改绑后可与template_catalog_binding不同批，不表示当前适配承诺                                                   | 无额外格式限制；仍遵守所属组件业务规则 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-matchedpriceperiod"></a>

### MatchedPricePeriod

命中的唯一计费时段

| 字段          | 类型/组件                             | 必填 | 可空 | 默认/省略                       | 字段说明                   | 约束                                   |
| ------------- | ------------------------------------- | ---- | ---- | ------------------------------- | -------------------------- | -------------------------------------- |
| `name`        | string                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 命中时段名称               | 无额外格式限制；仍遵守所属组件业务规则 |
| `is_fallback` | boolean                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否命中兜底时段           | 无额外格式限制；仍遵守所属组件业务规则 |
| `conditions`  | array&lt;[Window](#schema-window)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 命中时段条件；兜底为空     | 无额外格式限制；仍遵守所属组件业务规则 |
| `matched_at`  | string                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 价格选择依据的请求开始时刻 | format="date-time"                     |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-pricesnapshot"></a>

### PriceSnapshot

完整价快照。PRICED 时 price/matched_period 非空；未定价时 price=null，币种不匹配时允许保留原价 price 用于解释，matched_period=null；本次计费仍为 UNPRICED/CURRENCY_MISMATCH，不换标或换汇。所有规则不依赖价格表存续。

| 字段                | 类型/组件                                                   | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                         | 约束                                             |
| ------------------- | ----------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `schema_version`    | integer                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 快照格式版本                                                                                                                                                                                     | const=1                                          |
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

不可变单项算式与依据；保留全部输入，不从当前价格重新计算历史

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

| 字段                  | 类型/组件                                            | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                       | 约束                                          |
| --------------------- | ---------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `name`                | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                                                                               | minLength=1；maxLength=128                    |
| `template_key`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例选用的稳定供应商模板键；与template_version_id对应，允许通过既有模板选择和保存修改，目录数据无产品写接口    | 无额外格式限制；仍遵守所属组件业务规则        |
| `base_url`            | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整供应商 Base URL；禁止携带用户名密码或秘密查询参数                                                          | maxLength=2048                                |
| `security_level`      | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商网络安全分类标签；不是出口审批或网络许可                                                                 | enum=["INTERNET", "TRUSTED_CLOUD", "PRIVATE"] |
| `public_config`       | [ProviderPublicConfig](#schema-providerpublicconfig) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 创建时的模板公开参数，未知键拒绝                                                                               | 无额外格式限制；仍遵守所属组件业务规则        |
| `secrets`             | [SecretInput](#schema-secretinput)                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 仅请求输入的秘密字段；不回显，不写日志                                                                         | 无额外格式限制；仍遵守所属组件业务规则        |
| `clear_secret_fields` | array&lt;string&gt;                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 明确清除的秘密字段键；与本次非空替换字段不可冲突                                                               | uniqueItems=true                              |
| `notes`               | string / null                                        | 否   | 是   | 无静态默认；省略语义见组件/接口 | 可空备注，去除秘密后原文保存                                                                                   | 无额外格式限制；仍遵守所属组件业务规则        |
| `balance_config`      | [BalanceConfigInput](#schema-balanceconfiginput)     | 否   | 否   | 无静态默认；省略语义见组件/接口 | 可选余额配置，与供应商创建同事务；省略为 NONE                                                                  | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_version_id` | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | P01返回的准确模板版本UUID，必须与template_key一致；创建/改选只能采用当前允许新绑定版本，普通编辑回传实例原版本 | format="uuid"                                 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-providerupdate"></a>

### ProviderUpdate

供应商完整编辑；必传读取版本，不限制模型状态，不触发准入；template_version_id必传，不按template_key静默解析最新版本

| 字段                  | 类型/组件                                            | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                       | 约束                                          |
| --------------------- | ---------------------------------------------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `expected_version`    | integer                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 乐观版本，需回传读取值                                                                                         | minimum=1                                     |
| `name`                | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                                                                               | minLength=1；maxLength=128                    |
| `template_key`        | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例选用的稳定供应商模板键；与template_version_id对应，允许通过既有模板选择和保存修改，目录数据无产品写接口    | 无额外格式限制；仍遵守所属组件业务规则        |
| `base_url`            | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 完整供应商 Base URL；禁止携带用户名密码或秘密查询参数                                                          | maxLength=2048                                |
| `security_level`      | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商网络安全分类标签；不是出口审批或网络许可                                                                 | enum=["INTERNET", "TRUSTED_CLOUD", "PRIVATE"] |
| `public_config`       | [ProviderPublicConfig](#schema-providerpublicconfig) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 编辑时完整替换的模板公开参数，未知键拒绝                                                                       | 无额外格式限制；仍遵守所属组件业务规则        |
| `secrets`             | [SecretInput](#schema-secretinput)                   | 否   | 否   | 无静态默认；省略语义见组件/接口 | 仅请求输入的秘密字段；不回显，不写日志                                                                         | 无额外格式限制；仍遵守所属组件业务规则        |
| `clear_secret_fields` | array&lt;string&gt;                                  | 否   | 否   | 无静态默认；省略语义见组件/接口 | 明确清除的秘密字段键；与本次非空替换字段不可冲突                                                               | uniqueItems=true                              |
| `notes`               | string / null                                        | 否   | 是   | 无静态默认；省略语义见组件/接口 | 可空备注，去除秘密后原文保存                                                                                   | 无额外格式限制；仍遵守所属组件业务规则        |
| `balance_config`      | [BalanceConfigInput](#schema-balanceconfiginput)     | 否   | 否   | 无静态默认；省略语义见组件/接口 | 可选余额配置，与供应商编辑同事务；省略保持原配置                                                               | 无额外格式限制；仍遵守所属组件业务规则        |
| `template_version_id` | string                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | P01返回的准确模板版本UUID，必须与template_key一致；创建/改选只能采用当前允许新绑定版本，普通编辑回传实例原版本 | format="uuid"                                 |

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

准入接口复用来源快照；本版只复用满足同模型/周期/基础版本的终态完整通过接口。源价格/费用不计入本次，源秘密绝不复制到 API。 source_result 仅是 CheckResultDetail，不包含 reuse_source；若直接来源也是 REUSED，则把原实际 PASS 的结果/配置扁平复制在此一层，source_job_id/source_item_id仍记录直接来源，不递归嵌套。

| 字段                             | 类型/组件                                              | 必填 | 可空 | 默认/省略                       | 字段说明                                                         | 约束                                   |
| -------------------------------- | ------------------------------------------------------ | ---- | ---- | ------------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| `source_job_id`                  | string                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原准入任务 UUID；源记录清理后仍保留                              | format="uuid"                          |
| `source_item_id`                 | string                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原检查项目 UUID；只是历史线索，不需要可 JOIN                     | format="uuid"                          |
| `source_base_version`            | integer                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原模型基础配置版本                                               | minimum=1                              |
| `source_admission_epoch`         | string                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原准入周期 UUID，须与复用资格匹配                                | format="uuid"                          |
| `source_provider_version`        | integer                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原检测冻结的供应商版本；可能不同于本次供应商版本                 | minimum=1                              |
| `source_completed_at`            | string                                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原项目完成时间                                                   | format="date-time"                     |
| `source_model_provider_snapshot` | [ModelProviderSnapshot](#schema-modelprovidersnapshot) | 是   | 否   | 无静态默认；省略语义见组件/接口 | 原实际检测所用供应商、模型、接口及公开配置快照，不含秘密         | 无额外格式限制；仍遵守所属组件业务规则 |
| `source_result`                  | [CheckResultDetail](#schema-checkresultdetail)         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 复制的原 PASS 完整断言和协议结果，不重新执行、不依赖旧 item 存续 | 无额外格式限制；仍遵守所属组件业务规则 |

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

模型创建/编辑供应商选项；分页搜索，按实例名/模板名检索。

| 字段        | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                     | 约束                                   |
| ----------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------- | -------------------------------------- |
| `items`     | array&lt;[ProviderOption](#schema-provideroption)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页结果，空页返回[]       | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`      | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页，从1开始              | minimum=1                              |
| `page_size` | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页大小，默认20、最大100  | minimum=1；maximum=100                 |
| `total`     | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一权限范围和筛选条件下总数 | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

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

现有标签去重分页目录，用户可搜索后选择或按既有表单新输入标签。

| 字段        | 类型/组件                                   | 必填 | 可空 | 默认/省略                       | 字段说明                     | 约束                                   |
| ----------- | ------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------- | -------------------------------------- |
| `items`     | array&lt;[TagOption](#schema-tagoption)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页结果，空页返回[]       | 无额外格式限制；仍遵守所属组件业务规则 |
| `page`      | integer                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页，从1开始              | minimum=1                              |
| `page_size` | integer                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前页大小，默认20、最大100  | minimum=1；maximum=100                 |
| `total`     | integer                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 同一权限范围和筛选条件下总数 | minimum=0                              |

未声明字段：拒绝（`additionalProperties=false`）。

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

| 字段           | 类型/组件                                                   | 必填 | 可空 | 默认/省略                       | 字段说明                                         | 约束                                   |
| -------------- | ----------------------------------------------------------- | ---- | ---- | ------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `name`         | string                                                      | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对象显示名称，精确含义见所属组件                 | minLength=1；maxLength=128             |
| `is_fallback`  | boolean                                                     | 是   | 否   | 无静态默认；省略语义见组件/接口 | 是否兜底时段；每个价格版本恰好一个               | 无额外格式限制；仍遵守所属组件业务规则 |
| `conditions`   | array&lt;[Window](#schema-window)&gt;                       | 是   | 否   | 无静态默认；省略语义见组件/接口 | 星期与分钟窗口；兜底或固定价为空，非兜底不得重叠 | 无额外格式限制；仍遵守所属组件业务规则 |
| `metric_rates` | array&lt;[MetricRateDisplay](#schema-metricratedisplay)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前时段完整指标与费率                           | 无额外格式限制；仍遵守所属组件业务规则 |

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

| 字段                        | 类型/组件                                           | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                      | 约束                                                                          |
| --------------------------- | --------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `physical_model_id`         | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 已创建或当前可见已存在的新版物理模型UUID                                                                                                                                      | format="uuid"                                                                 |
| `model_id_at_gateway`       | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 系统全局唯一对外调用ID；服务端按固定Unicode White_Space集合去首尾空白后校验1～128个Unicode码点，区分大小写，不做lower/casefold或Unicode规范化。检查与保存使用同一规范化函数。 | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `model_id_at_provider`      | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实际保存后的上游ID                                                                                                                                                            | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `provider_id`               | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商UUID                                                                                                                                                                    | format="uuid"                                                                 |
| `provider_name`             | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 供应商实例名                                                                                                                                                                  | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `status`                    | string                                              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                                                                                                                                    | enum=["DRAFT", "TESTING", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "RETIRED"] |
| `versions`                  | [ModelVersions](#schema-modelversions)              | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实际保存后的全部版本；后续检测/发布必须回传，禁止猜初值1                                                                                                                      | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `supported_invocation_apis` | array&lt;string&gt;                                 | 是   | 否   | 无静态默认；省略语义见组件/接口 | 启用的标准调用接口集合；可为空。与服务端已适配的custom_invocation_apis合计至少一项；不新增RERANK标准枚举。                                                                    | uniqueItems=true                                                              |
| `custom_invocation_apis`    | array&lt;[CustomAPIView](#schema-customapiview)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 另行启用的自定义相对路径列表，由服务端识别已适配协议；完整配置域省略时按空集合处理，编辑须回传希望保留的已选自定义项                                                          | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `invocation_apis`           | array&lt;[InvocationAPI](#schema-invocationapi)&gt; | 是   | 否   | 无静态默认；省略语义见组件/接口 | 服务端解析的所有已启用标准及自定义接口                                                                                                                                        | 无额外格式限制；仍遵守所属组件业务规则                                        |
| `catalog_model_version_id`  | string / null                                       | 是   | 是   | 无静态默认；省略语义见组件/接口 | 该对象实际采用的内置型号来源；没有可信匹配为null。历史来源不随目录发布或供应商改绑自动更新，不表示当前仍可适配                                                                | 无额外格式限制；仍遵守所属组件业务规则                                        |

未声明字段：拒绝（`additionalProperties=false`）。

组合约束：标准接口或已适配自定义接口至少一项；不能两者皆空。

<a id="schema-importbatchitem"></a>

### ImportBatchItem

导入逐行结果。input_index只辅助对照；恢复/幂等重放仍返回已固化模型展示事实。旧对象不可见时不得返回其UUID/名称。

| 字段                | 类型/组件                                             | 必填 | 可空 | 默认/省略                       | 字段说明                                                        | 约束                                             |
| ------------------- | ----------------------------------------------------- | ---- | ---- | ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `input_index`       | integer                                               | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对应请求数组的零起始下标，用于逐项反馈                          | minimum=0                                        |
| `physical_model_id` | string / null                                         | 是   | 是   | 无静态默认；省略语义见组件/接口 | 新版物理模型 UUID；不接受旧逻辑模型或 model_resources ID        | 无额外格式限制；仍遵守所属组件业务规则           |
| `status`            | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本组件业务状态，不能仅凭 HTTP 200 判断成功                      | enum=["CREATED", "SKIPPED_EXISTING", "REJECTED"] |
| `code`              | string                                                | 是   | 否   | 无静态默认；省略语义见组件/接口 | 稳定业务结果码；成功外层为 OK                                   | 无额外格式限制；仍遵守所属组件业务规则           |
| `params`            | [ErrorParams](#schema-errorparams)                    | 是   | 否   | 无静态默认；省略语义见组件/接口 | 安全、本地化结果参数，不能包含秘密或原始报文                    | 无额外格式限制；仍遵守所属组件业务规则           |
| `model`             | [ImportedModelView](#schema-importedmodelview) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 成功/当前可见的SKIPPED_EXISTING时返回；未创建或对象不可见时null | 无额外格式限制；仍遵守所属组件业务规则           |

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

余额配置选人专用搜索/分页，仅返回当前管理范围启用用户；不需identity.users或model.permissions权限。

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

已保存自定义接口的只读回显；`id`和`path`均必返。编辑使用已有id，不从路径/行号猜身份。写入新条目仍用CustomAPIInput。

| 字段   | 类型/组件 | 必填 | 可空 | 默认/省略        | 字段说明                       | 约束                 |
| ------ | --------- | ---- | ---- | ---------------- | ------------------------------ | -------------------- |
| `id`   | string    | 是   | 否   | 由已保存记录返回 | 本模型已保存自定义接口UUID     | format=uuid          |
| `path` | string    | 是   | 否   | 由已保存记录返回 | 已保存的自定义上游相对路径原文 | 服务端原路径校验保持 |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-catalogbinding"></a>

### CatalogBinding

不可变数据库目录来源绑定；同一对象内五键必须指向同一完整发布批次。运行模板、模型原来源、价格来源分别保存对象，允许它们属于不同历史批次；引用只用于追溯，不代表当前可采用/可适配，也不能替代已固化的完整内容。

| 字段                       | 类型/组件     | 必填 | 可空 | 默认/省略                       | 字段说明                                                 | 约束                                   |
| -------------------------- | ------------- | ---- | ---- | ------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| `catalog_release_id`       | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | ma_catalog_releases.id，准确目录发布批次UUID             | format="uuid"                          |
| `catalog_revision`         | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 对应发布批次唯一可读revision；与ID一致，不是项目评审版本 | 无额外格式限制；仍遵守所属组件业务规则 |
| `template_version_id`      | string        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 该批次ma_catalog_provider_templates.id                   | format="uuid"                          |
| `catalog_model_version_id` | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 模型目录条目UUID；仅模板来源或未匹配型号时null           | 无额外格式限制；仍遵守所属组件业务规则 |
| `catalog_price_version_id` | string / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 内置价格目录条目UUID；无价格参考时null                   | 无额外格式限制；仍遵守所属组件业务规则 |

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

每一内部价格版本固化的计价依据；服务端判定，不接收客户端source/kind。官方参考完整保存原币原费率及来源，不能只JOIN可删除的业务表解释历史。

| 字段                  | 类型/组件                                                       | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                                   | 约束                                                                                    |
| --------------------- | --------------------------------------------------------------- | ---- | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `schema_version`      | integer                                                         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 计价依据快照结构版本，固定1。                                                                                                                                                                              | const=1                                                                                 |
| `kind`                | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | OFFICIAL_PREFILL_CONFIRMED=首次创建/导入带可信官方参考并明确保存内部价；ENTERPRISE_CONFIGURED=其他企业配置/后续改价；ENTERPRISE_DEFAULT_ZERO=首次真实缺价且完整固定0。参考后确认不保证数字未改或经济等值。 | enum=["OFFICIAL_PREFILL_CONFIRMED", "ENTERPRISE_CONFIGURED", "ENTERPRISE_DEFAULT_ZERO"] |
| `default_zero_reason` | string / null                                                   | 是   | 是   | 无静态默认；省略语义见组件/接口 | 仅ENTERPRISE_DEFAULT_ZERO非空，其他kind为null。                                                                                                                                                            | 无额外格式限制；仍遵守所属组件业务规则                                                  |
| `official_reference`  | [BuiltinPricingTemplate](#schema-builtinpricingtemplate) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | 有catalog_price_version_id必须非空且ID一致，包括后续改价继承的旧参考；无参考为null。                                                                                                                       | 无额外格式限制；仍遵守所属组件业务规则                                                  |

未声明字段：拒绝（`additionalProperties=false`）。

<a id="schema-pricingpreparation"></a>

### PricingPreparation

创建/导入前只读价格准备。先验模型WRITE及实例范围；真实计量集合非空才需价格READ，无计量项可返回NOT_APPLICABLE及非秘密版本供null创建。不预留、不产生模型/价格/命令、不请求供应商。保存重新校验当前权限和事实。

| 字段                       | 类型/组件                                                       | 必填 | 可空 | 默认/省略                       | 字段说明                                                                                                                                                                                                                                                                                              | 约束                                                                                             |
| -------------------------- | --------------------------------------------------------------- | ---- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `provider_id`              | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本次可管理的供应商实例UUID。                                                                                                                                                                                                                                                                          | format="uuid"                                                                                    |
| `provider_version`         | integer                                                         | 是   | 否   | 无静态默认；省略语义见组件/接口 | 准备时供应商实例版本；创建/导入回传expected_provider_version。                                                                                                                                                                                                                                        | minimum=1                                                                                        |
| `model_id_at_provider`     | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 规范化上游模型ID/部署名；不凭部署名推断官方型号。                                                                                                                                                                                                                                                     | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `catalog_binding`          | [CatalogBinding](#schema-catalogbinding)                        | 是   | 否   | 无静态默认；省略语义见组件/接口 | 实例固定模板批次及可信型号/选中官方参考的完整关联；未匹配型号时model/price ID为null。                                                                                                                                                                                                                 | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `metric_specs`             | array&lt;[MetricSpec](#schema-metricspec)&gt;                   | 是   | 否   | 无静态默认；省略语义见组件/接口 | 所选已适配调用接口的完整计量指标全集及显示单位；尚无已识别计量规格时为空，不造request指标或阻止原PRD允许的手工创建。调用协议不支持与无计量规格分开处理。                                                                                                                                              | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `billing_currency`         | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 当前总部内部币种；未配置为CNY，不是官方参考币种。                                                                                                                                                                                                                                                     | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `currency_source`          | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 内部币种来源。                                                                                                                                                                                                                                                                                        | enum=["HEADQUARTERS", "DEFAULT_CNY"]                                                             |
| `billing_time_zone`        | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版内部计费时区固定Asia/Shanghai。                                                                                                                                                                                                                                                                   | const="Asia/Shanghai"                                                                            |
| `time_zone_source`         | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 本版不新增系统时区设置。                                                                                                                                                                                                                                                                              | enum=["DEFAULT_ASIA_SHANGHAI"]                                                                   |
| `reference_state`          | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 官方参考事实：AVAILABLE有可表达官方参考且适用已知指标；PRICE_UNAVAILABLE无法获取定价；NO_PUBLIC_PRICE无公开单价；UNSUPPORTED_RULE复杂或不完整规则。metric_specs为空是无可配置计量项，不能借本状态伪造免费单价。 NOT_APPLICABLE仅服务端确定metric_specs=[]，无需准备价格参考；不是无法获取定价或免费。 | enum=["AVAILABLE", "PRICE_UNAVAILABLE", "NO_PUBLIC_PRICE", "UNSUPPORTED_RULE", "NOT_APPLICABLE"] |
| `official_reference`       | [BuiltinPricingTemplate](#schema-builtinpricingtemplate) / null | 是   | 是   | 无静态默认；省略语义见组件/接口 | AVAILABLE非空；NOT_APPLICABLE/其他状态为null。NOT_APPLICABLE仅表示实际没有计量规格，不读取/泄露价格参考；无价原因不能来自权限隐藏。                                                                                                                                                                   | 无额外格式限制；仍遵守所属组件业务规则                                                           |
| `prefill_origin`           | string                                                          | 是   | 否   | 无静态默认；省略语义见组件/接口 | 仅说明待确认表单建议来源，不代表生效；metric_specs为空或参考规则不支持时NONE，不能自动补0或构造指标。                                                                                                                                                                                                 | enum=["OFFICIAL_NUMERIC_REFERENCE", "ENTERPRISE_DEFAULT_ZERO", "NONE"]                           |
| `internal_pricing_prefill` | [PricingInput](#schema-pricinginput) / null                     | 是   | 是   | 无静态默认；省略语义见组件/接口 | 有metric且AVAILABLE：原币官方数字预填至内部币种，不换汇；有metric且真实缺价：完整FIXED全指标0；UNSUPPORTED_RULE或metric_specs为空：null。确无metric时创建显式pricing=null，不建价版本。 NOT_APPLICABLE时始终null，调用方不需要pricing:READ即可继续原手工流程。                                        | 无额外格式限制；仍遵守所属组件业务规则                                                           |

未声明字段：拒绝（`additionalProperties=false`）。

## 5. 条件必填、空值和省略的补充规则

| 组件/字段                 | 明确语义                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ProviderCreate            | 无 expected_version；name/template_key/template_version_id/base_url/security_level/public_config 必填；notes 省略为 null，balance_config 省略则余额 NONE；秘密按模板条件必填。                                                                                                    |
| ProviderUpdate            | expected_version及template_version_id必填；基础配置完整替换；notes 省略保持、null 清空；balance_config 省略保持；secrets 省略/空字符串保留，clear_secret_fields 明确清除；必需秘密清除且无替换返回 422。                                                                          |
| ModelCreate               | 基础四项必填；其余元信息按字段默认；health 默认关闭/360；initial_grants 默认空；pricing 省略尝试已核实且币种相符的内置价，否则未定价，不填假零价。                                                                                                                                |
| ModelUpdate               | 至少提交 base/grants/pricing/health 一域；base 必须 DRAFT 和 expected_base_version；health 需 expected_health_config_version；授权和价格自带版本；只提交版本不含业务域 422。                                                                                                      |
| ModelUpdate.base          | 完整基础表单；缺可选模态/标签/自定义接口清为空，缺可选上下文/说明清为 null；不提交 base 才表示整个基础域不变。                                                                                                                                                                    |
| 自定义接口 id             | 创建条目时省略或 null，由后端分配；更新时既有条目带 id，必须属于本模型；不得传其他模型 ID。                                                                                                                                                                                       |
| 标准调用接口              | R03已批准标准或已适配自定义合计至少一项；标准集合可为空，两者不能皆空。自定义路径匹配不到适配协议时明确拒绝，不猜协议、不要求用户写脚本。                                                                                                                                         |
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

| 场景           | 请求及响应规则                                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新建供应商     | P01取当前批次；P03提交准确template_version_id+template_key。当前批次已变化且该版本不再允许新绑定时409 CATALOG_CHANGED，保留草稿重新读取，不静默按新规则保存。                                                     |
| 编辑已有供应商 | 先P04取原绑定，再P01?provider_id读取旧规格；P05普通编辑回传原ID，目录发布不影响。通过既有模板选择明确改选当前模板版本（可同key）才改绑定；无新升级按钮，不自动复验/下架。                                         |
| 模型目录读取   | M08提供provider_id时固定该实例模板批次；响应带catalog_release_id/catalog_revision，续页回传批次。无provider时默认当前，明确历史批次只读不授予新绑定资格。                                                         |
| 发现与导入     | D01首次固定配置/模板/目录批次；D05和D02从快照读取，续页和幂等恢复不重取current。显式型号ID与服务器候选一致；手工无选择首次受理固定可信匹配或null。                                                                |
| 模型来源       | catalog_model_version_id表示实际采用来源，不代表已通过检测或当前仍适配。DRAFT基础改目标须重核或清除，目录发布/供应商改绑不自动回写旧模型元信息。                                                                  |
| 价格参考输入   | PricingInput.catalog_price_version_id省略：R02/M05继承当前参考，无旧价/M03为null；显式null清除。保留同当前价旧参考允许历史批次；改选另一ID须实例固定批次及可信型号匹配。保存始终ENTERPRISE_CUSTOM，无可写source。 |
| 创建价格确认   | M13只准备官方原币参考/内部数字建议；M03/D02有metric时显式提交完整pricing，真实缺价预填0后由管理员保存确认。确无metric允许pricing=null且不建价格版本；目录不自动覆盖既有BUILT_IN或企业自定义价。                   |
| 历史关联       | CatalogBinding五键同批一致；template_catalog_binding、model_catalog_binding和价格catalog_binding分别保存，允许各自历史批次不同。费用和任务仍完整自持事实，不JOIN当前目录重释。                                    |
| 目录并发与幂等 | 首次命令受理固化catalog_context；同key重放、逐项恢复、后台发送不得重新解析当前发布指针。CATALOG_CHANGED为409，CATALOG_INCOMPATIBLE为422，CATALOG_UNAVAILABLE为503；均不得自动换版本重发。                         |

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

| 阶段/条件    | 契约                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 准备         | M13先需models:WRITE及实例范围；真实metric非空才需pricing:READ，确空走NOT_APPLICABLE；传provider_id、上游ID、所选标准/自定义接口及可选可信目录型号。解析已适配metric全集；纯手工无目录也必须可解析，未知调用协议拒绝；调用已适配但无计量规格时metric_specs=[]，不造request单价。                                                                                                     |
| 有官方参考   | 显示原币原单位/官方来源；internal_pricing_prefill仅借用数值，currency采用预算币种缺省CNY。管理员可调整并在现创建/导入表单保存完整内部price；不是换汇，不承诺相同购买力或复刻官方账单。官方复杂规则/参考指标不完整不能自动选最低档或填0。                                                                                                                                            |
| 无价默认免费 | 仅服务端确认存在非空计量指标且PRICE_UNAVAILABLE/NO_PUBLIC_PRICE时准备完整FIXED全指标0；管理员仍在创建/导入保存中提交完整pricing。缺权限导致HIDDEN/null不能转为免费，复杂规则UNSUPPORTED_RULE不预填，可明确配置受支持的内部规则。                                                                                                                                                    |
| 首次保存     | M03及D02每个待创建项pricing键必填：有指标为完整对象且expected_price_version=0；仅服务端确无指标可null，不建价格版本并保持UNPRICED；expected_provider_version必填。有官方参考需带准确catalog_price_version_id；没有参考显式null。缺字段422；确无计量规格是原PRD允许的无价创建，不静默补价。提交价格对象需要pricing:WRITE，确无指标null分支不扩大价格权限，不自动授予READ/WRITE权限。 |
| 并发         | PricingInput.currency必填，是已展示的预算币种断言。保存币种不同409 BILLING_CURRENCY_CHANGED，实例版本不同409 VERSION_CONFLICT；刷新准备并让管理员确认，禁止原CNY数字自动当USD。目录选择固定，保存重新验可信绑定，准备不发预留票据。                                                                                                                                                 |
| 批量恢复     | D02先记录固定上下文，逐项事务；未执行项遇实例/币种变化安全REJECTED，已提交项不回滚不重算。重放同命令读取既有结果，不改用最新目录/币种解释已接受数值。                                                                                                                                                                                                                               |
| 来源         | 首次已有非空指标+真实缺价+无官方参考+FIXED全指标0才BUILT_IN/ENTERPRISE_DEFAULT_ZERO；首次带官方参考为ENTERPRISE_CUSTOM/OFFICIAL_PREFILL_CONFIRMED；其他/后续改价为ENTERPRISE_CUSTOM/ENTERPRISE_CONFIGURED。source/kind均只读，不接受confirmed或客户端声明已二次确认。                                                                                                               |
| 历史         | PricingBasis四键必填；默认0理由非空且reference=null，其他理由null；存在catalog_price_version_id时完整official_reference必须非空且ID相同。企业数字、币种、规则与官方原币参考分别冻结，后续目录/预算/模型删除不能改检测费用快照。                                                                                                                                                     |
| 未知事实     | 已知内部单价0不自动补齐缺失usage、未知发送结果或计算溢出；这些仍以UNKNOWN/null事实记录，不把未知费用改为已算0。                                                                                                                                                                                                                                                                     |

BILLING_CURRENCY_CHANGED归409（预算配置在读写间变化），PRICE_RULE_INVALID/METRIC_UNSUPPORTED归422，M13未知接口CUSTOM_API_UNSUPPORTED归422；对象越界与不存在统一404。模型调用ID输入须在框架字段长度校验之前按固定Unicode White_Space 25码点规范化；x-normalize-before-validation标注此要求，规范化后1～128且拒绝U+0000。

计量边界：M13不是新准入门槛。原PRD允许的非内置手工模型若暂无已识别计量项，metric_specs=[]、reference_state=NOT_APPLICABLE、prefill_origin=NONE、internal_pricing_prefill=null，价格入口隐藏；创建/导入显式pricing=null，仅服务端验证真实无指标才接受，不生成伪免费价。已识别指标时null拒绝，必须管理员确认完整价。D03后改接口导致PROFILE_MISMATCH仍按既有规则执行检测并记录UNPRICED；不自动改价或新增阻断。

M13条件权限：先校验models:WRITE和供应商模型用途范围、解析非秘密计量规格。metric_specs=[]时返回NOT_APPLICABLE、reference/prefill=null、prefill_origin=NONE及provider_version，不读取或泄露任何官方/企业价，不要求pricing:READ/WRITE；用户仍可显式pricing=null保存原PRD允许的手工模型。metric非空才要求pricing:READ，403不可冒充空集合/缺价，保存价对象仍需pricing:WRITE。NOT_APPLICABLE必须空指标且无预填；其他reference_state必须非空指标。PricingBasis与source/参考是否存在的条件已编码OpenAPI组合约束；全部0、相同目录ID及指标完整性仍由保存事务校验。
