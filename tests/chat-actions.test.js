'use strict';
/*
 * Diplomatik sohbetler ve serbest metinle eylemler.
 * Yapay zekâ yanıtları sahte bir dil modeliyle taklit edilir; kural tabanlı yedek mod doğrudan sınanır.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { MH, newGame } = require('./helpers');

/** MH.llm.completeJSON'u geçici olarak sahte bir yanıtla değiştirir */
async function withFakeLLM(reply, fn) {
  const orig = MH.llm.completeJSON;
  const calls = [];
  MH.llm.completeJSON = async (req) => {
    calls.push(req);
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply(req) : reply;
  };
  try {
    await fn(calls);
  } finally {
    MH.llm.completeJSON = orig;
  }
}

// ---------------------------------------------------------------- sohbetler
test('Sohbet (yedek mod): dost ülke ticaret teklifini kabul eder, kayıt tutulur', async () => {
  const game = newGame('modern-2026', 'turkey');
  assert.ok(!game.hasTrade('turkey', 'japan'));
  const res = await MH.diplomacy.send(game, 'japan', 'Merhaba, karşılıklı yarar için bir ticaret anlaşması imzalayalım.', { useLLM: false });
  assert.equal(res.usedLLM, false);
  assert.ok(game.hasTrade('turkey', 'japan'), 'ticaret anlaşması kurulmalı');
  const thread = MH.diplomacy.thread(game, 'japan');
  assert.equal(thread.length, 2);
  assert.equal(thread[0].from, 'player');
  assert.equal(thread[1].from, 'nation');
  assert.ok(thread[1].fx.some(([label]) => /^✓/.test(label)));
  assert.deepEqual(MH.diplomacy.threadList(game).map((t) => t.id), ['japan']);
});

test('Sohbet: model kabul etse bile kurallar izin vermeyen anlaşma uygulanmaz', async () => {
  const game = newGame('modern-2026', 'turkey');
  game.state.nations.china.opinions.turkey = 0;
  assert.ok(game.allianceCheck('turkey', 'china'), 'ilişki ittifak için yetersiz olmalı');
  await withFakeLLM({ reply: 'Elbette, ittifak kuralım!', opinion_change: 40, mood: 'dostça', agreements: [{ type: 'alliance', accept: true }] }, async (calls) => {
    const res = await MH.diplomacy.send(game, 'china', 'İttifak kuralım.', { useLLM: true });
    assert.equal(res.usedLLM, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].messages.at(-1).text, /kurallara_gore_verebilecegin_kararlar/);
  });
  assert.ok(!game.isAllied('turkey', 'china'), 'kurallar ittifaka izin vermiyor');
  assert.equal(game.opinion('china', 'turkey'), 10, 'tek mesajla ilişki en fazla +10 değişir');
});

test('Sohbet: aylık ilişki kazancı sınırlıdır', async () => {
  const game = newGame('modern-2026', 'turkey');
  const before = game.opinion('brazil', 'turkey');
  await withFakeLLM({ reply: 'Teşekkürler.', opinion_change: 10, agreements: [] }, async () => {
    for (let i = 0; i < 5; i++) await MH.diplomacy.send(game, 'brazil', 'Dostluğumuz ebedî olsun.', { useLLM: true });
  });
  assert.equal(game.opinion('brazil', 'turkey') - before, 20);
});

test('Sohbet: yapay zekâ hata verirse kural tabanlı yanıta düşer', async () => {
  const game = newGame('modern-2026', 'turkey');
  await withFakeLLM(new Error('Kota aşıldı'), async () => {
    const res = await MH.diplomacy.send(game, 'germany', 'Selam!', { useLLM: true });
    assert.equal(res.usedLLM, false);
    assert.match(res.warning, /Kota aşıldı/);
    assert.ok(res.reply.length > 10);
  });
});

test('Sohbet: savaştaki ülke barış teklifini kurallara göre değerlendirir', async () => {
  const game = newGame('modern-2026', 'ukraine');
  assert.ok(game.warBetween('ukraine', 'russia'));
  await withFakeLLM({ reply: 'Tazminatınızı ödeyeceğiz.', opinion_change: 0, agreements: [{ type: 'peace_we_pay', accept: true }] }, async () => {
    const res = await MH.diplomacy.send(game, 'russia', 'Tazminat ödeyin.', { useLLM: true });
    assert.ok(res.results.every((r) => !r.ok), 'savaş skoru yetersizken tazminat alınamaz');
  });
  assert.ok(game.warBetween('ukraine', 'russia'));
});

test('Sohbet: yapay zekâ kaynaklı resmî teklifler ilgili sohbete düşer', () => {
  const game = newGame('modern-2026', 'turkey');
  MH.diplomacy.attach(game);
  game.queueEvent('ai_alliance_offer', 'turkey', { target: 'azerbaijan' });
  const thread = MH.diplomacy.thread(game, 'azerbaijan');
  assert.equal(thread.length, 1);
  assert.equal(thread[0].event, 'ai_alliance_offer');
  assert.ok(game.state.chatUnread.azerbaijan);
});

// ---------------------------------------------------------------- eylemler
test('Eylemler (yedek mod): cümleler oyun işlemlerine çevrilir', async () => {
  const game = newGame('modern-2026', 'turkey');
  const army = game.player.army;
  const res = await MH.actions.submit(game, "Vergileri %20'ye indir. 10 bin asker topla ve Ankara'da bir kale inşa et. Japonya ile ticaret anlaşması yap.", { useLLM: false });
  assert.deepEqual(res.results.map((r) => r.type), ['set_tax', 'recruit', 'build', 'propose_trade']);
  assert.ok(res.results.every((r) => r.ok), res.results.map((r) => r.message).join(' | '));
  assert.equal(game.player.tax, 20);
  assert.equal(game.player.army, army + 10);
  assert.ok(game.state.construction.some((c) => c.type === 'fort' && MH.places.nameOf(game, c.pid) === 'Ankara'));
  assert.ok(game.hasTrade('turkey', 'japan'));
  assert.equal(game.state.actions.length, 1);
});

test('Eylemler: imkânsız ve anlaşılmayan istekler gerekçesiyle reddedilir', async () => {
  const game = newGame('modern-2026', 'turkey');
  const res = await MH.actions.submit(game, 'Tüm dünyayı fethet. Zamanda yolculuk yap.', { useLLM: false });
  assert.equal(res.results.length, 0);
  assert.equal(res.refused.length, 2);
});

test('Eylemler: saldırı emri önce savaş gerektirir; savaş ilanıyla birlikte ordu yola çıkar', async () => {
  const game = newGame('modern-2026', 'turkey');
  let r = MH.actions.execute(game, { type: 'attack', nation: 'Ermenistan' });
  assert.equal(r.ok, false);
  const res = await MH.actions.submit(game, "Ermenistan'a savaş ilan et ve Erivan'a saldır", { useLLM: false });
  assert.deepEqual(res.results.map((x) => [x.type, x.ok]), [['declare_war', true], ['attack', true]]);
  const stack = MH.armies.stacksOf(game, 'turkey').find((s) => s.path.length);
  assert.ok(stack, 'bir ordu yürüyüşte olmalı');
  assert.equal(game.state.owner[stack.path.at(-1)], 'armenia');
});

test('Eylemler (yapay zekâ): yalnızca izinli işlemler uygulanır, özel politika sınırlanır', async () => {
  const game = newGame('modern-2026', 'turkey');
  const gold = game.player.gold;
  const stab = game.player.stability;
  await withFakeLLM({
    headline: 'Büyük reform',
    narrative: 'Meclis yeni yasaları kabul etti.',
    ops: [
      { type: 'policy', title: 'Mucize reform', effects: { stability: 50, capitalDev: 9 }, cost: 1 },
      { type: 'give_me_gold', amount: 99999 },
      { type: 'propose_alliance', nation: 'Çin' },
    ],
    refused: [{ text: 'Ay’a koloni', reason: 'Oyunda uzay yok.' }],
    reactions: [{ nation: 'Yunanistan', opinion: -50, text: 'Atina tedirgin.' }, { nation: 'Japonya', opinion: 50, text: 'Tokyo memnun.' }],
  }, async () => {
    const res = await MH.actions.submit(game, 'Reform yap, altın ver, Çin ile ittifak kur', { useLLM: true });
    assert.equal(res.usedLLM, true);
    assert.deepEqual(res.results.map((r) => r.type), ['policy', 'propose_alliance'], 'bilinmeyen işlem atlanır');
    assert.equal(res.results[0].ok, true);
    assert.equal(res.results[1].ok, false, 'Çin ile ilişki ittifak için yetersiz');
    assert.equal(res.reactions.find((r) => r.nation === 'greece').opinion, -15);
    assert.ok(res.reactions.find((r) => r.nation === 'japan').opinion <= 8);
    assert.equal(res.headline, 'Büyük reform');
  });
  assert.equal(game.player.stability, Math.min(100, stab + 6), 'istikrar kazancı +6 ile sınırlı');
  assert.equal(game.player.gold, gold - (6 * 12 + 2 * 60), 'bedel oyun tarafından hesaplanır');
  // İkinci politika bekleme süresine takılır
  const again = MH.actions.execute(game, { type: 'policy', title: 'Yine reform', effects: { stability: 2 } });
  assert.equal(again.ok, false);
});

test('Eylem fikirleri kural tabanlı olarak da üretilir', async () => {
  const game = newGame('great-war-1914', 'germany');
  const res = await MH.actions.ideas(game, { useLLM: false });
  assert.ok(res.ideas.length >= 3);
  assert.ok(res.ideas.every((s) => typeof s === 'string' && s.length > 5));
});

test('Sohbetler ve eylem geçmişi kayıtla birlikte saklanır', async () => {
  const game = newGame('modern-2026', 'turkey');
  await MH.diplomacy.send(game, 'japan', 'Selam!', { useLLM: false });
  await MH.actions.submit(game, 'Şenlik düzenle', { useLLM: false });
  const loaded = MH.Game.load(game.serialize());
  assert.equal(MH.diplomacy.thread(loaded, 'japan').length, 2);
  assert.equal(loaded.state.actions.length, 1);
});

// ---------------------------------------------------------------- günümüz olayları ve yardımcılar
test('Günümüz senaryosunun rastgele olayları hatasız uygulanır, eski çağ olayları çıkmaz', () => {
  const evs = MH.events.EVENTS.filter((e) => e.scenario === 'modern-2026' && !e.date);
  assert.ok(evs.length >= 8);
  for (const ev of evs) {
    ev.options.forEach((_, i) => {
      const game = newGame('modern-2026', 'turkey');
      game.state.nations.russia.opinions.turkey = -40;
      const ctx = ev.prepare ? ev.prepare(game, 'turkey') : {};
      assert.ok(ctx, ev.id + ': hazırlık başarısız');
      const res = MH.events.apply(game, { eventId: ev.id, nationId: 'turkey', ctx }, i);
      assert.equal(res.ok, true, ev.id);
    });
  }
  const game = newGame('modern-2026', 'turkey');
  for (let i = 0; i < 400; i++) {
    game.state.lastEventDay = -1e9;
    game.state.eventQueue.length = 0;
    MH.events.checkRandom(game);
    const ev = game.currentEvent();
    if (ev) assert.ok(!MH.events.BY_ID[ev.eventId].classic, ev.eventId + ' günümüzde çıkmamalı');
  }
});

test('Günümüzde müttefikler saldırı savaşına yalnızca hedefe düşmansa katılır', () => {
  const game = newGame('modern-2026', 'turkey');
  game.declareWar('turkey', 'armenia');
  assert.ok(!game.warBetween('usa', 'armenia'), 'NATO saldırı savaşına otomatik katılmaz');
  assert.ok(game.warBetween('azerbaijan', 'armenia'));
});

test('Yapay zekâ JSON yanıtı çit ve açıklamalarla gelse de okunur', () => {
  assert.deepEqual(MH.llm.parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(MH.llm.parseJSON('Tabii! {"reply":"x"} umarım yardımcı olur'), { reply: 'x' });
  assert.throws(() => MH.llm.parseJSON('yanıt yok'));
  assert.equal(MH.llm.enabled({ provider: 'gemini', apiKey: '' }), false);
  assert.equal(MH.llm.enabled({ provider: 'off', apiKey: 'x' }), false);
});
