/*
 * Map Historia — yapay zekâ (dil modeli) bağlantısı.
 *
 * Desteklenen sağlayıcılar:
 *   - gemini : Google Gemini API (generativelanguage.googleapis.com), API anahtarı Google AI Studio'dan alınır
 *   - openai : OpenAI uyumlu /chat/completions uç noktası (OpenAI, OpenRouter, yerel sunucular…)
 *   - off    : yapay zekâ kapalı; sohbet ve eylemler kural tabanlı yedek modda çalışır
 *
 * API anahtarı yalnızca oyuncunun tarayıcısında (localStorage) saklanır ve doğrudan sağlayıcıya gönderilir.
 */
(function (MH) {
  'use strict';

  const KEY = 'mapHistoria.llm.v1';
  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
  const DEFAULTS = { provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash', baseUrl: 'https://api.openai.com/v1' };
  const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
  const TIMEOUT_MS = 60000;

  let memory = null; // localStorage kullanılamıyorsa oturum boyunca bellekte tut

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      /* depolama kapalı */
    }
    return { ...DEFAULTS, ...(memory || {}) };
  }

  function save(settings) {
    const clean = { ...DEFAULTS, ...settings, apiKey: String(settings.apiKey || '').trim(), model: String(settings.model || '').trim() || DEFAULTS.model };
    memory = clean;
    try {
      localStorage.setItem(KEY, JSON.stringify(clean));
      return true;
    } catch {
      return false;
    }
  }

  function enabled(settings = load()) {
    return settings.provider !== 'off' && !!settings.apiKey;
  }

  function withTimeout(promiseFn) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), TIMEOUT_MS);
    return promiseFn(ctrl?.signal).finally(() => clearTimeout(timer));
  }

  async function readError(res) {
    let msg = 'HTTP ' + res.status;
    try {
      const body = await res.json();
      msg = body?.error?.message || body?.message || msg;
    } catch {
      /* gövde JSON değil */
    }
    if (res.status === 400 && /API key/i.test(msg)) return 'API anahtarı geçersiz.';
    if (res.status === 401 || res.status === 403) return 'API anahtarı reddedildi (' + msg + ').';
    if (res.status === 404) return 'Model bulunamadı: ayarlardan başka bir model seçin (' + msg + ').';
    if (res.status === 429) return 'Kota ya da hız sınırı aşıldı; biraz bekleyip yeniden deneyin.';
    return msg;
  }

  /**
   * Tek seferlik tamamlama.
   * messages: [{ role: 'user' | 'assistant', text }]
   * Dönüş: modelin metin yanıtı
   */
  async function complete({ system, messages, json = true, temperature = 0.8, maxTokens = 900 }, settings = load()) {
    if (!enabled(settings)) throw new Error('Yapay zekâ bağlantısı kurulmamış.');
    if (settings.provider === 'gemini') {
      const generationConfig = { temperature, maxOutputTokens: maxTokens };
      if (json) generationConfig.responseMimeType = 'application/json';
      // 2.5 Flash modellerinde "düşünme" kapatılır: oyun için hız daha önemli
      if (/2\.5-flash/.test(settings.model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
        generationConfig,
      };
      const res = await withTimeout((signal) => fetch(GEMINI + '/models/' + encodeURIComponent(settings.model) + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
        body: JSON.stringify(body),
        signal,
      }));
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      const cand = data.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!text) {
        const reason = data.promptFeedback?.blockReason || cand?.finishReason || 'boş yanıt';
        throw new Error('Model yanıt vermedi (' + reason + ').');
      }
      return text;
    }
    // OpenAI uyumlu
    const base = String(settings.baseUrl || DEFAULTS.baseUrl).replace(/\/+$/, '');
    const send = (useJson) => withTimeout((signal) => fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey },
      body: JSON.stringify({
        model: settings.model,
        temperature,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.text }))],
        ...(useJson ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal,
    }));
    let res = await send(json);
    if (!res.ok && json && res.status === 400) res = await send(false); // response_format desteklenmiyorsa
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('Model boş yanıt verdi.');
    return text;
  }

  /** Metindeki ilk JSON nesnesini ayrıştırır (```json çitlerini ve açıklamaları tolere eder) */
  function parseJSON(text) {
    const t = String(text).replace(/```(?:json)?/gi, '').trim();
    try {
      return JSON.parse(t);
    } catch {
      const a = t.indexOf('{');
      const b = t.lastIndexOf('}');
      if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
      throw new Error('Yapay zekâ yanıtı okunamadı.');
    }
  }

  async function completeJSON(req, settings) {
    return parseJSON(await complete({ ...req, json: true }, settings));
  }

  /** Bağlantıyı dener; Gemini'de kullanılabilir modelleri listeler */
  async function test(settings = load()) {
    if (!enabled(settings)) throw new Error('Önce bir API anahtarı girin.');
    let models = [];
    if (settings.provider === 'gemini') {
      const res = await withTimeout((signal) => fetch(GEMINI + '/models?pageSize=200', { headers: { 'x-goog-api-key': settings.apiKey }, signal }));
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      models = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        .filter((m) => /^gemini/.test(m));
    }
    const reply = await completeJSON({
      system: 'Sadece JSON yanıt ver.',
      messages: [{ role: 'user', text: 'Bağlantı testi. {"ok": true, "mesaj": "<Türkçe kısa selam>"} biçiminde yanıt ver.' }],
      temperature: 0,
      maxTokens: 60,
    }, settings);
    return { ok: true, message: reply.mesaj || 'Bağlantı çalışıyor.', models };
  }

  MH.llm = { load, save, enabled, complete, completeJSON, parseJSON, test, DEFAULTS, GEMINI_MODELS };
})((globalThis.MH = globalThis.MH || {}));
