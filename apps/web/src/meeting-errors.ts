export function isMissingOpenAiKey(error?:string|null,stage?:string|null){
 return /ожидает ключа|ключ (?:OpenAI|платформы).*(?:не настроен|не сохранён)|добавьте.*(?:OpenAI|API.?ключ)|для (?:расшифровки|распознавания).*ключ/i.test([error,stage].filter(Boolean).join(' '));
}
export function missingOpenAiKeyMessage(demo:boolean){return demo
 ? 'В демо-режиме для распознавания и AI-анализа необходимо ввести OpenAI API Key в настройках админки. После сохранения ключа повторите обработку встречи.'
 : 'Для распознавания и AI-анализа необходимо сохранить OpenAI API Key в настройках организации. После сохранения ключа повторите обработку встречи.';}
