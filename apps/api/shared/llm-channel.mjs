/**
 * Server-only client for the MULTiBOT paired LLM channel.
 *
 * The module is bundled with the API release so that production does not
 * depend on files outside the application directory.
 */
const RELAY_CAPABILITIES = "/api/v1/voice-relay/llm/capabilities";
const RELAY_PROVIDER = "/api/v1/voice-relay/llm/provider";
const GATEWAY_CAPABILITIES = "/api/v1/internal/llm/capabilities";
const GATEWAY_PROVIDER = "/api/v1/internal/llm/provider";

export class AiChannelError extends Error {
  constructor(message, { status = 503, code = "AI_CHANNEL_UNAVAILABLE", cause } = {}) {
    super(message, { cause });
    this.name = "AiChannelError";
    this.status = status;
    this.code = code;
  }
}

function safeUrl(raw, label) {
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { throw new AiChannelError(`${label}: некорректный URL`, { status: 500, code: "AI_CHANNEL_CONFIGURATION" }); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) throw new AiChannelError(`${label}: внешний шлюз должен использовать HTTPS`, { status: 500, code: "AI_CHANNEL_HTTPS_REQUIRED" });
  return url.toString().replace(/\/$/, "");
}

async function capabilities(route, signal) {
  const response = await fetch(route.base + route.capabilitiesPath, { headers: route.headers, signal });
  if (!response.ok) throw new AiChannelError(`Шлюз не подтвердил возможности (HTTP ${response.status})`, { status: response.status, code: "AI_CHANNEL_CAPABILITIES" });
  return response.json();
}

function routes(env) {
  const relayUrl = safeUrl(env.MULTIBOT_LLM_RELAY_URL || env.LLM_RELAY_URL, "VPS relay");
  const relayToken = env.MULTIBOT_LLM_RELAY_TOKEN || env.LLM_RELAY_TOKEN;
  const gatewayUrl = safeUrl(env.MULTIBOT_LLM_GATEWAY_INTERNAL_URL || env.LLM_GATEWAY_INTERNAL_URL, "Локальный LLM Gateway");
  const serviceToken = env.MULTIBOT_INTERNAL_SERVICE_TOKEN || env.INTERNAL_SERVICE_TOKEN;
  return [
    relayUrl && relayToken && { name: "vps-relay", base: relayUrl, capabilitiesPath: RELAY_CAPABILITIES, providerPath: RELAY_PROVIDER, headers: { "X-LLM-Relay-Token": relayToken } },
    gatewayUrl && serviceToken && { name: "local-gateway", base: gatewayUrl, capabilitiesPath: GATEWAY_CAPABILITIES, providerPath: GATEWAY_PROVIDER, headers: { "X-Service-Token": serviceToken } },
  ].filter(Boolean);
}

function providerErrorDetail(detail, status) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    const message = typeof detail.provider_message === "string" ? detail.provider_message.trim() : "";
    if (message) return message;
    const code = typeof detail.provider_code === "string" ? detail.provider_code : "";
    if (code) return `AI-провайдер вернул HTTP ${status} (${code})`;
  }
  return `AI-провайдер вернул HTTP ${status}`;
}

/** Preserves a Responses/image request without allowing arbitrary provider URLs. */
export async function rawProviderGenerate({ provider = "OpenAI", apiKey, model, payload, operation = "response", timeoutSeconds = 90, env = process.env }) {
  if (!apiKey || !model) throw new AiChannelError("Ключ владельца и модель обязательны", { status: 400, code: "AI_CHANNEL_INPUT" });
  // The deployed secretary is its own server-side egress. The browser never
  // receives a credential or calls OpenAI. Local installations use its private relay.
  if(env.SECRETARY_DEPLOYED==='true'&&provider==='OpenAI')return directOpenAi({apiKey,model,payload,operation,timeoutSeconds});
  if(env.SECRETARY_AI_RELAY_URL&&env.SECRETARY_AI_RELAY_TOKEN){
    const base=safeUrl(env.SECRETARY_AI_RELAY_URL,'СтеноГРАФ relay');
    let response;
    try{response=await fetch(base+'/internal/ai/provider',{method:'POST',headers:{'Content-Type':'application/json','x-secretary-relay-token':env.SECRETARY_AI_RELAY_TOKEN},body:JSON.stringify({provider,apiKey,model,payload,operation,timeoutSeconds}),signal:AbortSignal.timeout((timeoutSeconds+10)*1000)});}catch(e){throw new AiChannelError('Соединение с сервером обработки прервано'+(e.cause?.code?' ('+e.cause.code+')':''),{cause:e});}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new AiChannelError(data.error||`Сервер обработки вернул HTTP ${response.status}`,{status:response.status,code:'AI_PROVIDER_ERROR'});
    return {data,channel:'secretary-vps',provider,model,usage:data?.usage??null};
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5, Math.min(timeoutSeconds, 180)) * 1000 + 5_000);
  let lastError;
  try {
    for (const route of routes(env)) {
      try {
        const supported = await capabilities(route, controller.signal);
        const feature = operation === "image_generate" ? "openai_image_generation" : operation === "embeddings" ? "openai_embeddings" : operation === "transcription" ? "openai_transcription" : operation === "model_catalog" ? "openai_model_catalog" : "raw_provider_request";
        if (supported?.[feature] !== true || supported?.api_key_override !== true) continue;
        const response = await fetch(route.base + route.providerPath, {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", ...route.headers },
          body: JSON.stringify({ provider, api_key: apiKey, model, payload, operation:operation==='model_catalog'?'image_models':operation, timeout_seconds: timeoutSeconds }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status < 500 && response.status !== 413) throw new AiChannelError(providerErrorDetail(data?.detail, response.status), { status: response.status, code: "AI_PROVIDER_ERROR" });
          lastError = new AiChannelError(`Канал ${route.name} вернул HTTP ${response.status}`);
          continue;
        }
        return { data, channel: route.name, provider, model, usage: data?.usage ?? null };
      } catch (error) {
        if (error instanceof AiChannelError && error.code === "AI_PROVIDER_ERROR") throw error;
        lastError = error;
      }
    }
  } finally { clearTimeout(timer); }
  throw new AiChannelError("Ни VPS-relay, ни локальный LLM Gateway не доступны или не поддерживают этот запрос", { cause: lastError });
}

export async function directOpenAi({apiKey,model,payload,operation,timeoutSeconds=90}) {
  let endpoint='/responses',body,method='POST';const headers={Authorization:'Bearer '+apiKey};
  if(operation==='transcription'){
    endpoint='/audio/transcriptions';const bytes=Buffer.from(payload.file_b64||'','base64');
    if(!bytes.length||bytes.length>25000000)throw new AiChannelError('Недопустимый размер аудио',{status:400});
    const form=new FormData();form.append('model',model);form.append('file',new Blob([bytes],{type:payload.mime||'audio/mpeg'}),String(payload.filename||'audio.mp3').slice(0,120));body=form;
  }else{
    if(operation==='model_catalog'||operation==='image_models'){endpoint='/models';method='GET';}
    else if(operation==='image_generate'){endpoint='/images/generations';if(!model.startsWith('gpt-image-'))throw new AiChannelError('Недопустимая модель изображения',{status:400});}
    else if(operation!=='response')throw new AiChannelError('Операция не поддерживается',{status:400});
    if(method==='POST'){headers['Content-Type']='application/json';body=JSON.stringify({...payload,model});}
  }
  let response;
  try{response=await fetch('https://api.openai.com/v1'+endpoint,{method,headers,body,signal:AbortSignal.timeout(Math.min(180,Math.max(5,timeoutSeconds))*1000)});}catch(e){throw new AiChannelError('OpenAI: соединение прервано'+(e.cause?.code?' ('+e.cause.code+')':''),{cause:e});}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){let message=String(data.error?.message||`OpenAI вернул HTTP ${response.status}`).slice(0,500);message=message.split(apiKey).join('[скрыто]');throw new AiChannelError(message,{status:response.status,code:'AI_PROVIDER_ERROR'});}
  return {data,channel:'server-direct',provider:'OpenAI',model,usage:data.usage??null};
}
