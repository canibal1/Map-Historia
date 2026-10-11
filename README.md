# Map Historia

Tarayıcıda çalışan, altıgen haritalı bir **alternatif tarih büyük strateji** oyunu. Bir dönem seçin, bir ulusun başına geçin,
vergiden ittifaklara, savaştan barışa kadar her kararla tarihin akışını değiştirin.

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
npm run build      # dist/map-historia.html: tek dosyalık, paylaşılabilir sürüm
```

Çevrimiçi sürüm `gh-pages` dalındaki tek dosyadır (`index.html` = `dist/map-historia.html`). Güncellemek için
`npm run build` çalıştırıp bu dosyayı `gh-pages` dalına `index.html` olarak gönderin.

**Kısayollar:** `Boşluk` duraklat/devam · `1` `2` `3` hız · `Esc` ordu seçimini bırak · fare tekerleği yakınlaştır · sürükle kaydır.

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
| 2.1 | **Ekonomi** sekmesi: vergi kaydırıcısı (anlık istikrar önizlemesi), bütçe dökümü, 4 üretim odağı (Tarım/Sanayi/Ticaret/Askerî, 180 gün bekleme), ticaret anlaşmaları, şenlik. Eyalet kartında **yapılar**: Pazar, Kışla, Kale, Mabet | `setTax`, `setFocus`, `proposeTrade`, `build`, `budget` | `AC 2.1` ×3, `economy.test.js` |
| 2.2 | **Diplomasi** sekmesi: ittifak öner/boz, ticaret, hediye, savaş ilanı (onay penceresinde sonuç önizlemesi), barış (beyaz barış / tazminat iste / tazminat öde). Yapay zekâ ilişki ve savaş skoruna göre kabul ya da ret eder; savunma ittifakları otomatik devreye girer | `proposeAlliance`, `declareWar`, `offerPeace` | `AC 2.2` ×4 |
| 2.3 | Her karar bir sonuç bildirimi gösterir: savaş ilanı istikrarı düşürür, komşular saldırganlık nedeniyle tavır alır, ateşkes ihlali ağır cezalıdır; vergi, ittifak bozma, hediye, ticaret ilişkileri ve istikrarı değiştirir. "Diplomatik harita" modu komşuların tutumunu renklerle gösterir | `engine.js`, `map.js` `colorOf` | `AC 2.3` ×2 |
| 3.1 | Üst çubukta duraklat + 3 hız; boşluk ve 1–3 kısayolları; olay geldiğinde zaman otomatik durur | `setSpeed`, `ui.js` `_loop` | `AC 3.1` ×2 |
| 3.2 | Haritadaki ordular eyaletleri kuşatır; kuşatma bitince eyalet anında el değiştirir. Altıgen rengi, ülke sınırları, etiketler ve başkentler yeniden çizilir, fethedilen eyalet parlar. Düşman toprakları taralı, kuşatmalar ilerleme çubuğuyla gösterilir | `armies.js`, `transferProvince`, `MapView` | `AC 3.2` ×2, `armies.test.js` |
| 4.1 | Aylık %50 şansla (en az 60 gün arayla) rastgele olay; ayrıca tarihe bağlı olaylar. Olay penceresi oyunu duraklatır | `events.js` `checkRandom`, `checkScheduled` | `AC 4.1` ×2 |
| 4.2 | 38 olayın tamamında en az 2 (bazılarında 3) seçenek; her seçeneğin etkisi önceden gösterilir, bazılarının sonucu zarla belirlenir | `events.js` `apply`, `preview` | `AC 4.2` ×3 |

## Hikâyeniz: hedefler, kronik ve senaryo sonu

User Story'nin *"kendi imparatorluğumu ve hikâyemi yaratabileyim"* kısmı için:

- **Hedefler:** Her ulusun "senaryo sonuna kadar ayakta kal" ve "sınırlarını genişlet" hedefleri vardır. 34 ulusun ayrıca tarihî
  hedefleri bulunur (ör. Osmanlı: Konstantinopolis, Belgrad, Karaman; Fransa 1914: Alsas-Loren). Hedefler ulus seçerken görünür,
  oyun sırasında *Ülke* sekmesinde ilerlemesi izlenir.
- **Kronik:** Savaşlar, barışlar, olay kararları, kayıp/fethedilen başkentler ve tamamlanan hedefler *Günlük → Kroniğim*
  bölümünde kişisel bir zaman çizelgesi olarak birikir.
- **Senaryo sonu:** 1453 → 1520, 1815 → 1850, 1914 → 1925. Bitişte (ya da yenilgide) tarih puanı, rütbe
  (*Unutulan Hanedan … Efsanevi İmparatorluk*), hedefler ve kronik gösterilir; isterseniz oynamaya devam edebilirsiniz.

## Eyaletler ve yapılar

- **Eyalet adları:** ~200 tarihî şehir haritaya yerleştirilir; adı döneme göre değişir (1453'te *Konstantinopolis*, sonra *İstanbul*;
  1914'te *Budapeşte*; Sankt Peterburg ve Odessa henüz kurulmadıysa yoktur). Diğer eyaletler en yakın şehrin "yöresi" olarak anılır.
  Fetih, kuşatma ve ordu bildirimleri eyalet adlarını kullanır.
- **Yapılar:** Kendi eyaletinize tıklayınca açılan kartta inşa edilir; her eyalette her türden bir tane olabilir, inşaat 120–180 gün sürer.

  | Yapı | Etki | Maliyet |
  | ---- | ---- | ------- |
  | 🏪 Pazar | Aylık altın +(0,5 + gelişim × 0,25) | 50 + gelişim × 5 |
  | ⛺ Kışla | Aylık insan gücü +(300 + gelişim × 100), en fazla insan gücü +5.000 | 55 + gelişim × 2 |
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

- **Harita:** Avrupa, Kuzey Afrika ve Yakın Doğu yaklaşık 940 altıgen eyalete bölünür. Ülke sınırları her senaryoda
  başkentlerden ve tarihî tohum noktalarından genişleyen ağırlıklı bir yayılımla oluşturulur (aynı senaryo hep aynı haritayla başlar).
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

Her senaryodaki her ulus, 15 yıl boyunca iki farklı botla otomatik oynatıldı:

| Oyuncu tipi | 1453 hayatta kalan | 1815 | 1914 |
| ----------- | ------------------ | ---- | ---- |
| Aktif bot (vergi/istikrar dengesi, asker, barış, cephe duruşu, pazar yatırımı) | 47/48 | 27/28 | 17–20/22 |
| Pasif bot (hiçbir karar vermez; ordular otomatik komutada) | 28/48 | 15/28 | 16/22 |

Yani kararlar belirleyici, ama hareketsiz kalan büyük devletler de birkaç yılda çökmez. En zor başlangıçlar: 1914 Karadağ ve
Belçika, 1453 Arnavutluk ve Bizans, 1815 Saksonya. Aktif bot ortalama 29–35 tarih puanı alıyor.

## Proje yapısı

```
index.html          Ekranlar: menü, harita, yan panel, olay penceresi
css/style.css       Arayüz stilleri (mobil uyumlu)
js/geo.js           Kıyı poligonları, altıgen ızgara, komşuluk ve boğaz bağlantıları
js/places.js        Tarihî şehirler ve döneme göre eyalet adları
js/scenarios.js     1453 / 1815 / 1914 senaryo verileri
js/engine.js        Oyun durumu: ekonomi, diplomasi, savaş, zaman, kayıt
js/ai.js            Yapay zekâ ulusların aylık kararları
js/events.js        Tarihî, kurgusal ve yapay zekâ kaynaklı olaylar
js/goals.js         Ulus hedefleri, kronik ve senaryo sonu değerlendirmesi
js/armies.js        Haritadaki ordular: yol bulma, yürüyüş, meydan muharebesi, kuşatma, otomatik komuta
js/map.js           SVG harita görünümü (yakınlaştırma, kaydırma, harita modları)
js/ui.js            Menü, ulus seçimi, sekmeler, bildirimler
tests/              Kabul kriterleri ve ilerleme mekanikleri için Node testleri
```

`engine.js`, `ai.js`, `events.js`, `goals.js`, `armies.js` ve `places.js` DOM'a bağımlı değildir; testler bunları doğrudan Node'da çalıştırır.

## Sonraki adımlar (öneri)

Modüller ayrı epiklere bölünebilir: ayrıntılı **Savaş Sistemi** (birlik türleri, deniz kuvvetleri, generaller),
**Diplomasi Ekranı** (antlaşma maddeleri, vasallık, barışta toprak iadesi), din/kültur ve isyan sistemi.
