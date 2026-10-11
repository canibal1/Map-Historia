# Map Historia

Tarayıcıda çalışan, altıgen haritalı bir **alternatif tarih büyük strateji** oyunu. Bir dönem seçin, bir ulusun başına geçin,
vergiden ittifaklara, savaştan barışa kadar her kararla tarihin akışını değiştirin.

> **Bir oyuncu olarak**, tarihi bir lider veya ulus seçip alternatif tarih senaryoları içinde diplomatik, askerî ve ekonomik
> kararlar alabilmek istiyorum, **böylece** kendi stratejilerimle dünya tarihinin akışını değiştirip kendi imparatorluğumu ve
> hikâyemi yaratabileyim.

## Çalıştırma

Kurulum gerekmez; tüm kod saf HTML/CSS/JavaScript'tir.

```bash
# index.html dosyasını doğrudan tarayıcıda açabilirsiniz, ya da:
npm start          # http://localhost:8080
npm test           # kabul kriterleri testleri (Node 18+)
```

**Kısayollar:** `Boşluk` duraklat/devam · `1` `2` `3` hız · fare tekerleği yakınlaştır · sürükle kaydır.

## Senaryolar

| Yıl  | Senaryo                      | Ulus | Öne çıkan tarihî olaylar                                                  |
| ---- | ---------------------------- | ---- | ------------------------------------------------------------------------- |
| 1453 | Konstantinopolis'in Düşüşü   | 48   | Bizans'ın yardım çağrısı, Konstantinopolis Kuşatması, Castillon, Matbaa   |
| 1815 | Yüz Gün                      | 28   | Kartal Yeniden Uçuyor, Takovo Ayaklanması, Waterloo, Yazsız Yıl           |
| 1914 | Büyük Savaş'ın Eşiği         | 22   | Saraybosna Suikastı, Seferberlik, Schlieffen Planı, Goeben, Londra Antl.  |

Tarihî olaylarda yapay zekâ gerçek tarihteki seçimi yapar; siz o ulusu yönetiyorsanız karar sizindir. Örneğin Bizans
olarak Sultan'a haraç öderseniz kuşatma hiç gerçekleşmez; 1914'te Avusturya ültimatom vermezse Büyük Savaş başlamayabilir.

## Kabul kriterleri → uygulama

| AC  | Karşılanma şekli | Kod | Test |
| --- | ---------------- | --- | ---- |
| 1.1 | Ana menüde üç dönem kartı (yıl, başlık, açıklama, ulus sayısı) | `ui.js` `showMenu`, `scenarios.js` | `AC 1.1` |
| 1.2 | Seçilen dönemin haritasında bir ülkeye tıklama ya da lider listesinden seçme | `ui.js` `renderPick`, `map.js` | `AC 1.2` |
| 1.3 | Seçim panelinde hazine, aylık gelir, eyalet, gelişim, istikrar, vergi; ordu, insan gücü, güç sırası; müttefikler, savaşlar, ticaret, dostlar, rakipler, komşular ve zorluk tahmini | `engine.js` `summary` | `AC 1.3` |
| 2.1 | **Ekonomi** sekmesi: vergi kaydırıcısı (anlık istikrar önizlemesi), bütçe dökümü, 4 üretim odağı (Tarım/Sanayi/Ticaret/Askerî, 180 gün bekleme), ticaret anlaşmaları | `setTax`, `setFocus`, `proposeTrade`, `budget` | `AC 2.1` ×3 |
| 2.2 | **Diplomasi** sekmesi: ittifak öner/boz, ticaret, hediye, savaş ilanı (onay penceresinde sonuç önizlemesi), barış (beyaz barış / tazminat iste / tazminat öde). Yapay zekâ ilişki ve savaş skoruna göre kabul ya da ret eder; savunma ittifakları otomatik devreye girer | `proposeAlliance`, `declareWar`, `offerPeace` | `AC 2.2` ×4 |
| 2.3 | Her karar bir sonuç bildirimi gösterir: savaş ilanı istikrarı düşürür, komşular saldırganlık nedeniyle tavır alır, ateşkes ihlali ağır cezalıdır; vergi, ittifak bozma, hediye, ticaret ilişkileri ve istikrarı değiştirir. "Diplomatik harita" modu komşuların tutumunu renklerle gösterir | `engine.js`, `map.js` `colorOf` | `AC 2.3` ×2 |
| 3.1 | Üst çubukta duraklat + 3 hız; boşluk ve 1–3 kısayolları; olay geldiğinde zaman otomatik durur | `setSpeed`, `ui.js` `_loop` | `AC 3.1` ×2 |
| 3.2 | Kazanılan muharebeler eyaletleri anında el değiştirir; altıgen rengi, ülke sınırları, etiketler ve başkentler yeniden çizilir, fethedilen eyalet parlar. Düşman toprakları taralı gösterilir | `transferProvince`, `MapView` | `AC 3.2` ×2 |
| 4.1 | Aylık %50 şansla (en az 60 gün arayla) rastgele olay; ayrıca tarihe bağlı olaylar. Olay penceresi oyunu duraklatır | `events.js` `checkRandom`, `checkScheduled` | `AC 4.1` ×2 |
| 4.2 | 37 olayın tamamında en az 2 (bazılarında 3) seçenek; her seçeneğin etkisi önceden gösterilir, bazılarının sonucu zarla belirlenir | `events.js` `apply`, `preview` | `AC 4.2` ×3 |

## Oyun mekaniği özeti

- **Harita:** Avrupa, Kuzey Afrika ve Yakın Doğu yaklaşık 940 altıgen eyalete bölünür. Ülke sınırları her senaryoda
  başkentlerden ve tarihî tohum noktalarından genişleyen ağırlıklı bir yayılımla oluşturulur (aynı senaryo hep aynı haritayla başlar).
- **Ekonomi:** Gelir = gelişim × vergi × istikrar çarpanı + ticaret − ordu bakımı. Hazine eksiye düşerse askerler firar eder.
- **İstikrar:** Vergi, savaş sayısı, savaş yorgunluğu ve üretim odağına göre bir hedefe doğru ayda en fazla 3 puan kayar.
- **Savaş:** Ordular cephe sayısına bölünür; muharebeyi güç oranı, ordu kalitesi ve savunma avantajı belirler.
  Saldıran taraf kazanırsa sınır eyaletini ele geçirebilir; başkentler surlarla korunur. Tüm topraklarını kaybeden ulus yok olur.
- **Yapay zekâ:** Asker toplar, zayıf ve sevmediği komşularına savaş açar, kaybederken barış ister (size olay olarak gelir),
  dostlarıyla ticaret ve ittifak kurar, size ittifak teklif edebilir.
- **Kayıt:** Oyun tarayıcıya kaydedilir (`localStorage`); ana menüden devam edilebilir.

## Proje yapısı

```
index.html          Ekranlar: menü, harita, yan panel, olay penceresi
css/style.css       Arayüz stilleri (mobil uyumlu)
js/geo.js           Kıyı poligonları, altıgen ızgara, komşuluk ve boğaz bağlantıları
js/scenarios.js     1453 / 1815 / 1914 senaryo verileri
js/engine.js        Oyun durumu: ekonomi, diplomasi, savaş, zaman, kayıt
js/ai.js            Yapay zekâ ulusların aylık kararları
js/events.js        Tarihî, kurgusal ve yapay zekâ kaynaklı olaylar
js/map.js           SVG harita görünümü (yakınlaştırma, kaydırma, harita modları)
js/ui.js            Menü, ulus seçimi, sekmeler, bildirimler
tests/              Kabul kriterlerine göre düzenlenmiş Node testleri
```

`engine.js`, `ai.js` ve `events.js` DOM'a bağımlı değildir; testler bunları doğrudan Node'da çalıştırır.

## Sonraki adımlar (öneri)

Not'ta belirtildiği gibi modüller ayrı epiklere bölünebilir: ayrıntılı **Savaş Sistemi** (birlik türleri, ordu hareketi,
kuşatma), **Diplomasi Ekranı** (antlaşma maddeleri, vasallık, toprak talebi), eyalet adları ve bina sistemi.
