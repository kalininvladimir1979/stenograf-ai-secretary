import {test} from 'node:test';import assert from 'node:assert/strict';
import {isMissingOpenAiKey,missingOpenAiKeyMessage} from '../../web/src/meeting-errors.js';
test('missing key errors are explained, provider or content failures are not mislabelled',()=>{
 for(const error of ['Ожидает ключа: добавьте OpenAI в админке.','Для расшифровки добавьте OpenAI API-ключ в разделе «Подключения» админ-панели организации.','Для расшифровки в демо-пространстве сохраните ключ разработчика OpenAI в Dev-консоли или добавьте ключ организации.'])assert.equal(isMissingOpenAiKey(error),true);
 for(const error of ['Incorrect API key provided','AI вернул неполный анализ','Облако вернуло HTTP 429',null])assert.equal(isMissingOpenAiKey(error),false);
 assert.equal(isMissingOpenAiKey(null,'Ожидает ключа'),true);
 assert.match(missingOpenAiKeyMessage(true),/В демо-режиме.*OpenAI API Key.*админки/);assert.doesNotMatch(missingOpenAiKeyMessage(false),/демо-режиме/);
});
