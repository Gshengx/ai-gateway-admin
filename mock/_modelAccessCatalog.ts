import { modelFixtures, type ModelFixture } from './_modelAccessFixtures'

type CatalogModel = Pick<
  ModelFixture,
  | 'template_key'
  | 'model_id_at_provider'
  | 'input_modalities'
  | 'output_modalities'
  | 'supported_invocation_apis'
  | 'context_window'
  | 'max_output_tokens'
  | 'tags'
  | 'description'
>

// Simulated adapter presets, not official capability or upstream availability claims.
// Catalog rows do not create managed models or change provider model counts.
const additionalModels: CatalogModel[] = [
  {
    template_key: 'openai',
    model_id_at_provider: 'gpt-4.1-mini',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    supported_invocation_apis: ['CHAT_COMPLETIONS', 'RESPONSES'],
    context_window: 1047576,
    max_output_tokens: 32768,
    tags: ['STREAMING', 'TOOL_CALLING', 'VISION'],
    description: '轻量多模态对话适配样例',
  },
  {
    template_key: 'openai',
    model_id_at_provider: 'gpt-image-1',
    input_modalities: ['text', 'image'],
    output_modalities: ['image'],
    supported_invocation_apis: ['IMAGE_GENERATIONS'],
    context_window: null,
    max_output_tokens: null,
    tags: [],
    description: '图像生成与编辑适配样例',
  },
  {
    template_key: 'openai',
    model_id_at_provider: 'whisper-1',
    input_modalities: ['audio'],
    output_modalities: ['text'],
    supported_invocation_apis: ['AUDIO'],
    context_window: null,
    max_output_tokens: null,
    tags: [],
    description: '语音转写适配样例',
  },
  {
    template_key: 'bailian',
    model_id_at_provider: 'qwen-turbo',
    input_modalities: ['text'],
    output_modalities: ['text'],
    supported_invocation_apis: ['CHAT_COMPLETIONS'],
    context_window: 131072,
    max_output_tokens: 8192,
    tags: ['STREAMING', 'TOOL_CALLING'],
    description: '中文轻量对话适配样例',
  },
  {
    template_key: 'volcengine',
    model_id_at_provider: 'doubao-lite-32k',
    input_modalities: ['text'],
    output_modalities: ['text'],
    supported_invocation_apis: ['CHAT_COMPLETIONS'],
    context_window: 32768,
    max_output_tokens: 4096,
    tags: ['STREAMING'],
    description: '轻量推理接入适配样例',
  },
  {
    template_key: 'compatible',
    model_id_at_provider: 'company-assistant-8k',
    input_modalities: ['text'],
    output_modalities: ['text'],
    supported_invocation_apis: ['CHAT_COMPLETIONS'],
    context_window: 8192,
    max_output_tokens: 2048,
    tags: ['STREAMING'],
    description: '企业内网助手适配样例',
  },
  {
    template_key: 'openrouter',
    model_id_at_provider: 'google/gemini-2.5-flash',
    input_modalities: ['text', 'image', 'audio', 'video'],
    output_modalities: ['text'],
    supported_invocation_apis: ['CHAT_COMPLETIONS'],
    context_window: 1048576,
    max_output_tokens: 65536,
    tags: ['STREAMING', 'TOOL_CALLING', 'VISION'],
    description: '聚合网关多模态适配样例',
  },
  {
    template_key: 'anthropic',
    model_id_at_provider: 'claude-sonnet-4',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    supported_invocation_apis: ['MESSAGES'],
    context_window: 200000,
    max_output_tokens: 64000,
    tags: ['STREAMING', 'TOOL_CALLING', 'VISION'],
    description: 'Messages 协议多模态适配样例',
  },
  {
    template_key: 'google',
    model_id_at_provider: 'gemini-2.5-flash',
    input_modalities: ['text', 'image', 'audio', 'video'],
    output_modalities: ['text'],
    supported_invocation_apis: ['GENERATE_CONTENT'],
    context_window: 1048576,
    max_output_tokens: 65536,
    tags: ['STREAMING', 'TOOL_CALLING', 'VISION'],
    description: 'Generate Content 协议适配样例',
  },
]

export const modelCatalog: CatalogModel[] = [...modelFixtures, ...additionalModels]
