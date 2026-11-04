import type { Engine, Method } from '@/api/modules/security'

export const dataPolicyNames: [string, string][] = [
  [
    '非受控终端文件上传与敏感数据全面阻断',
    'Block file uploads and sensitive data on unmanaged terminals',
  ],
  [
    '生产值班非工作时段高敏阻断与一般数据告警',
    'Block high sensitivity data outside production duty hours',
  ],
  [
    '研发/生产高敏网段源代码及生产数据外发阻断',
    'Block source code and production data from sensitive subnets',
  ],
  [
    '指定 AI 客户端源代码及敏感文件外发控制',
    'Control source code and sensitive files from selected AI clients',
  ],
  ['互联网模型关键及核心数据阻断', 'Block important and core data for internet models'],
  [
    '可信云模型核心数据阻断与关键数据脱敏',
    'Block core and mask important data for trusted cloud models',
  ],
  [
    '私有模型凭证阻断与敏感数据审计',
    'Block credentials and audit sensitive data for private models',
  ],
]
export const dataPolicyDescriptions: [string, string][] = [
  [
    '非受控终端上传文件、凭证及一般级以上敏感数据时阻断。默认禁用，请先配置终端识别与文件样本库。',
    'Block file uploads, credentials and general or higher sensitivity data from unmanaged terminals. Disabled until terminal recognition and file samples are configured.',
  ],
  [
    '生产/运维值班组访问互联网模型时，按企业值班时间阻断凭证与高敏数据、脱敏个人信息、告警一般数据。默认禁用，请核对值班时间。',
    'For the production/operations duty group using internet models, block credentials and highly sensitive data, mask personal information and alert on general data. Disabled pending duty-time review.',
  ],
  [
    '研发/生产高敏网段访问互联网模型时，阻断文件、凭证、源代码与高敏数据，脱敏个人信息。默认禁用，请配置企业网段。',
    'Block files, credentials, source code and highly sensitive data from sensitive R&D/production subnets using internet models; mask personal information. Disabled pending subnet configuration.',
  ],
  [
    '指定 AI 客户端访问互联网模型时，阻断源代码、文件和高敏数据，脱敏个人信息。默认禁用，请配置客户端。',
    'Block source code, files and highly sensitive data from selected AI clients using internet models; mask personal information. Disabled pending client configuration.',
  ],
  [
    '阻断凭证、关键和核心数据；脱敏个人信息；单个 PDF/XLSX/DOCX 文件不小于 20 MB 时告警。观察模式只记录事件。',
    'Block credentials, important and core data; mask personal information; alert on individual PDF/XLSX/DOCX files at least 20 MB. Observation mode records events only.',
  ],
  [
    '阻断凭证和核心数据；脱敏关键数据与个人信息；一般数据和指定格式文件分别告警。观察模式只记录事件。',
    'Block credentials and core data; mask important data and personal information; alert separately on general data and selected file formats. Observation mode records events only.',
  ],
  [
    '阻断凭证及样本库文件；一般级以上敏感数据与文件上传分别告警。观察模式只记录事件。',
    'Block credentials and sample-library files; alert separately on general or higher sensitivity data and file uploads. Observation mode records events only.',
  ],
]
export const detectionPolicyNames: [string, string][] = [
  ['私有模型安全检测', 'Private model security detection'],
  ['可信云模型安全检测', 'Trusted cloud model security detection'],
  ['互联网模型安全检测', 'Internet model security detection'],
]
export interface RuleSeed {
  names: [string, string]
  category: string
  sub: string
  method: Method[]
  pattern?: string
  engine?: Engine
  direction?: 'INPUT' | 'OUTPUT' | 'BOTH'
}
export const fieldSeeds: RuleSeed[] = [
  {
    names: ['手机号', 'Mobile phone number'],
    category: 'EMPLOYEE',
    sub: 'PII',
    method: ['REGEX'],
    pattern: '1[3-9][0-9]{9}',
  },
  {
    names: ['身份证号', 'National ID number'],
    category: 'EMPLOYEE',
    sub: 'PII',
    method: ['REGEX'],
    pattern: '[1-9][0-9]{16}[0-9Xx]',
  },
  {
    names: ['护照号', 'Passport number'],
    category: 'EMPLOYEE',
    sub: 'PII',
    method: ['REGEX'],
    pattern: '[EeGg][0-9]{8}',
  },
  {
    names: ['港澳台通行证号', 'Travel permit number'],
    category: 'EMPLOYEE',
    sub: 'PII',
    method: ['REGEX'],
    pattern: '[HMhm][0-9]{8,10}',
  },
  {
    names: ['驾驶证号', 'Driving licence number'],
    category: 'EMPLOYEE',
    sub: 'PII',
    method: ['REGEX'],
    pattern: '[0-9]{18}',
  },
  {
    names: ['军官证号', 'Military ID number'],
    category: 'EMPLOYEE',
    sub: 'PII',
    method: ['REGEX'],
    pattern: '[军海空][字第]?[0-9]{6,10}',
  },
  {
    names: ['社保卡号', 'Social security card number'],
    category: 'EMPLOYEE',
    sub: 'PII',
    method: ['REGEX'],
    pattern: '[A-Z][0-9]{8}',
  },
  {
    names: ['居住地址', 'Residential address'],
    category: 'EMPLOYEE',
    sub: 'PII',
    method: ['REGEX'],
    pattern: '[^\\s]{2,20}(?:省|市|区|路|街)[^\\s]{2,40}',
  },
  {
    names: ['电子邮箱', 'Email address'],
    category: 'CUSTOMER',
    sub: 'PII',
    method: ['REGEX'],
    pattern: '[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,100}\\.[A-Za-z]{2,20}',
  },
  {
    names: ['银行卡号', 'Bank card number'],
    category: 'CUSTOMER',
    sub: 'FINANCE',
    method: ['REGEX'],
    pattern: '[0-9]{16,19}',
  },
  {
    names: ['银行账户', 'Bank account'],
    category: 'ENTERPRISE',
    sub: 'FINANCE',
    method: ['REGEX'],
    pattern: '[0-9]{12,20}',
  },
  {
    names: ['统一社会信用代码', 'Unified social credit code'],
    category: 'ENTERPRISE',
    sub: 'FINANCE',
    method: ['REGEX'],
    pattern: '[0-9A-HJ-NPQRTUWXY]{18}',
  },
  {
    names: ['内网 IP 地址', 'Private IP address'],
    category: 'IT',
    sub: 'INTERNAL',
    method: ['REGEX'],
    pattern: '(?:10|192\\.168)\\.[0-9.]{3,12}',
  },
  {
    names: ['阿里云 AccessKey', 'Alibaba Cloud AccessKey'],
    category: 'IT',
    sub: 'CREDENTIAL',
    method: ['REGEX'],
    pattern: 'LTAI[A-Za-z0-9]{12,24}',
  },
  {
    names: ['腾讯云 SecretId', 'Tencent Cloud SecretId'],
    category: 'IT',
    sub: 'CREDENTIAL',
    method: ['REGEX'],
    pattern: 'AKID[A-Za-z0-9]{20,40}',
  },
  {
    names: ['AWS Access Key', 'AWS Access Key'],
    category: 'IT',
    sub: 'CREDENTIAL',
    method: ['REGEX'],
    pattern: 'AKIA[A-Z0-9]{16}',
  },
  {
    names: ['OpenAI API Key', 'OpenAI API Key'],
    category: 'IT',
    sub: 'CREDENTIAL',
    method: ['REGEX'],
    pattern: 'sk-[A-Za-z0-9_-]{20,100}',
  },
  {
    names: ['环境变量密钥（.env）', 'Environment variable secrets (.env)'],
    category: 'IT',
    sub: 'CREDENTIAL',
    method: ['REGEX'],
    pattern: '(?:API_KEY|SECRET_KEY)=[^\\s]{4,100}',
  },
  {
    names: ['密码赋值模式', 'Password assignments'],
    category: 'IT',
    sub: 'CREDENTIAL',
    method: ['REGEX'],
    pattern: '(?:password|passwd|pwd)\\s*[:=]\\s*[^\\s]{4,100}',
  },
  {
    names: ['数据库连接字符串', 'Database connection string'],
    category: 'IT',
    sub: 'CREDENTIAL',
    method: ['REGEX'],
    pattern: '(?:mysql|postgres|mongodb)://[^\\s]{5,200}',
  },
  {
    names: ['私钥内容（PEM）', 'Private key content (PEM)'],
    category: 'IT',
    sub: 'CREDENTIAL',
    method: ['KEYWORD'],
  },
  {
    names: ['访问令牌', 'Access tokens'],
    category: 'IT',
    sub: 'CREDENTIAL',
    method: ['REGEX'],
    pattern: 'Bearer [A-Za-z0-9._-]{20,200}',
  },
  {
    names: ['代码文件特征', 'Source code features'],
    category: 'PRODUCT',
    sub: 'SOURCE_CODE',
    method: ['REGEX'],
    pattern: '(?:function|class|import) [A-Za-z_]{1,50}',
  },
  {
    names: ['数据库表结构', 'Database schema'],
    category: 'PRODUCT',
    sub: 'SOURCE_CODE',
    method: ['KEYWORD'],
  },
  {
    names: ['源代码片段', 'Source code fragments'],
    category: 'PRODUCT',
    sub: 'SOURCE_CODE',
    method: ['REGEX'],
    pattern: '(?:def|public|private|const|let) [A-Za-z_]{1,50}',
  },
  {
    names: ['配置文件特征', 'Configuration file features'],
    category: 'PRODUCT',
    sub: 'SOURCE_CODE',
    method: ['KEYWORD'],
  },
]
export const securityRuleSeeds: RuleSeed[] = [
  ...[
    ['直接提示词注入', 'Direct prompt injection', 'DIRECT_INJECTION', 'KEYWORD', 'INPUT'],
    ['间接提示词注入', 'Indirect prompt injection', 'INDIRECT_INJECTION', 'CLASSIFIER', 'INPUT'],
    ['多轮渐进式注入', 'Multi-turn prompt injection', 'MULTI_TURN', 'LLM_JUDGE', 'INPUT'],
    ['System Prompt 提取攻击', 'System prompt extraction', 'PROMPT_EXTRACTION', 'KEYWORD', 'INPUT'],
    ['System Prompt 泄露', 'System prompt leakage', 'PROMPT_LEAK', 'LLM_JUDGE', 'OUTPUT'],
  ].map((x) => ({
    names: [x[0]!, x[1]!] as [string, string],
    category: 'PROMPT_INJECTION',
    sub: x[2]!,
    method: [x[3] as Method],
    engine: 'PROMPT_INJECTION' as Engine,
    direction: x[4] as 'INPUT' | 'OUTPUT',
  })),
  ...[
    ['角色扮演越狱', 'Role-playing jailbreak'],
    ['编码与多语言绕过', 'Encoding and multilingual bypass'],
    ['多步越狱', 'Multi-step jailbreak'],
    ['逻辑诱导越狱', 'Logical persuasion jailbreak'],
    ['对抗性后缀攻击', 'Adversarial suffix attack'],
    ['越狱成功输出验证', 'Jailbreak output verification'],
  ].map((names, i) => ({
    names: names as [string, string],
    category: 'JAILBREAK',
    sub: `JAILBREAK_${i}`,
    method: [i === 2 ? 'LLM_JUDGE' : 'CLASSIFIER'] as Method[],
    engine: 'JAILBREAK' as Engine,
    direction: i === 5 ? ('OUTPUT' as const) : ('INPUT' as const),
  })),
  ...[
    ['暴力内容', 'Violent content'],
    ['色情内容', 'Sexual content'],
    ['涉政敏感内容', 'Politically sensitive content'],
    ['歧视与仇恨言论', 'Discrimination and hate speech'],
    ['恐怖主义内容', 'Terrorist content'],
    ['违法犯罪内容', 'Illegal content'],
    ['恶意代码与攻击脚本', 'Malicious code and attack scripts'],
    ['诈骗与钓鱼内容', 'Fraud and phishing'],
    ['不安全输出格式', 'Unsafe output format'],
  ].map((names, i) => ({
    names: names as [string, string],
    category: 'CONTENT_COMPLIANCE',
    sub: `COMPLIANCE_${i}`,
    method: ['CLASSIFIER'] as Method[],
    engine: 'CONTENT_COMPLIANCE' as Engine,
    direction: i === 8 ? ('OUTPUT' as const) : ('BOTH' as const),
  })),
  ...[
    ['恶意 IP', 'Malicious IP'],
    ['恶意域名', 'Malicious domain'],
    ['恶意 URL', 'Malicious URL'],
  ].map((names, i) => ({
    names: names as [string, string],
    category: 'MALICIOUS_IOC',
    sub: ['IP', 'DOMAIN', 'URL'][i]!,
    method: ['THREAT_INTELLIGENCE'] as Method[],
    engine: 'MALICIOUS_IOC' as Engine,
    direction: 'BOTH' as const,
  })),
]
export const seedMessages: Record<string, [string, string]> = {
  ...Object.fromEntries(dataPolicyNames.map((x, i) => [`data${i}`, x])),
  ...Object.fromEntries(dataPolicyDescriptions.map((x, i) => [`data${i}Description`, x])),
  ...Object.fromEntries(detectionPolicyNames.map((x, i) => [`detection${i}`, x])),
  detection0Description: [
    '私有部署模型由企业自主管理，需关注提示词注入、恶意 IOC、模型越狱和内容合规等风险。请求和响应按适用规则检测；高危命中时阻断，中危和低危命中时告警。',
    'For enterprise-managed private models, detect prompt injection, malicious IOC, jailbreak and content compliance risks in applicable requests and responses. Block high-risk matches and alert on medium- and low-risk matches.',
  ],
  detection1Description: [
    '可信云模型已通过企业安全评估，企业侧重点关注提示词注入和恶意 IOC 等智能体风险。请求和响应按适用规则检测，命中时告警。',
    'For trusted cloud models approved by enterprise security review, detect prompt injection and malicious IOC in applicable requests and responses and alert on matches.',
  ],
  detection2Description: [
    '互联网模型由第三方运营，需关注提示词注入利用智能体执行非预期操作，以及恶意 IOC 被自动化流程调用的风险。请求和响应按适用规则检测，命中时告警。',
    'For third-party internet models, detect prompt injection leading to unintended agent actions and malicious IOC used in automated workflows. Inspect applicable requests and responses and alert on matches.',
  ],
  ...Object.fromEntries(fieldSeeds.map((x, i) => [`field${i}`, x.names])),
  ...Object.fromEntries(securityRuleSeeds.map((x, i) => [`securityRule${i}`, x.names])),
  auditDefault: ['全局默认审计策略', 'Global default audit policy'],
  auditDefaultDescription: [
    '未命中其他审计策略时，按所选字段留存交互。',
    'When no other audit policy matches, retain the selected interaction fields.',
  ],
}
