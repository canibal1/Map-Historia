/*
 * Map Historia — devlet adlarının Türkçe karşılıkları.
 * Harita verisindeki (İngilizce) adlar burada Türkçeye çevrilir; listede olmayanlar özgün adıyla görünür.
 */
(function (MH) {
  'use strict';

  const MODERN = {
    Afghanistan: 'Afganistan', Albania: 'Arnavutluk', Algeria: 'Cezayir', Andorra: 'Andorra', Angola: 'Angola',
    'Antigua and Barb.': 'Antigua ve Barbuda', Argentina: 'Arjantin', Armenia: 'Ermenistan', Australia: 'Avustralya',
    Austria: 'Avusturya', Azerbaijan: 'Azerbaycan', Bahamas: 'Bahamalar', Bahrain: 'Bahreyn', Bangladesh: 'Bangladeş',
    Barbados: 'Barbados', Belarus: 'Belarus', Belgium: 'Belçika', Belize: 'Belize', Benin: 'Benin', Bhutan: 'Butan',
    Bolivia: 'Bolivya', 'Bosnia and Herz.': 'Bosna-Hersek', Botswana: 'Botsvana', Brazil: 'Brezilya', Brunei: 'Brunei',
    Bulgaria: 'Bulgaristan', 'Burkina Faso': 'Burkina Faso', Burundi: 'Burundi', 'Cabo Verde': 'Yeşil Burun Adaları',
    Cambodia: 'Kamboçya', Cameroon: 'Kamerun', Canada: 'Kanada', 'Central African Rep.': 'Orta Afrika Cumhuriyeti',
    Chad: 'Çad', Chile: 'Şili', China: 'Çin', Colombia: 'Kolombiya', Comoros: 'Komorlar', Congo: 'Kongo',
    'Costa Rica': 'Kosta Rika', Croatia: 'Hırvatistan', Cuba: 'Küba', Cyprus: 'Kıbrıs Rum Yönetimi', Czechia: 'Çekya',
    "Côte d'Ivoire": 'Fildişi Sahili', 'Dem. Rep. Congo': 'Kongo Demokratik Cumhuriyeti', Denmark: 'Danimarka',
    Djibouti: 'Cibuti', Dominica: 'Dominika', 'Dominican Rep.': 'Dominik Cumhuriyeti', Ecuador: 'Ekvador', Egypt: 'Mısır',
    'El Salvador': 'El Salvador', 'Eq. Guinea': 'Ekvator Ginesi', Eritrea: 'Eritre', Estonia: 'Estonya', Ethiopia: 'Etiyopya',
    Fiji: 'Fiji', Finland: 'Finlandiya', France: 'Fransa', Gabon: 'Gabon', Gambia: 'Gambiya', Georgia: 'Gürcistan',
    Germany: 'Almanya', Ghana: 'Gana', Greece: 'Yunanistan', Grenada: 'Grenada', Guatemala: 'Guatemala', Guinea: 'Gine',
    'Guinea-Bissau': 'Gine-Bissau', Guyana: 'Guyana', Haiti: 'Haiti', Honduras: 'Honduras', Hungary: 'Macaristan',
    Iceland: 'İzlanda', India: 'Hindistan', Indonesia: 'Endonezya', Iran: 'İran', Iraq: 'Irak', Ireland: 'İrlanda',
    Israel: 'İsrail', Italy: 'İtalya', Jamaica: 'Jamaika', Japan: 'Japonya', Jordan: 'Ürdün', Kazakhstan: 'Kazakistan',
    Kenya: 'Kenya', Kiribati: 'Kiribati', Kosovo: 'Kosova', Kuwait: 'Kuveyt', Kyrgyzstan: 'Kırgızistan', Laos: 'Laos',
    Latvia: 'Letonya', Lebanon: 'Lübnan', Lesotho: 'Lesotho', Liberia: 'Liberya', Libya: 'Libya', Liechtenstein: 'Lihtenştayn',
    Lithuania: 'Litvanya', Luxembourg: 'Lüksemburg', Macedonia: 'Kuzey Makedonya', Madagascar: 'Madagaskar', Malawi: 'Malavi',
    Malaysia: 'Malezya', Maldives: 'Maldivler', Mali: 'Mali', Malta: 'Malta', 'Marshall Is.': 'Marshall Adaları',
    Mauritania: 'Moritanya', Mauritius: 'Mauritius', Mexico: 'Meksika', Micronesia: 'Mikronezya', Moldova: 'Moldova',
    Monaco: 'Monako', Mongolia: 'Moğolistan', Montenegro: 'Karadağ', Morocco: 'Fas', Mozambique: 'Mozambik', Myanmar: 'Myanmar',
    'N. Cyprus': 'Kuzey Kıbrıs Türk Cumhuriyeti', Namibia: 'Namibya', Nauru: 'Nauru', Nepal: 'Nepal', Netherlands: 'Hollanda',
    'New Zealand': 'Yeni Zelanda', Nicaragua: 'Nikaragua', Niger: 'Nijer', Nigeria: 'Nijerya', 'North Korea': 'Kuzey Kore',
    Norway: 'Norveç', Oman: 'Umman', Pakistan: 'Pakistan', Palau: 'Palau', Palestine: 'Filistin', Panama: 'Panama',
    'Papua New Guinea': 'Papua Yeni Gine', Paraguay: 'Paraguay', Peru: 'Peru', Philippines: 'Filipinler', Poland: 'Polonya',
    Portugal: 'Portekiz', Qatar: 'Katar', Romania: 'Romanya', Russia: 'Rusya', Rwanda: 'Ruanda', 'S. Sudan': 'Güney Sudan',
    'Saint Lucia': 'Saint Lucia', Samoa: 'Samoa', 'San Marino': 'San Marino', 'Saudi Arabia': 'Suudi Arabistan',
    Senegal: 'Senegal', Serbia: 'Sırbistan', Seychelles: 'Seyşeller', 'Sierra Leone': 'Sierra Leone', Singapore: 'Singapur',
    Slovakia: 'Slovakya', Slovenia: 'Slovenya', 'Solomon Is.': 'Solomon Adaları', Somalia: 'Somali', Somaliland: 'Somaliland',
    'South Africa': 'Güney Afrika', 'South Korea': 'Güney Kore', Spain: 'İspanya', 'Sri Lanka': 'Sri Lanka',
    'St. Kitts and Nevis': 'Saint Kitts ve Nevis', 'St. Vin. and Gren.': 'Saint Vincent ve Grenadinler', Sudan: 'Sudan',
    Suriname: 'Surinam', Sweden: 'İsveç', Switzerland: 'İsviçre', Syria: 'Suriye', 'São Tomé and Principe': 'São Tomé ve Príncipe',
    Taiwan: 'Tayvan', Tajikistan: 'Tacikistan', Tanzania: 'Tanzanya', Thailand: 'Tayland', 'Timor-Leste': 'Doğu Timor',
    Togo: 'Togo', Tonga: 'Tonga', 'Trinidad and Tobago': 'Trinidad ve Tobago', Tunisia: 'Tunus', Turkey: 'Türkiye',
    Turkmenistan: 'Türkmenistan', Uganda: 'Uganda', Ukraine: 'Ukrayna', 'United Arab Emirates': 'Birleşik Arap Emirlikleri',
    'United Kingdom': 'Birleşik Krallık', 'United States of America': 'Amerika Birleşik Devletleri', Uruguay: 'Uruguay',
    Uzbekistan: 'Özbekistan', Vanuatu: 'Vanuatu', Vatican: 'Vatikan', Venezuela: 'Venezuela', Vietnam: 'Vietnam',
    'W. Sahara': 'Batı Sahra', Yemen: 'Yemen', Zambia: 'Zambiya', Zimbabwe: 'Zimbabve', eSwatini: 'Esvatini',
  };

  const HISTORICAL = {
    // 1400 / 1453
    'Ottoman Empire': 'Osmanlı Devleti', 'Byzantine Empire': 'Bizans İmparatorluğu', 'Holy Roman Empire': 'Kutsal Roma İmparatorluğu',
    'Kingdom of Hungary': 'Macaristan Krallığı', 'Poland-Lithuania': 'Lehistan-Litvanya', 'Kalmar Union': 'Kalmar Birliği',
    'Teutonic Knights': 'Töton Şövalyeleri', 'English territory': 'İngiltere Krallığı', Scotland: 'İskoçya Krallığı',
    Castile: 'Kastilya Krallığı', 'Aragón': 'Aragon Tacı', Granada: 'Gırnata Emirliği', Navarre: 'Navarra Krallığı',
    Britany: 'Brötanya Dükalığı', 'Papal States': 'Papalık Devleti', Venice: 'Venedik Cumhuriyeti', Sicily: 'Sicilya Krallığı',
    Sardinia: 'Sardinya', Corsica: 'Korsika', Bosnia: 'Bosna Krallığı', 'Principality of Wallachia': 'Eflak Prensliği',
    Moldova: 'Boğdan Prensliği', Trebizond: 'Trabzon İmparatorluğu', 'Seljuk Caliphate': 'Karamanoğulları',
    'Beylik of Aydin': 'Aydınoğulları Beyliği', 'Mamluke Sultanate': 'Memlük Sultanlığı', 'Hafsid Caliphate': 'Hafsîler',
    'Timurid Empire': 'Timur İmparatorluğu', 'Blue Horde': 'Altın Orda', 'White Horde': 'Ak Orda', 'Chagatai Khanate': 'Çağatay Hanlığı',
    'Great Khanate': 'Ming Hanedanı', Novgorod: 'Novgorod ve Rus Knezlikleri', 'Sultanate of Delhi': 'Delhi Sultanlığı',
    'Shogun Japan (Kamakura)': 'Japonya (Aşikaga Şogunluğu)', 'Đại Việt': 'Đại Việt', 'Khmer Empire': 'Khmer İmparatorluğu',
    Tibet: 'Tibet', Mali: 'Mali İmparatorluğu', Ethiopia: 'Habeşistan', 'Kanem-Bornu': 'Kanem-Bornu', Yemen: 'Yemen',
    Muscat: 'Maskat', Hadramaut: 'Hadramut', Makkura: 'Makuria', Alwa: 'Alwa', 'Great Zimbabwe': 'Büyük Zimbabve',
    'Srivijaya Empire': 'Srivijaya', Kediri: 'Majapahit', Cyprus: 'Kıbrıs Krallığı', Georgia: 'Gürcistan Krallığı',
    // 1815
    'Russian Empire': 'Rusya İmparatorluğu', 'Austrian Empire': 'Avusturya İmparatorluğu', Prussia: 'Prusya Krallığı',
    'United Kingdom of Great Britain and Ireland': 'Birleşik Krallık', 'Manchu Empire': 'Çing Hanedanı', 'Maratha Confederacy': 'Maratha Konfederasyonu',
    Persia: 'İran', Turan: 'Hive Hanlığı', 'central Asian khanates': 'Orta Asya Hanlıkları', 'Kingdom of Sardinia': 'Sardinya Krallığı',
    'Kingdom of the Two Sicilies': 'İki Sicilya Krallığı', 'Sweden–Norway': 'İsveç-Norveç', Tuscany: 'Toskana Dükalığı',
    Algiers: 'Cezayir Dayılığı', Tunis: 'Tunus Beyliği', Tripolitania: 'Trablusgarp', Cyrenaica: 'Bingazi', Nejd: 'Necd Emirliği',
    'United States': 'Amerika Birleşik Devletleri', 'Fulani Empire': 'Fulani İmparatorluğu', 'Rattanakosin Kingdom': 'Siyam',
    Burma: 'Burma', Annam: 'Annam', Korea: 'Kore', Bavaria: 'Bavyera Krallığı', Saxony: 'Saksonya Krallığı',
    Hanover: 'Hannover Krallığı', 'Württemberg': 'Württemberg Krallığı', Baden: 'Baden Büyük Dükalığı', Netherlands: 'Hollanda',
    // 1914
    'German Empire': 'Alman İmparatorluğu', 'Austro-Hungarian Empire': 'Avusturya-Macaristan', 'Kingdom of Italy': 'İtalya Krallığı',
    'Empire of Japan': 'Japon İmparatorluğu', Abyssinia: 'Habeşistan', 'Arabia (Nejd)': 'Necd ve Hasa Emirliği', Xinjiang: 'Doğu Türkistan',
  };

  /** Bir devlet anahtarının görünen adı */
  function nameFor(key, year) {
    if (year >= 1990 && MODERN[key]) return MODERN[key];
    return HISTORICAL[key] || MODERN[key] || key;
  }

  MH.names = { nameFor, MODERN, HISTORICAL };
})((globalThis.MH = globalThis.MH || {}));
