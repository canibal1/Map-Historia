# Map Historia

Tarayıcıda çalışan, gerçek dünya haritalı bir **alternatif tarih büyük strateji** oyunu. Bir dönem seçin, bir ulusun başına
geçin, ülke liderleriyle **yazışın**, ne yapmak istediğinizi **kendi cümlelerinizle yazın** ve tarihin akışını değiştirin.

> **Bir oyuncu olarak**, tarihi bir lider veya ulus seçip alternatif tarih senaryoları içinde diplomatik, askerî ve ekonomik
> kararlar alabilmek istiyorum, **böylece** kendi stratejilerimle dünya tarihinin akışını değiştirip kendi imparatorluğumu ve
> hikâyemi yaratabileyim.

**▶ Hemen oyna (telefon ve bilgisayar):** https://canibal1.github.io/Map-Historia/

## Çalıştırma

Kurulum gerekmez; tüm kod saf HTML/CSS/JavaScript'tir.

```bash
# index.html dosyasını doğrudan tarayıcıda açabilirsiniz, ya da:
npm start          # http://localhost:8080
npm test           # kabul kriterleri testleri (Node 18+)
npm run build      # dist/site/: GitHub Pages sürümü (index.html + data/ harita verileri)
npm run build:map  # data/map-*.js harita verilerini kaynaklardan yeniden üretir (isteğe bağlı)
```

Çevrimiçi sürüm `gh-pages` dalındadır ve `dist/site/` klasörünün içeriğidir. Güncellemek için `npm run build` çalıştırıp
bu klasörü `gh-pages` dalına gönderin.

**Kısayollar:** `Boşluk` duraklat/devam · `1` `2` `3` hız · `Esc` ordu seçimini ya da paneli kapat · fare tekerleği / iki parmak
yakınlaştır · sürükle kaydır · sohbette `Enter` gönder · eylemlerde `Ctrl+Enter` gönder.

## Yapay zekâ bağlantısı (isteğe bağlı): Google Gemini

Sohbetler ve serbest eylemler bir dil modeliyle çok daha doğal çalışır. Oyun yapay zekâ olmadan da oynanır; bu durumda
anahtar kelimelere dayalı kural tabanlı bir mod devreye girer.

1. [Google AI Studio](https://aistudio.google.com/apikey) üzerinden ücretsiz bir **Gemini API anahtarı** alın.
2. Oyunda ana menüdeki ya da üst çubuktaki **🤖** düğmesine basın, sağlayıcı olarak *Google Gemini*'yi seçip anahtarı yapıştırın.
3. **Bağlantıyı test et** → **Kaydet**. Önerilen model `gemini-2.5-flash` (hızlı); test kullanılabilir modelleri de listeler.

OpenAI uyumlu herhangi bir `/chat/completions` uç noktası (OpenAI, OpenRouter, yerel sunucular) da seçilebilir.

**Gizlilik:** Anahtar yalnızca sizin tarayıcınızda (`localStorage`) saklanır ve doğrudan seçtiğiniz sağlayıcıya gönderilir; oyunun
bir sunucusu yoktur. Yapay zekâya yalnızca oyun durumu (ülkeler, ilişkiler, yazdığınız mesaj) gönderilir. Ortak bir cihazda
işiniz bitince anahtarı ayarlardan silin.

## Diplomatik sohbetler

Haritanın sol altındaki **💬 Sohbetler** düğmesi (ya da *Diplomasi* sekmesindeki **Sohbet et**) ile dünyadaki herhangi bir
ülkenin lideriyle yazışırsınız: selam verin, ittifak ya da ticaret önerin, barış için pazarlık edin, bir savaşa katılmasını
isteyin, yardım isteyin ya da tehdit edin.

- Lider; ülkesinin durumu, sizinle ilişkisi, güç dengesi, savaşlar ve son olaylar bağlamında karakterine uygun yanıt verir.
- Her mesaj ilişkiyi en fazla ±10 değiştirebilir (sohbetle ayda en fazla +20 kazanılır).
- **Kararların tek yetkilisi oyun kurallarıdır.** Lider bir anlaşmayı kabul etse bile kurallar izin vermiyorsa (ör. ilişki
  ittifak için yetersiz, savaş skoru tazminata yetmiyor) uygulanmaz ve nedeni mesajın altında gösterilir.
- Yapay zekâ ulusların resmî teklifleri (ittifak, barış, tazminat talebi, savaş ilanı) ilgili sohbete de düşer.
- Hızlı teklif düğmeleri (🤝 İttifak, 📦 Ticaret, 🕊️ Beyaz barış…) hazır mesajlar yazar.

## Eylemler (serbest metin)

**⚡ Eylemler** panelinde o gün için ne yapmak istediğinizi kendi cümlelerinizle yazarsınız, örneğin:

> Vergileri %20'ye indir, 10 bin asker topla, Ankara'da bir kale inşa et. Japonya ile ticaret anlaşması yap ve
> Yunanistan'a 50 altın hediye gönder. Eğitim reformu başlat.

Yapay zekâ "oyun yöneticisi" metni oyunun işlemlerine çevirir, kısa bir anlatı ve manşet yazar, etkilenen ülkelerin
tepkilerini ekler. Desteklenen işlemler: vergi, üretim odağı, asker toplama, paralı asker, terhis, inşaat (pazar, kışla,
kale, mabet), şenlik, ticaret/iptal, ittifak/bozma, hediye, savaş ilanı, barış (beyaz / tazminat iste / öde), cephe duruşu,
**saldırı** (orduyu bir düşman şehrine yollar), koloni ve **özel reform/politika**.

- Her işlem motorun kendi kurallarından geçer; kurallara uymayanlar gerekçesiyle reddedilir (ör. "tüm dünyayı fethet").
- Özel reformların etkileri sınırlıdır ve bedelini oyun hesaplar (60 günde bir).
- **💡 Eylem fikirleri yardımı** duruma göre öneriler getirir; tıklanan öneri metne eklenir.
- Yapay zekâ yanıtı beklenirken oyun duraklar. Geçmiş eylemler panelde ve kronikte saklanır.

## Senaryolar

Her senaryo tüm dünyayı kapsar; haritadaki her ülke oynanabilir. Öne çıkan uluslar elle ayarlanmış lider, başkent ve
ilişkilere sahiptir; diğerleri harita verisinden otomatik oluşturulur.

| Yıl  | Senaryo                      | Ülke | Öne çıkan olaylar                                                         |
| ---- | ---------------------------- | ---- | ------------------------------------------------------------------------- |
| 1453 | Konstantinopolis'in Düşüşü   | ~115 | Bizans'ın yardım çağrısı, Konstantinopolis Kuşatması, Castillon, Matbaa   |
| 1815 | Yüz Gün                      | ~285 | Kartal Yeniden Uçuyor, Takovo Ayaklanması, Waterloo, Yazsız Yıl           |
| 1914 | Büyük Savaş'ın Eşiği         | ~95  | Saraybosna Suikastı, Seferberlik, Schlieffen Planı, Goeben, Londra Antl.  |
| 2026 | Günümüz                      | ~195 | Finans krizi, deprem, siber saldırı, yapay zekâ devrimi, enerji krizi, erken seçim, uzay programı |

**Günümüz (2026) senaryosu** kurgusal bir oyun senaryosudur: lider adları ve ilişkiler yaklaşık olarak senaryo başlangıcına
göre ayarlanmıştır ve gerçek kişilerin görüşlerini temsil etmez. Bu senaryoda ittifaklar (NATO gibi) savunma paktıdır:
müttefikler saldırı savaşlarınıza yalnızca hedefe zaten düşmanlarsa katılır.

Tarihî olaylarda yapay zekâ gerçek tarihteki seçimi yapar; siz o ulusu yönetiyorsanız karar sizindir. Örneğin Bizans
olarak Sultan'a haraç öderseniz kuşatma hiç gerçekleşmez; 1914'te Avusturya ültimatom vermezse Büyük Savaş başlamayabilir.

## Kabul kriterleri → uygulama

| AC  | Karşılanma şekli | Kod | Test |
| --- | ---------------- | --- | ---- |
| 1.1 | Ana menüde dört dönem kartı (yıl, başlık, açıklama, ulus sayısı) | `ui.js` `showMenu`, `scenarios.js` | `AC 1.1` |
| 1.2 | Seçilen dönemin haritasında bir ülkeye tıklama ya da lider listesinden seçme | `ui.js` `renderPick`, `map.js` | `AC 1.2` |
| 1.3 | Seçim panelinde hazine, aylık gelir, eyalet, gelişim, istikrar, vergi; ordu, insan gücü, güç sırası; müttefikler, savaşlar, ticaret, dostlar, rakipler, komşular ve zorluk tahmini | `engine.js` `summary` | `AC 1.3` |
| 2.1 | **Ekonomi** sekmesi: vergi kaydırıcısı (anlık istikrar önizlemesi), bütçe dökümü, 4 üretim odağı (Tarım/Sanayi/Ticaret/Askerî, 180 gün bekleme), ticaret anlaşmaları, şenlik. Eyalet kartında **yapılar**: Pazar, Kışla, Kale, Mabet | `setTax`, `setFocus`, `proposeTrade`, `build`, `budget` | `AC 2.1` ×3, `economy.test.js` |
| 2.2 | **Diplomasi** sekmesi: ittifak öner/boz, ticaret, hediye, savaş ilanı (onay penceresinde sonuç önizlemesi), barış (beyaz barış / tazminat iste / tazminat öde). Yapay zekâ ilişki ve savaş skoruna göre kabul ya da ret eder; savunma ittifakları otomatik devreye girer | `proposeAlliance`, `declareWar`, `offerPeace` | `AC 2.2` ×4 |
| 2.3 | Her karar bir sonuç bildirimi gösterir: savaş ilanı istikrarı düşürür, komşular saldırganlık nedeniyle tavır alır, ateşkes ihlali ağır cezalıdır; vergi, ittifak bozma, hediye, ticaret ilişkileri ve istikrarı değiştirir. "Diplomatik harita" modu komşuların tutumunu renklerle gösterir | `engine.js`, `map.js` `colorOf` | `AC 2.3` ×2 |
| 3.1 | Üst çubukta duraklat + 3 hız; boşluk ve 1–3 kısayolları; olay geldiğinde zaman otomatik durur | `setSpeed`, `ui.js` `_loop` | `AC 3.1` ×2 |
| 3.2 | Haritadaki ordular eyaletleri kuşatır; kuşatma bitince eyalet anında el değiştirir. Eyalet rengi, ülke sınırları, etiketler ve başkentler yeniden çizilir, fethedilen eyalet parlar. Düşman toprakları taralı, kuşatmalar ilerleme çubuğuyla gösterilir | `armies.js`, `transferProvince`, `MapView` | `AC 3.2` ×2, `armies.test.js` |
| 4.1 | Aylık %50 şansla (en az 60 gün arayla) rastgele olay; ayrıca tarihe bağlı olaylar. Olay penceresi oyunu duraklatır | `events.js` `checkRandom`, `checkScheduled` | `AC 4.1` ×2 |
| 4.2 | 48 olayın tamamında en az 2 (bazılarında 3) seçenek; her seçeneğin etkisi önceden gösterilir, bazılarının sonucu zarla belirlenir | `events.js` `apply`, `preview` | `AC 4.2` ×3 |

## Hikâyeniz: hedefler, kronik ve senaryo sonu

User Story'nin *"kendi imparatorluğumu ve hikâyemi yaratabileyim"* kısmı için:

- **Hedefler:** Her ulusun "senaryo sonuna kadar ayakta kal" ve "sınırlarını genişlet" hedefleri vardır. 34 ulusun ayrıca tarihî
  hedefleri bulunur (ör. Osmanlı: Konstantinopolis, Belgrad, Karaman; Fransa 1914: Alsas-Loren). Hedefler ulus seçerken görünür,
  oyun sırasında *Ülke* sekmesinde ilerlemesi izlenir.
- **Kronik:** Savaşlar, barışlar, olay kararları, kayıp/fethedilen başkentler ve tamamlanan hedefler *Günlük → Kroniğim*
  bölümünde kişisel bir zaman çizelgesi olarak birikir.
- **Senaryo sonu:** 1453 → 1520, 1815 → 1850, 1914 → 1925, 2026 → 2036. Bitişte (ya da yenilgide) tarih puanı, rütbe
  (*Unutulan Hanedan … Efsanevi İmparatorluk*), hedefler ve kronik gösterilir; isterseniz oynamaya devam edebilirsiniz.

## Eyaletler ve yapılar

- **Eyalet adları:** ~400 şehir haritaya yerleştirilir; adı döneme göre değişir (1453'te *Konstantinopolis*, sonra *İstanbul*;
  1914'te *Budapeşte*; Sankt Peterburg ve Odessa henüz kurulmadıysa yoktur). Diğer eyaletler en yakın şehrin "yöresi" olarak anılır.
  Fetih, kuşatma ve ordu bildirimleri eyalet adlarını kullanır.
- **Yapılar:** Kendi eyaletinize tıklayınca açılan kartta inşa edilir; her eyalette her türden bir tane olabilir, inşaat 120–180 gün sürer.

  | Yapı | Etki | Maliyet |
  | ---- | ---- | ------- |
  | 🏪 Pazar | Aylık altın +(0,5 + gelişim × 0,06) | 40 + gelişim × 2 |
  | ⛺ Kışla | Aylık insan gücü +(300 + gelişim × 40), en fazla insan gücü +5.000 | 55 + gelişim × 2 |
  | 🏰 Kale | Kuşatma +25 gün, savunan ordu +%15, soyut savaşta direnç; ayda 0,6 altın bakım | 90 |
  | ⛪ Mabet | İstikrar hedefi +1,5 (en fazla +9) | 60 + gelişim × 3 |

  Fethedilen eyaletin yapıları yeni sahibine geçer, yarım kalan inşaat iptal olur; kuşatma altındaki eyalette inşaat yapılamaz.
  Kaleler haritada işaretlidir. Yapay zekâ da barış zamanında artan altınını yapılara yatırır.

## Ordular ve kuşatmalar

Oyuncunun dahil olduğu savaşlar haritada somut ordularla yürür:

- **Ordu simgeleri** (asker sayısıyla) eyaletlerde durur. Bir orduyu seçin (simgesine ya da *Ordu* sekmesindeki listeye tıklayın),
  sonra hedef eyalete tıklayın: rota çizilir ve ordu yürür. Seçili orduya tekrar tıklamak seçimi bırakır ve bulunduğu eyaleti açar. Tarafsız ülkelere giriş yoktur; müttefik ve düşman toprakları geçilebilir.
- **Meydan muharebesi:** Düşman ordularıyla aynı eyalette karşılaşınca savaş olur (güç oranı, ordu kalitesi, kendi toprağında %25 avantaj).
  Yenilen ordu dağılır ve geri çekilir; kaçacak yeri yoksa teslim olur.
- **Kuşatma:** Düşman eyaletinde duran ordu kuşatma başlatır. Süre gelişime, başkent olup olmamasına ve ordunun büyüklüğüne bağlıdır.
  Kuşatma bitince eyalet el değiştirir. Kuşatmayı yalnızca kuşatanın yenilgisi bozar. Eyaletiniz kuşatılırsa bildirim gelir.
- **Otomatik komuta:** Ordular varsayılan olarak cephe duruşuna göre kendi kendine hareket eder (saldır, kuşat, kuşatmayı kaldır,
  güçlü düşmandan kaç). Emir verdiğiniz ordu manuel kontrole geçer; *Ordu* sekmesinden geri alınabilir. Ordular bölünüp birleştirilebilir.
- Toplanan ya da kaybedilen askerler ordulara otomatik yansır. Yapay zekâ ile yapay zekâ arasındaki savaşlar performans için
  soyut cephe modeliyle sürer; birden çok cephede savaşan bir yapay zekâ ulusu haritaya ordusunun yalnızca oyuncuya düşen payını çıkarır.

## Oyun mekaniği özeti

- **Harita:** Gerçek dünya kıyı çizgileri ve dönemin gerçek sınırları (bkz. *Harita verileri*). Her ülke büyüklüğüne göre
  eyaletlere bölünür (dünya genelinde 1.800–2.700 eyalet). Sahipsiz topraklara **koloni** kurulabilir (komşu toprak 120 gün,
  okyanus aşırı kıyı 240 gün ve iki kat maliyet).
- **Ekonomi:** Gelir = gelişim × vergi × istikrar çarpanı + ticaret − ordu bakımı. Hazine eksiye düşerse askerler firar eder.
- **İstikrar:** Vergi, savaş sayısı, savaş yorgunluğu ve üretim odağına göre bir hedefe doğru ayda en fazla 3 puan kayar.
- **Savaş (yapay zekâ savaşları ve otomatik komuta):** Ordular cephelere duruşa göre bölünür. *Taarruz* orduyu o cepheye yoğunlaştırır, daha sık saldırır ve daha çok toprak
  alır ama daha çok kayıp verir; *Savunma* tahkimatla düşman saldırılarını zorlaştırır. Muharebeyi güç oranı, ordu kalitesi ve
  savunma avantajı belirler. Başkentler surlarla korunur, son kale daha da zor düşer. Tüm topraklarını kaybeden ulus yok olur.
- **Altın harcama:** İnsan gücü tükendiğinde *paralı asker* (3 kat pahalı) kiralanabilir; *şenlik* yılda bir altın karşılığında
  istikrar kazandırır.
- **Yapay zekâ:** Asker toplar, cephe duruşu seçer, zayıf ve sevmediği komşularına savaş açar, kaybederken barış ister,
  kazanırken şartlarını dayatır (ikisi de size olay olarak gelir), dostlarıyla ticaret ve ittifak kurar, size ittifak teklif edebilir.
- **Kayıt:** Oyun tarayıcıya kaydedilir (`localStorage`); ana menüden devam edilebilir.

## Denge testi

Öne çıkan (elle ayarlanmış) her ulus, gerçek dünya haritasında 10 yıl boyunca iki farklı botla otomatik oynatıldı:

| Oyuncu tipi | 1453 hayatta kalan | 1815 | 1914 | 2026 |
| ----------- | ------------------ | ---- | ---- | ---- |
| Aktif bot (vergi/istikrar dengesi, asker, barış, cephe duruşu, pazar yatırımı, ticaret) | 31/32 | 29/30 | 24/25 | 32/33 |
| Pasif bot (hiçbir karar vermez; ordular otomatik komutada) | 22/32 | 26/30 | 22/25 | 30/33 |

Yani kararlar belirleyici, ama hareketsiz kalan büyük devletler de birkaç yılda çökmez.

En zor başlangıçlar küçük devletlerdir: 1453 Venedik ve Gürcistan, 1815 Toskana, 1914 Sırbistan ve Karadağ, 2026 Kuzey Kıbrıs
ve Ermenistan. Aktif bot ortalama 36–40 tarih puanı alıyor (pasif bot 19–36). Bilinen eksik: zengin ülkelerde hazine zamanla
çok büyüyor; altın harcama yolları sonraki bir sürümde artırılmalı.

## Proje yapısı

```
index.html          Ekranlar: menü, harita, yan panel, sohbet/eylem panelleri, olay penceresi
css/style.css       Arayüz stilleri (mobil uyumlu)
data/map-*.js       Derlenmiş harita verileri (eyalet poligonları, komşuluklar, boğazlar, sınır çizgileri)
tools/build-map.js  Harita derleyicisi: kaynak sınırları ızgaraya döker, eyaletlere böler, çizgileri sadeleştirir
js/geo.js           Harita verisini yükler; eyalet grafı, konum sorguları
js/names.js         Ülkelerin Türkçe adları
js/places.js        ~400 şehir ve döneme göre eyalet adları
js/scenarios.js     1453 / 1815 / 1914 / 2026 senaryo verileri
js/engine.js        Oyun durumu: ekonomi, diplomasi, savaş, zaman, kayıt
js/ai.js            Yapay zekâ ulusların aylık kararları
js/events.js        Tarihî, kurgusal ve yapay zekâ kaynaklı olaylar
js/goals.js         Ulus hedefleri, kronik ve senaryo sonu değerlendirmesi
js/armies.js        Haritadaki ordular: yol bulma, yürüyüş, meydan muharebesi, kuşatma, otomatik komuta
js/llm.js           Dil modeli bağlantısı (Google Gemini, OpenAI uyumlu); anahtar yalnızca tarayıcıda
js/diplomacy.js     Diplomatik sohbetler: bağlam, kurallara göre izinler, yedek yanıtlar
js/actions.js       Serbest metinle eylemler: oyun yöneticisi istemi, işlem uygulayıcı, anahtar kelime ayrıştırıcı
js/map.js           SVG harita görünümü (yakınlaştırma, kaydırma, harita modları, ülke adları)
js/ui.js            Menü, ulus seçimi, sekmeler, bildirimler
js/panels.js        Sohbet, eylem ve yapay zekâ ayarları panelleri
tests/              Kabul kriterleri ve ilerleme mekanikleri için Node testleri
```

`engine.js`, `ai.js`, `events.js`, `goals.js`, `armies.js`, `places.js`, `diplomacy.js` ve `actions.js` DOM'a bağımlı değildir;
testler bunları doğrudan Node'da çalıştırır (yapay zekâ yanıtları sahte bir modelle taklit edilir).

## Harita verileri ve lisans

- Kıyı çizgileri ve günümüz sınırları: [Natural Earth](https://www.naturalearthdata.com/) (kamu malı), `world-atlas` paketi aracılığıyla.
- Tarihî sınırlar (1400, 1815, 1914): [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0).
  Tarihî sınır verileri yaklaşıktır; bazı hatalar senaryolarda düzeltilmiştir (ör. 1453'te Konstantinopolis Bizans'tadır).

Tarihî sınır verisi GPL-3.0 lisanslı olduğundan bu proje de **GPL-3.0** ile lisanslanmıştır (bkz. `LICENSE`).

## Sonraki adımlar (öneri)

Modüller ayrı epiklere bölünebilir: ayrıntılı **Savaş Sistemi** (birlik türleri, deniz kuvvetleri, generaller),
**Diplomasi Ekranı** (antlaşma maddeleri, vasallık, barışta toprak iadesi), din/kültur ve isyan sistemi.
