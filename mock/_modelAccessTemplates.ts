import type { Template } from '../src/api/modules/modelAccess'
const field = (key: string, label = key, secret = true, required = true) => ({
  key,
  label,
  secret,
  required,
})
const apiKey = [field('api_key', 'API Key')]
export const templates: Template[] = [
  ['openai', 'OpenAI', 'https://api.openai.com/v1'],
  ['anthropic', 'Anthropic', 'https://api.anthropic.com/v1'],
  ['google', 'Google AI', 'https://generativelanguage.googleapis.com/v1beta'],
  ['qianwen', '通义千问', 'https://maas.qianwenaiapi.com/compatible-mode/v1'],
  ['minimax', 'MiniMax', 'https://api.minimax.io/v1'],
  ['deepseek', 'DeepSeek', 'https://api.deepseek.com/v1'],
  ['zhipu', '智谱 AI', 'https://open.bigmodel.cn/api/paas/v4'],
  ['moonshot', '月之暗面 Kimi', 'https://api.moonshot.cn/v1'],
  ['mistral', 'Mistral AI', 'https://api.mistral.ai/v1'],
  ['azure', 'Azure AI', ''],
  ['bedrock', 'AWS Bedrock', ''],
  ['vertex', 'Google Vertex AI', 'https://aiplatform.googleapis.com'],
  ['bailian', '阿里云百炼', ''],
  ['qianfan', '百度智能云千帆', 'https://qianfan.baidubce.com/v2'],
  ['volcengine', '火山引擎方舟', 'https://ark.cn-beijing.volces.com/api/v3'],
  ['hunyuan', '腾讯混元', ''],
  ['wangsu', '网宿 AI', ''],
  ['siliconflow', '硅基流动', 'https://api.siliconflow.cn/v1'],
  ['openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1'],
  ['compatible', 'OpenAI兼容', ''],
  ['ollama', 'Ollama', ''],
].map(([template_key, name, base_url]) => ({
  template_key: template_key!,
  name: name!,
  base_url: base_url!,
  fields: apiKey.map((x) => ({ ...x })),
}))
for (const t of templates) {
  if (t.template_key === 'anthropic')
    t.fields.push({ ...field('api_version', 'API Version', false), default_value: '2023-06-01' })
  if (t.template_key === 'azure')
    t.fields = [
      field('tenant_id', 'Tenant ID', false),
      field('client_id', 'Client ID', false),
      field('client_secret', 'Client Secret'),
      field('deployment', 'Deployment', false),
      field('api_version', 'API Version', false),
    ]
  if (t.template_key === 'vertex')
    t.fields = [
      field('project_id', 'Project ID', false),
      field('region', 'Region', false),
      field('service_account_json', 'Service Account JSON'),
    ]
  if (t.template_key === 'qianfan') t.fields.push(field('secret_key', 'Secret Key'))
  if (t.template_key === 'hunyuan')
    t.fields = [
      field('secret_id', 'Secret ID'),
      field('secret_key', 'Secret Key'),
      field('region', 'Region', false),
    ]
  if (t.template_key === 'volcengine') t.fields.push(field('region', 'Region', false, false))
  if (t.template_key === 'openrouter')
    t.fields.push(field('management_api_key', 'Management API Key', true, false))
  if (['ollama', 'compatible'].includes(t.template_key)) t.fields[0]!.required = false
}
