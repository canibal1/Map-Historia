/*
 * Map Historia — harita üstü paneller: diplomatik sohbetler, serbest eylemler ve yapay zekâ ayarları.
 * ui.js'teki App sınıfına yöntem olarak eklenir.
 */
(function (MH) {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const fxHtml = (effects) => MH.App.effectList(effects);

  function aiBadge() {
    const s = MH.llm.load();
    if (MH.llm.enabled(s)) {
      const name = s.provider === 'gemini' ? 'Gemini' : 'Yapay zekâ';
      return `<button class="ai-status on" data-panel="settings" title="Yapay zekâ ayarları">● ${esc(name)} · ${esc(s.model)}</button>`;
    }
    return '<button class="ai-status off" data-panel="settings" title="Yapay zekâ ayarları">○ Kural tabanlı mod · YZ bağla</button>';
  }

  const Panels = {
    // ============================================================ ortak
    toggleOverlay(kind) {
      this.overlay = this.overlay === kind ? null : kind;
      if (kind === 'chat') this.chatPicking = false;
      this.renderOverlay();
    },

    closeOverlay() {
      this.overlay = null;
      this.renderOverlay();
    },

    renderOverlay() {
      const box = $('#overlay');
      if (!box) return;
      const g = this.game;
      const show = this.mode === 'play' && g?.player && this.overlay;
      document.querySelectorAll('#dock [data-overlay]').forEach((b) => b.classList.toggle('active', b.dataset.overlay === this.overlay));
      this._renderDockBadge();
      if (!show) {
        box.hidden = true;
        box.innerHTML = '';
        return;
      }
      box.hidden = false;
      box.dataset.kind = this.overlay;
      if (this.overlay === 'chat') box.innerHTML = this.chatWith ? this._threadHtml() : this._threadListHtml();
      else box.innerHTML = this._actionsHtml();
      this._bindOverlay(box);
    },

    _renderDockBadge() {
      const badge = $('#dock .badge');
      if (!badge) return;
      const n = this.game ? Object.keys(this.game.state.chatUnread || {}).filter((id) => this.game.nation(id)?.alive).length : 0;
      badge.hidden = !n;
      badge.textContent = n;
    },

    _bindOverlay(box) {
      box.querySelectorAll('[data-close-overlay]').forEach((b) => b.addEventListener('click', () => this.closeOverlay()));
      box.querySelectorAll('[data-panel="settings"]').forEach((b) => b.addEventListener('click', () => this.showAISettings()));
      if (this.overlay === 'chat') this._bindChat(box);
      else this._bindActions(box);
    },

    /** Yapay zekâ yanıtı beklenirken oyunu duraklatır; bitince eski hıza döner */
    async _paused(fn) {
      const g = this.game;
      const prev = g.state.speed;
      if (prev > 0) g.setSpeed(0);
      try {
        return await fn();
      } finally {
        if (prev > 0 && g === this.game && g.state.speed === 0 && !g.currentEvent() && !g.state.gameOver) g.setSpeed(prev);
        this.refresh();
      }
    },

    // ============================================================ sohbetler
    openChat(id) {
      this.overlay = 'chat';
      this.chatWith = id;
      this.chatPicking = false;
      MH.diplomacy.markRead(this.game, id);
      this.renderOverlay();
      $('#chat-input')?.focus();
    },

    onChat({ id }) {
      this._renderDockBadge();
      if (this.overlay !== 'chat') return;
      if (this.chatWith === id) {
        MH.diplomacy.markRead(this.game, id);
        this._renderMessages();
      } else if (!this.chatWith && !this.chatPicking) this.renderOverlay();
    },

    _threadListHtml() {
      const g = this.game;
      const me = g.state.playerId;
      const head = `
        <header class="ov-head">
          <h3>💬 Diplomatik Sohbetler</h3>
          <button class="icon-btn" data-close-overlay aria-label="Kapat">✕</button>
        </header>
        <div class="ov-sub">${aiBadge()}</div>`;
      if (this.chatPicking) {
        const q = MH.diplomacy.norm(this.chatSearch || '');
        const nb = new Set(g.neighborsOf(me));
        const list = g.aliveNations()
          .filter((n) => n.id !== me && (!q || MH.diplomacy.norm(n.name).includes(q) || MH.diplomacy.norm(n.leader).includes(q)))
          .map((n) => ({ n, w: (g.warBetween(me, n.id) ? 4 : 0) + (g.isAllied(me, n.id) ? 3 : 0) + (nb.has(n.id) ? 2 : 0) + g.militaryStrength(n.id) / 400 }))
          .sort((a, b) => b.w - a.w)
          .slice(0, 60);
        return head + `
          <div class="ov-body">
            <button class="btn ghost small" data-chat="back-list">← Sohbetler</button>
            <input id="chat-search" class="search" type="search" placeholder="Ülke ya da lider ara…" value="${esc(this.chatSearch || '')}" autocomplete="off">
            <ul class="nation-list compact chat-pick">${list.map(({ n }) => {
              const op = g.opinion(n.id, me);
              const tag = g.warBetween(me, n.id) ? '⚔️' : g.isAllied(me, n.id) ? '🤝' : nb.has(n.id) ? '🧭' : '';
              return `<li data-chat-open="${n.id}" tabindex="0"><span class="swatch" style="background:${n.color}"></span>
                <span class="nl-name">${tag} ${esc(n.name)}${MH.diplomacy.leaderName(n) === n.leader ? ` <small class="muted">· ${esc(n.leader)}</small>` : ''}</span>
                <span class="nl-meta tone-${op >= 25 ? 'good' : op <= -25 ? 'bad' : 'warn'}">${op > 0 ? '+' : ''}${op}</span></li>`;
            }).join('')}</ul>
          </div>`;
      }
      const threads = MH.diplomacy.threadList(g);
      return head + `
        <div class="ov-body">
          <button class="btn primary wide" data-chat="new">＋ Yeni Sohbet Başlat</button>
          ${threads.length ? `<ul class="threads">${threads.map((t) => {
            const n = g.nation(t.id);
            const prefix = t.last.from === 'player' ? 'Siz: ' : '';
            return `<li data-chat-open="${t.id}" tabindex="0" class="${t.unread ? 'unread' : ''}">
              <span class="swatch" style="background:${n.color}"></span>
              <div><b>${esc(n.name)}</b><time>${MH.util.formatDay(t.last.day)}</time>
              <p>${esc(prefix + t.last.text.slice(0, 90))}${t.last.text.length > 90 ? '…' : ''}</p></div>
              ${t.unread ? '<i class="dot" aria-label="Okunmamış"></i>' : ''}</li>`;
          }).join('')}</ul>` : `<p class="muted small pad">Henüz bir sohbet yok. Bir ülkenin lideriyle yazışarak ittifak, ticaret, barış ya da savaşa katılma isteyebilirsiniz. Liderler ilişkinize, gücünüze ve oyun kurallarına göre yanıt verir.</p>`}
        </div>`;
    },

    _threadHtml() {
      const g = this.game;
      const id = this.chatWith;
      const n = g.nation(id);
      if (!n) { this.chatWith = null; return this._threadListHtml(); }
      const op = g.opinion(id, g.state.playerId);
      const flags = [
        g.warBetween(g.state.playerId, id) && '<span class="chip enemy">Savaşta</span>',
        g.isAllied(g.state.playerId, id) && '<span class="chip ally">Müttefik</span>',
        g.hasTrade(g.state.playerId, id) && '<span class="chip trade">Ticaret</span>',
      ].filter(Boolean).join('');
      return `
        <header class="ov-head">
          <button class="icon-btn" data-chat="back" aria-label="Sohbetlere dön">←</button>
          <span class="swatch big" style="background:${n.color}"></span>
          <div class="ov-title"><h3>${esc(n.name)}</h3><small>${esc(MH.diplomacy.leaderName(n))} · ilişki <b class="tone-${op >= 25 ? 'good' : op <= -25 ? 'bad' : 'warn'}">${op > 0 ? '+' : ''}${op}</b> ${flags}</small></div>
          <button class="icon-btn" data-close-overlay aria-label="Kapat">✕</button>
        </header>
        <div class="msgs" id="chat-msgs" aria-live="polite"></div>
        <div class="chips-row" id="chat-chips"></div>
        <form class="composer" id="chat-form">
          <textarea id="chat-input" rows="2" maxlength="1200" placeholder="${esc(MH.diplomacy.leaderName(n))} için mesajınızı yazın…">${esc(this.chatDrafts?.[id] || '')}</textarea>
          <button class="btn primary" type="submit" ${this.chatBusy ? 'disabled' : ''}>Gönder</button>
        </form>
        <div class="ov-foot">${aiBadge()}</div>`;
    },

    _renderMessages() {
      const g = this.game;
      const box = $('#chat-msgs');
      if (!box || !this.chatWith) return;
      const n = g.nation(this.chatWith);
      const list = MH.diplomacy.thread(g, this.chatWith);
      const html = list.map((m) => {
        if (m.from === 'system') return `<div class="msg system">${esc(m.text)}</div>`;
        const mine = m.from === 'player';
        return `<div class="msg ${mine ? 'mine' : 'theirs'}">
          <div class="bubble">${esc(m.text)}</div>
          ${m.fx?.length ? fxHtml(m.fx) : ''}
          <time>${MH.util.formatDay(m.day)}${!mine && m.ai ? ' · YZ' : ''}${m.event ? ' · resmî bildiri' : ''}</time></div>`;
      }).join('');
      const empty = `<div class="msg system">${esc(MH.diplomacy.leaderName(n))} ile ilk yazışmanız. Selam verin, bir teklif sunun ya da tehdit edin. Liderin karar yetkisi oyun kurallarıyla sınırlıdır.</div>`;
      box.innerHTML = (html || empty) + (this.chatBusy === this.chatWith ? `<div class="msg theirs typing"><div class="bubble"><i></i><i></i><i></i></div><time>${esc(MH.diplomacy.leaderName(n))} yazıyor…</time></div>` : '');
      box.scrollTop = box.scrollHeight;
      const chips = $('#chat-chips');
      if (chips) {
        chips.innerHTML = MH.diplomacy.quickProposals(g, this.chatWith)
          .map(([label, text]) => `<button type="button" class="chip-btn" data-text="${esc(text)}">${esc(label)}</button>`).join('');
        chips.querySelectorAll('.chip-btn').forEach((b) => b.addEventListener('click', () => {
          const input = $('#chat-input');
          input.value = b.dataset.text;
          input.focus();
        }));
      }
    },

    _bindChat(box) {
      const g = this.game;
      box.querySelectorAll('[data-chat="new"]').forEach((b) => b.addEventListener('click', () => {
        this.chatPicking = true;
        this.chatSearch = '';
        this.renderOverlay();
        $('#chat-search')?.focus();
      }));
      box.querySelectorAll('[data-chat="back-list"]').forEach((b) => b.addEventListener('click', () => { this.chatPicking = false; this.renderOverlay(); }));
      box.querySelectorAll('[data-chat="back"]').forEach((b) => b.addEventListener('click', () => { this.chatWith = null; this.renderOverlay(); }));
      box.querySelectorAll('[data-chat-open]').forEach((li) => {
        const go = () => this.openChat(li.dataset.chatOpen);
        li.addEventListener('click', go);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      });
      const search = $('#chat-search', box);
      if (search) {
        search.addEventListener('input', () => {
          this.chatSearch = search.value;
          const pos = search.selectionStart;
          this.renderOverlay();
          const s = $('#chat-search');
          s.focus();
          s.setSelectionRange(pos, pos);
        });
      }
      const form = $('#chat-form', box);
      if (!form) return;
      this._renderMessages();
      const input = $('#chat-input', box);
      this.chatDrafts = this.chatDrafts || {};
      input.addEventListener('input', () => { this.chatDrafts[this.chatWith] = input.value; });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || this.chatBusy) return;
        const id = this.chatWith;
        this.chatBusy = id;
        this.chatDrafts[id] = '';
        input.value = '';
        form.querySelector('button').disabled = true;
        try {
          const pending = MH.diplomacy.send(g, id, text);
          this._renderMessages(); // oyuncunun mesajı ve "yazıyor…" göstergesi
          const res = await this._paused(() => pending);
          if (res.warning) this.toast('Yapay zekâ yanıt veremedi', [[res.warning, null]], 'bad');
          if (res.results.some((r) => r.ok)) this.map.refreshAll();
        } catch (err) {
          this.toast('Mesaj gönderilemedi', [[err.message, null]], 'bad');
        } finally {
          this.chatBusy = null;
          if (this.overlay === 'chat' && this.chatWith === id) {
            const f = $('#chat-form');
            if (f) f.querySelector('button').disabled = false;
            this._renderMessages();
            $('#chat-input')?.focus();
          }
          this._renderDockBadge();
        }
      });
    },

    // ============================================================ eylemler
    _actionsHtml() {
      const g = this.game;
      const history = g.state.actions || [];
      return `
        <header class="ov-head">
          <h3>⚡ Eylemler</h3>
          <button class="icon-btn" data-close-overlay aria-label="Kapat">✕</button>
        </header>
        <div class="ov-body">
          <p class="ov-lead">${esc(MH.util.formatDay(g.state.day))} günü için <b>${esc(g.player.name)}</b> eylemlerini gönderin.</p>
          <textarea id="act-input" rows="4" maxlength="2000" placeholder="Eyleminizi girin… ör. “Vergileri %20'ye indir, ${esc(this._exampleNation())} ile ittifak kur, başkentte kale inşa et.”" ${this.actionBusy ? 'disabled' : ''}>${esc(this.actionDraft || '')}</textarea>
          <div class="btn-row">
            <button class="btn ghost small" id="act-ideas" ${this.actionBusy ? 'disabled' : ''}>💡 Eylem fikirleri yardımı</button>
            <button class="btn primary" id="act-send" ${this.actionBusy ? 'disabled' : ''}>${this.actionBusy ? 'İşleniyor…' : 'Gönder'}</button>
          </div>
          <div id="act-ideas-box">${this._ideasHtml()}</div>
          ${aiBadge()}
          ${history.length ? '<h4>Geçmiş eylemler</h4>' : '<p class="muted small">Ne yapmak istediğinizi kendi cümlelerinizle yazın: vergi, asker toplama, inşaat, ittifak, ticaret, hediye, savaş, barış, saldırı, koloni ya da bir reform. Oyun kurallarına uymayan istekler gerekçesiyle reddedilir.</p>'}
          <ol class="act-history">${history.map((h) => this._actionEntryHtml(h)).join('')}</ol>
        </div>`;
    },

    _exampleNation() {
      const g = this.game;
      const me = g.state.playerId;
      const best = g.aliveNations().filter((n) => n.id !== me && !g.isAllied(me, n.id) && !g.warBetween(me, n.id))
        .sort((a, b) => g.opinion(b.id, me) - g.opinion(a.id, me))[0];
      return best ? best.name : 'komşumuz';
    },

    _ideasHtml() {
      if (!this.actionIdeas?.length) return '';
      return `<div class="ideas">${this.actionIdeas.map((t) => `<button type="button" class="chip-btn idea" data-idea="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
    },

    _actionEntryHtml(h) {
      return `<li class="act-entry">
        <time>${MH.util.formatDay(h.day)}${h.ai ? ' · YZ' : ''}</time>
        <b class="act-headline">${esc(h.headline)}</b>
        <p class="act-text">“${esc(h.text)}”</p>
        ${h.narrative ? `<p class="act-narr">${esc(h.narrative)}</p>` : ''}
        <ul class="act-results">${h.results.map((r) => `<li class="${r.ok ? 'ok' : 'no'}"><span>${r.ok ? '✓' : '✗'} ${esc(r.label)}</span> ${esc(r.message)}${fxHtml(r.effects.filter((e) => e[1] !== null && e[1] !== undefined))}</li>`).join('')}
        ${(h.refused || []).map((r) => `<li class="no"><span>⊘ Uygulanmadı</span> “${esc(r.text)}” — ${esc(r.reason)}</li>`).join('')}</ul>
        ${(h.reactions || []).length ? `<ul class="act-reactions">${h.reactions.map((r) => `<li><b>${esc(r.name)}</b> <span class="tone-${r.opinion > 0 ? 'good' : r.opinion < 0 ? 'bad' : 'warn'}">${r.opinion > 0 ? '+' : ''}${r.opinion}</span> ${esc(r.text)}</li>`).join('')}</ul>` : ''}
      </li>`;
    },

    _bindActions(box) {
      const g = this.game;
      const input = $('#act-input', box);
      if (!input) return;
      input.addEventListener('input', () => { this.actionDraft = input.value; });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#act-send').click(); }
      });
      box.querySelectorAll('[data-idea]').forEach((b) => b.addEventListener('click', () => {
        const cur = input.value.trim();
        input.value = cur ? cur.replace(/[.\s]*$/, '. ') + b.dataset.idea : b.dataset.idea;
        this.actionDraft = input.value;
        input.focus();
      }));
      $('#act-ideas', box).addEventListener('click', async () => {
        if (this.actionBusy) return;
        this.actionBusy = true;
        this.renderOverlay();
        try {
          const res = await this._paused(() => MH.actions.ideas(g));
          this.actionIdeas = res.ideas;
          if (res.warning) this.toast('Fikirler kural tabanlı üretildi', [[res.warning, null]], 'bad');
        } finally {
          this.actionBusy = false;
          if (this.overlay === 'actions') this.renderOverlay();
        }
      });
      $('#act-send', box).addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text || this.actionBusy) return;
        this.actionBusy = true;
        this.renderOverlay();
        try {
          const res = await this._paused(() => MH.actions.submit(g, text));
          this.actionDraft = '';
          this.actionIdeas = null;
          if (res.warning) this.toast('Yapay zekâ yanıt veremedi', [[res.warning, null]], 'bad');
          const ok = res.results.filter((r) => r.ok).length;
          this.toast('⚡ ' + res.headline, [[ok + ' eylem uygulandı' + (res.results.length - ok + res.refused.length ? ', ' + (res.results.length - ok + res.refused.length) + ' eylem uygulanamadı' : ''), null]], ok ? 'good' : 'bad');
        } catch (err) {
          this.toast('Eylemler gönderilemedi', [[err.message, null]], 'bad');
        } finally {
          this.actionBusy = false;
          if (this.overlay === 'actions') this.renderOverlay();
        }
      });
    },

    // ============================================================ yapay zekâ ayarları
    showAISettings() {
      const s = MH.llm.load();
      const models = MH.llm.GEMINI_MODELS;
      this.modal(`
        <div class="ev-icon">🤖</div>
        <h2>Yapay zekâ bağlantısı</h2>
        <p class="small">Ülke liderleriyle doğal dilde sohbet etmek ve eylemleri kendi cümlelerinizle yazmak için bir dil modeli bağlayın. Bağlantı yoksa oyun kural tabanlı yanıtlarla çalışmaya devam eder.</p>
        <form id="ai-form" class="ai-form">
          <label>Sağlayıcı
            <select id="ai-provider">
              <option value="gemini" ${s.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
              <option value="openai" ${s.provider === 'openai' ? 'selected' : ''}>OpenAI uyumlu (OpenAI, OpenRouter, yerel…)</option>
              <option value="off" ${s.provider === 'off' ? 'selected' : ''}>Kapalı (kural tabanlı)</option>
            </select>
          </label>
          <label class="ai-key">API anahtarı
            <span class="key-row">
              <input id="ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" value="${esc(s.apiKey)}">
              <button type="button" class="btn small ghost" id="ai-show" aria-label="Anahtarı göster">👁</button>
            </span>
          </label>
          <label>Model
            <input id="ai-model" list="ai-models" value="${esc(s.model)}" spellcheck="false">
            <datalist id="ai-models">${models.map((m) => `<option value="${m}">`).join('')}</datalist>
          </label>
          <label id="ai-base-row">Uç nokta (base URL)
            <input id="ai-base" value="${esc(s.baseUrl)}" spellcheck="false">
          </label>
          <p class="small muted" id="ai-hint"></p>
          <p class="small ai-privacy">🔒 Anahtarınız yalnızca bu tarayıcıda saklanır ve doğrudan seçtiğiniz sağlayıcıya gönderilir; başka hiçbir sunucuya iletilmez. Ortak kullanılan bir cihazdaysanız işiniz bitince anahtarı silin.</p>
          <div id="ai-result" class="small" aria-live="polite"></div>
          <div class="btn-row end">
            <button type="button" class="btn ghost" data-close>Vazgeç</button>
            <button type="button" class="btn" id="ai-test">Bağlantıyı test et</button>
            <button type="submit" class="btn primary">Kaydet</button>
          </div>
        </form>`, { kind: 'settings' });
      const prov = $('#ai-provider');
      const read = () => ({ provider: prov.value, apiKey: $('#ai-key').value, model: $('#ai-model').value, baseUrl: $('#ai-base').value });
      const sync = () => {
        const p = prov.value;
        $('#ai-base-row').hidden = p !== 'openai';
        $('.ai-key').hidden = p === 'off';
        $('#ai-model').closest('label').hidden = p === 'off';
        $('#ai-key').placeholder = p === 'gemini' ? 'AIza…' : 'sk-…';
        $('#ai-hint').innerHTML = p === 'gemini'
          ? 'Ücretsiz bir Gemini API anahtarını <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> üzerinden alabilirsiniz. Önerilen model: <b>gemini-2.5-flash</b> (hızlı).'
          : p === 'openai' ? 'OpenAI uyumlu herhangi bir /chat/completions uç noktası kullanılabilir.' : 'Sohbet ve eylemler anahtar kelimelere dayalı kurallarla çalışır.';
        if (p === 'gemini' && !/gemini/.test($('#ai-model').value)) $('#ai-model').value = MH.llm.DEFAULTS.model;
      };
      prov.addEventListener('change', sync);
      sync();
      $('#ai-show').addEventListener('click', () => {
        const k = $('#ai-key');
        k.type = k.type === 'password' ? 'text' : 'password';
      });
      $('#ai-test').addEventListener('click', async () => {
        const out = $('#ai-result');
        out.className = 'small';
        out.textContent = 'Bağlanılıyor…';
        try {
          const res = await MH.llm.test(read());
          out.className = 'small tone-good';
          out.textContent = '✓ ' + res.message;
          if (res.models.length) {
            $('#ai-models').innerHTML = res.models.map((m) => `<option value="${esc(m)}">`).join('');
            out.textContent += ' · ' + res.models.length + ' model kullanılabilir.';
          }
        } catch (err) {
          out.className = 'small tone-bad';
          out.textContent = '✗ ' + err.message;
        }
      });
      $('#ai-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const saved = MH.llm.save(read());
        this.closeModal();
        const on = MH.llm.enabled();
        this.toast(on ? 'Yapay zekâ bağlandı' : 'Kural tabanlı mod etkin', saved ? [] : [['Tarayıcı depolaması kapalı: ayar yalnızca bu oturumda geçerli.', null]], on ? 'good' : 'info');
        this.renderOverlay();
        this._renderMenuAI?.();
      });
    },
  };

  Object.assign(MH.App.prototype, Panels);
})((globalThis.MH = globalThis.MH || {}));
