/*
 * Map Historia — eyalet adları.
 * Tarihî şehirler en yakın altıgene yerleştirilir; adı olmayan eyaletler en yakın şehrin
 * "yöresi" olarak anılır. Bazı şehirlerin adı döneme göre değişir ya da henüz kurulmamıştır.
 *
 *   [ad, boylam, enlem, { alt: { yıl: eskiAd }, from: kuruluşYılı }]
 *   alt: { 1700: 'Konstantinopolis' } → 1700'den önceki senaryolarda bu ad kullanılır
 */
(function (MH) {
  'use strict';

  // Önem sırasına göre: aynı altıgene düşen iki şehirden ilk yazılan kazanır
  const CITIES = [
    ['İstanbul', 28.97, 41.01, { alt: { 1700: 'Konstantinopolis' } }],
    ['Paris', 2.35, 48.85], ['Londra', -0.12, 51.5], ['Roma', 12.5, 41.9], ['Viyana', 16.37, 48.21],
    ['Moskova', 37.62, 55.76], ['Madrid', -3.7, 40.42], ['Lizbon', -9.14, 38.72], ['Berlin', 13.4, 52.52],
    ['Kahire', 31.24, 30.04], ['Venedik', 12.33, 45.44], ['Napoli', 14.25, 40.85], ['Milano', 9.19, 45.46],
    ['Buda', 19.04, 47.5, { rename: { 1873: 'Budapeşte' } }], ['Prag', 14.42, 50.08], ['Krakov', 19.94, 50.06],
    ['Stokholm', 18.07, 59.33], ['Kopenhag', 12.57, 55.68], ['Edirne', 26.56, 41.68], ['Belgrad', 20.46, 44.8],
    ['Atina', 23.73, 37.98], ['Selanik', 22.94, 40.64], ['Bükreş', 26.1, 44.43], ['Sofya', 23.32, 42.7],
    ['Sankt Peterburg', 30.31, 59.94, { from: 1703 }], ['Varşova', 21.01, 52.23], ['Kiev', 30.52, 50.45],
    ['Amsterdam', 4.9, 52.37], ['Brüksel', 4.35, 50.85], ['Floransa', 11.25, 43.77], ['Edinburg', -3.19, 55.95],
    ['Dublin', -6.26, 53.35], ['Bern', 7.45, 46.95], ['Münih', 11.58, 48.14], ['Dresden', 13.74, 51.05],
    ['Tunus', 10.18, 36.8], ['Cezayir', 3.06, 36.75], ['Fas', -5.0, 34.03], ['Trablusgarp', 13.19, 32.89],
    ['Şam', 36.29, 33.51], ['Halep', 37.16, 36.2], ['Tiflis', 44.79, 41.72], ['Tebriz', 46.29, 38.08],
    ['Bursa', 29.06, 40.18], ['İzmir', 27.14, 38.42], ['Ankara', 32.85, 39.93], ['Konya', 32.49, 37.87],
    ['Trabzon', 39.72, 41.0], ['Sivas', 37.02, 39.75], ['Kayseri', 35.48, 38.72], ['Erzurum', 41.27, 39.9],
    ['Diyarbakır', 40.23, 37.91], ['Van', 43.38, 38.5], ['Karaman', 33.22, 37.18], ['Antalya', 30.71, 36.89],
    ['Adana', 35.32, 37.0], ['Samsun', 36.33, 41.29], ['Sinop', 35.15, 42.03], ['Kars', 43.1, 40.6],
    ['Kudüs', 35.22, 31.77], ['Beyrut', 35.5, 33.89], ['Musul', 43.13, 36.34], ['İskenderiye', 29.92, 31.2],
    ['Bingazi', 20.07, 32.12], ['Oran', -0.63, 35.7], ['Tilimsan', -1.32, 34.88], ['Rabat', -6.84, 34.02],
    ['Merakeş', -8.0, 31.63], ['Tanca', -5.8, 35.77], ['Kayrevan', 10.1, 35.68], ['Konstantin', 6.61, 36.36],
    ['Sevilla', -5.98, 37.39], ['Gırnata', -3.6, 37.18], ['Toledo', -4.03, 39.86], ['Valensiya', -0.38, 39.47],
    ['Barselona', 2.17, 41.39], ['Saragosa', -0.88, 41.65], ['Valladolid', -4.72, 41.65], ['Santiago', -8.54, 42.88],
    ['Bilbao', -2.93, 43.26], ['Kadiz', -6.29, 36.53], ['Mursiya', -1.13, 37.98], ['Porto', -8.61, 41.15],
    ['Lyon', 4.85, 45.76], ['Marsilya', 5.37, 43.3], ['Bordeaux', -0.57, 44.84], ['Toulouse', 1.44, 43.6],
    ['Nantes', -1.55, 47.22], ['Rouen', 1.1, 49.44], ['Reims', 4.03, 49.26], ['Dijon', 5.04, 47.32],
    ['Strazburg', 7.75, 48.58], ['Orléans', 1.9, 47.9], ['Calais', 1.86, 50.95], ['Brest', -4.49, 48.39],
    ['Bourges', 2.4, 47.08], ['Lille', 3.06, 50.63], ['Anvers', 4.4, 51.22], ['Liège', 5.57, 50.63],
    ['Groningen', 6.57, 53.22], ['York', -1.08, 53.96], ['Bristol', -2.59, 51.45], ['Glasgow', -4.25, 55.86],
    ['Manchester', -2.24, 53.48], ['Cork', -8.47, 51.9], ['Norwich', 1.3, 52.63], ['Aberdeen', -2.1, 57.15],
    ['Galway', -9.05, 53.27], ['Hamburg', 9.99, 53.55], ['Lübeck', 10.68, 53.87], ['Köln', 6.96, 50.94],
    ['Frankfurt', 8.68, 50.11], ['Leipzig', 12.37, 51.34], ['Nürnberg', 11.08, 49.45], ['Stuttgart', 9.18, 48.78],
    ['Hannover', 9.73, 52.37], ['Bremen', 8.8, 53.08], ['Königsberg', 20.51, 54.71], ['Breslau', 17.03, 51.11],
    ['Danzig', 18.65, 54.35], ['Stettin', 14.55, 53.43], ['Magdeburg', 11.63, 52.13], ['Marienburg', 19.03, 54.04],
    ['Zürih', 8.54, 47.37], ['Cenevre', 6.14, 46.2], ['Graz', 15.44, 47.07], ['İnnsbruck', 11.4, 47.27],
    ['Brünn', 16.61, 49.2], ['Pressburg', 17.11, 48.15], ['Kaşa', 21.26, 48.72], ['Debrecen', 21.63, 47.53],
    ['Temeşvar', 21.23, 45.75], ['Kaloşvar', 23.6, 46.77], ['Segedin', 20.15, 46.25], ['Torino', 7.69, 45.07],
    ['Cenova', 8.93, 44.41], ['Bologna', 11.34, 44.49], ['Palermo', 13.36, 38.12], ['Bari', 16.87, 41.12],
    ['Trieste', 13.77, 45.65], ['Trento', 11.12, 46.07], ['Cagliari', 9.11, 39.22], ['Ajaccio', 8.74, 41.92],
    ['Reggio', 15.65, 38.11], ['Ankona', 13.51, 43.62], ['Semendire', 20.93, 44.66], ['Saraybosna', 18.41, 43.86],
    ['Zagreb', 15.98, 45.81], ['Split', 16.44, 43.51], ['Ragusa', 18.09, 42.65], ['Çetine', 18.92, 42.39],
    ['Akçahisar', 19.79, 41.51], ['Üsküp', 21.43, 42.0], ['Filibe', 24.75, 42.15], ['Mistra', 22.37, 37.07],
    ['Yanya', 20.85, 39.67], ['Tırgovişte', 25.46, 44.93], ['Yaş', 27.6, 47.16], ['Suçava', 26.25, 47.65],
    ['Varna', 27.91, 43.21], ['Niş', 21.9, 43.32], ['Vidin', 22.88, 43.99], ['Kandiye', 25.13, 35.34],
    ['Lefkoşa', 33.36, 35.17], ['Antakya', 36.16, 36.2], ['Batum', 41.64, 41.64], ['Vilnius', 25.28, 54.69],
    ['Minsk', 27.56, 53.9], ['Lviv', 24.03, 49.84], ['Novgorod', 31.27, 58.52], ['Riga', 24.1, 56.95],
    ['Reval', 24.75, 59.44], ['Smolensk', 32.05, 54.78], ['Tver', 35.91, 56.86], ['Ryazan', 39.74, 54.63],
    ['Tula', 37.62, 54.19], ['Çaritsin', 44.5, 48.7, { alt: { 1589: 'Saray' } }], ['Bahçesaray', 33.88, 44.75],
    ['Kefe', 35.38, 45.03], ['Azak', 39.42, 47.1], ['Odessa', 30.73, 46.48, { from: 1794 }], ['Harkov', 36.23, 49.99],
    ['Voronej', 39.2, 51.66], ['Oslo', 10.75, 59.91], ['Bergen', 5.32, 60.39], ['Göteborg', 11.97, 57.71],
    ['Turku', 22.27, 60.45], ['Helsinki', 24.94, 60.17, { from: 1550 }], ['Malmö', 13.0, 55.6], ['Aarhus', 10.2, 56.15],
    ['Stavanger', 5.73, 58.97], ['Kalmar', 16.36, 56.66], ['Pskov', 28.33, 57.82], ['Vologda', 39.89, 59.22],
    ['Kursk', 36.19, 51.73], ['Dnipro', 35.04, 48.46, { from: 1776 }], ['Astrahan', 46.0, 46.35],
    // Orta Doğu ve Orta Asya
    ['Bağdat', 44.36, 33.31], ['Basra', 47.78, 30.51], ['Mekke', 39.83, 21.42], ['Medine', 39.61, 24.47], ['Riyad', 46.72, 24.71],
    ['Sana', 44.21, 15.35], ['Aden', 45.03, 12.79], ['Maskat', 58.41, 23.59], ['Kuveyt', 47.98, 29.37], ['Doha', 51.53, 25.29, { from: 1825 }],
    ['Dubai', 55.27, 25.2, { from: 1833 }], ['Tahran', 51.39, 35.69], ['İsfahan', 51.67, 32.65], ['Şiraz', 52.54, 29.59], ['Meşhed', 59.6, 36.3],
    ['Herat', 62.2, 34.35], ['Kabil', 69.17, 34.53], ['Kandahar', 65.7, 31.61], ['Semerkant', 66.96, 39.65], ['Buhara', 64.42, 39.77],
    ['Taşkent', 69.24, 41.3], ['Hive', 60.36, 41.38], ['Merv', 61.83, 37.6], ['Bakü', 49.87, 40.41], ['Erivan', 44.51, 40.18],
    ['Amman', 35.93, 31.95, { from: 1878 }], ['Tel Aviv', 34.78, 32.08, { from: 1909 }], ['Gazze', 34.47, 31.5], ['Almatı', 76.9, 43.24, { from: 1854 }], ['Astana', 71.43, 51.13, { from: 1830 }],
    ['Bişkek', 74.59, 42.87, { from: 1825 }], ['Duşanbe', 68.77, 38.56, { from: 1900 }], ['Aşkabat', 58.38, 37.95, { from: 1881 }],
    ['Orenburg', 55.1, 51.77, { from: 1743 }], ['Kazan', 49.11, 55.8], ['Samara', 50.1, 53.2, { from: 1586 }], ['Perm', 56.25, 58.01, { from: 1723 }],
    ['Yekaterinburg', 60.6, 56.84, { from: 1723 }], ['Omsk', 73.37, 54.99, { from: 1716 }], ['Novosibirsk', 82.92, 55.03, { from: 1893 }],
    ['Tobolsk', 68.25, 58.2, { from: 1587 }], ['Tomsk', 84.95, 56.48, { from: 1604 }], ['Krasnoyarsk', 92.87, 56.01, { from: 1628 }],
    ['İrkutsk', 104.3, 52.29, { from: 1661 }], ['Yakutsk', 129.73, 62.03, { from: 1632 }], ['Vladivostok', 131.89, 43.12, { from: 1860 }],
    ['Habarovsk', 135.07, 48.48, { from: 1858 }], ['Magadan', 150.8, 59.57, { from: 1929 }], ['Arhangelsk', 40.52, 64.54, { from: 1584 }],
    ['Murmansk', 33.08, 68.97, { from: 1916 }], ['Norilsk', 88.2, 69.35, { from: 1935 }], ['Anadır', 177.5, 64.73, { from: 1889 }],
    // Güney ve Doğu Asya
    ['Delhi', 77.21, 28.61], ['Mumbai', 72.88, 19.08], ['Kalküta', 88.36, 22.57, { from: 1690 }], ['Madras', 80.27, 13.08, { from: 1639 }],
    ['Haydarabad', 78.47, 17.39], ['Bangalor', 77.59, 12.97], ['Ahmedabad', 72.57, 23.02], ['Lahor', 74.34, 31.55], ['Karaçi', 67.01, 24.86],
    ['Peşaver', 71.58, 34.01], ['İslamabad', 73.05, 33.68, { from: 1960, alt: { 1900: 'Ravalpindi' } }], ['Dakka', 90.41, 23.81], ['Katmandu', 85.32, 27.72],
    ['Kolombo', 79.86, 6.93], ['Lhasa', 91.17, 29.65], ['Kaşgar', 75.99, 39.47], ['Urumçi', 87.62, 43.83], ['Pekin', 116.4, 39.9],
    ['Şanghay', 121.47, 31.23], ['Nanking', 118.8, 32.06], ['Kanton', 113.26, 23.13], ['Şian', 108.94, 34.34], ['Çengdu', 104.07, 30.57],
    ['Vuhan', 114.31, 30.59], ['Kunming', 102.83, 24.88], ['Mukden', 123.43, 41.8], ['Harbin', 126.53, 45.8, { from: 1898 }],
    ['Lanzhou', 103.83, 36.06], ['Hohhot', 111.65, 40.84], ['Ulan Bator', 106.92, 47.92], ['Karakurum', 102.83, 47.2],
    ['Seul', 126.98, 37.57], ['Pyongyang', 125.75, 39.03], ['Tokyo', 139.69, 35.69, { alt: { 1868: 'Edo' } }], ['Kyoto', 135.77, 35.01],
    ['Osaka', 135.5, 34.69], ['Sapporo', 141.35, 43.06, { from: 1868 }], ['Fukuoka', 130.4, 33.59], ['Taipei', 121.56, 25.03],
    ['Hanoi', 105.85, 21.03], ['Saygon', 106.66, 10.76], ['Hue', 107.59, 16.46], ['Phnom Penh', 104.92, 11.56], ['Vientiane', 102.63, 17.98],
    ['Bangkok', 100.5, 13.76, { alt: { 1782: 'Ayutthaya' } }], ['Rangun', 96.2, 16.84], ['Mandalay', 96.08, 21.96, { from: 1857 }],
    ['Malakka', 102.25, 2.19], ['Kuala Lumpur', 101.69, 3.14, { from: 1857 }], ['Singapur', 103.82, 1.35, { from: 1819 }],
    ['Batavya', 106.85, -6.21, { from: 1619, rename: { 1945: 'Cakarta' } }], ['Surabaya', 112.75, -7.25], ['Makassar', 119.42, -5.14],
    ['Manila', 120.98, 14.6], ['Cebu', 123.89, 10.32], ['Brunei', 114.94, 4.89], ['Port Moresby', 147.18, -9.44, { from: 1873 }],
    // Afrika
    ['Hartum', 32.53, 15.5, { from: 1821 }], ['Addis Ababa', 38.74, 9.03, { from: 1886 }], ['Gondar', 37.47, 12.6],
    ['Mogadişu', 45.32, 2.05], ['Mombasa', 39.67, -4.04], ['Nairobi', 36.82, -1.29, { from: 1899 }], ['Kampala', 32.58, 0.35],
    ['Zanzibar', 39.19, -6.16], ['Darüsselam', 39.28, -6.79, { from: 1862 }], ['Kigali', 30.06, -1.94], ['Kinşasa', 15.31, -4.32, { from: 1881 }],
    ['Luanda', 13.23, -8.84], ['Lusaka', 28.32, -15.39, { from: 1905 }], ['Harare', 31.05, -17.83, { from: 1890 }], ['Maputo', 32.57, -25.97],
    ['Johannesburg', 28.05, -26.2, { from: 1886 }], ['Kap Kasabası', 18.42, -33.92, { from: 1652 }], ['Durban', 31.03, -29.86, { from: 1835 }],
    ['Windhoek', 17.08, -22.56, { from: 1840 }], ['Antananarivo', 47.52, -18.88], ['Lagos', 3.38, 6.52], ['Kano', 8.52, 12.0],
    ['Akra', -0.19, 5.6], ['Kumasi', -1.62, 6.69], ['Abican', -4.02, 5.36], ['Dakar', -17.47, 14.72, { from: 1857 }], ['Bamako', -8.0, 12.64],
    ['Timbuktu', -3.0, 16.77], ['Niamey', 2.11, 13.51], ['Ndjamena', 15.04, 12.13, { from: 1900 }], ['Freetown', -13.23, 8.48, { from: 1792 }],
    ['Monrovia', -10.8, 6.3, { from: 1822 }], ['Douala', 9.7, 4.05], ['Libreville', 9.45, 0.39, { from: 1849 }], ['Bangui', 18.56, 4.36, { from: 1889 }],
    ['Agadez', 7.99, 16.97], ['Gao', -0.04, 16.27], ['Asmara', 38.93, 15.32], ['Cibuti', 43.15, 11.59, { from: 1888 }], ['Nuakşot', -15.98, 18.09, { from: 1958 }],
    ['Elizabethville', 27.48, -11.66, { from: 1910, rename: { 1966: 'Lubumbaşi' } }], ['Kisangani', 25.19, 0.52, { from: 1883 }],
    // Amerika
    ['Washington', -77.04, 38.9, { from: 1790 }], ['New York', -74.01, 40.71, { from: 1625, alt: { 1664: 'Yeni Amsterdam' } }],
    ['Boston', -71.06, 42.36, { from: 1630 }], ['Philadelphia', -75.17, 39.95, { from: 1682 }], ['Chicago', -87.63, 41.88, { from: 1833 }],
    ['New Orleans', -90.07, 29.95, { from: 1718 }], ['St. Louis', -90.2, 38.63, { from: 1764 }], ['Houston', -95.37, 29.76, { from: 1836 }],
    ['Dallas', -96.8, 32.78, { from: 1841 }], ['Denver', -104.99, 39.74, { from: 1858 }], ['Los Angeles', -118.24, 34.05, { from: 1781 }],
    ['San Francisco', -122.42, 37.77, { from: 1776 }], ['Seattle', -122.33, 47.61, { from: 1851 }], ['Phoenix', -112.07, 33.45, { from: 1868 }],
    ['Miami', -80.19, 25.76, { from: 1896 }], ['Atlanta', -84.39, 33.75, { from: 1837 }], ['Minneapolis', -93.27, 44.98, { from: 1856 }],
    ['Salt Lake City', -111.89, 40.76, { from: 1847 }], ['Anchorage', -149.9, 61.22, { from: 1914 }], ['Juneau', -134.42, 58.3, { from: 1880 }],
    ['Montreal', -73.57, 45.5, { from: 1642 }], ['Quebec', -71.21, 46.81, { from: 1608 }], ['Toronto', -79.38, 43.65, { from: 1793 }],
    ['Ottawa', -75.7, 45.42, { from: 1826 }], ['Winnipeg', -97.14, 49.9, { from: 1873 }], ['Vancouver', -123.12, 49.28, { from: 1886 }],
    ['Calgary', -114.07, 51.05, { from: 1875 }], ['Edmonton', -113.49, 53.55, { from: 1795 }], ['Halifax', -63.57, 44.65, { from: 1749 }],
    ['Meksiko', -99.13, 19.43, { alt: { 1521: 'Tenochtitlan' } }], ['Guadalajara', -103.35, 20.66, { from: 1542 }], ['Monterrey', -100.32, 25.69, { from: 1596 }],
    ['Havana', -82.37, 23.11, { from: 1519 }], ['Santo Domingo', -69.93, 18.49, { from: 1496 }], ['Port-au-Prince', -72.34, 18.59, { from: 1749 }],
    ['Guatemala', -90.51, 14.63, { from: 1776 }], ['Panama', -79.52, 8.98, { from: 1519 }], ['Bogota', -74.07, 4.71, { from: 1538 }],
    ['Caracas', -66.9, 10.48, { from: 1567 }], ['Quito', -78.47, -0.18], ['Lima', -77.04, -12.05, { from: 1535 }], ['Cusco', -71.97, -13.53],
    ['La Paz', -68.15, -16.5, { from: 1548 }], ['Santiago de Chile', -70.67, -33.45, { from: 1541 }], ['Buenos Aires', -58.38, -34.6, { from: 1580 }],
    ['Montevideo', -56.16, -34.9, { from: 1724 }], ['Asuncion', -57.58, -25.26, { from: 1537 }], ['Rio de Janeiro', -43.17, -22.91, { from: 1565 }],
    ['São Paulo', -46.63, -23.55, { from: 1554 }], ['Salvador', -38.5, -12.97, { from: 1549 }], ['Recife', -34.88, -8.05, { from: 1537 }],
    ['Manaus', -60.02, -3.12, { from: 1669 }], ['Belem', -48.5, -1.46, { from: 1616 }], ['Brasilia', -47.88, -15.79, { from: 1960 }],
    ['Cordoba', -64.19, -31.42, { from: 1573 }], ['Mendoza', -68.83, -32.89, { from: 1561 }], ['Punta Arenas', -70.91, -53.16, { from: 1848 }],
    // Okyanusya
    ['Sidney', 151.21, -33.87, { from: 1788 }], ['Melbourne', 144.96, -37.81, { from: 1835 }], ['Brisbane', 153.03, -27.47, { from: 1825 }],
    ['Perth', 115.86, -31.95, { from: 1829 }], ['Adelaide', 138.6, -34.93, { from: 1836 }], ['Darwin', 130.84, -12.46, { from: 1869 }],
    ['Kanberra', 149.13, -35.28, { from: 1913 }], ['Hobart', 147.33, -42.88, { from: 1804 }], ['Alice Springs', 133.88, -23.7, { from: 1888 }],
    ['Auckland', 174.76, -36.85, { from: 1840 }], ['Wellington', 174.78, -41.29, { from: 1840 }], ['Suva', 178.44, -18.14, { from: 1882 }],
    ['Honolulu', -157.86, 21.31],
  ];

  const cache = new Map();

  function nameFor(entry, year) {
    const [name, , , opt = {}] = entry;
    if (opt.from && year < opt.from) return null;
    for (const [before, old] of Object.entries(opt.alt || {})) if (year < Number(before)) return old;
    let current = name;
    for (const [since, renamed] of Object.entries(opt.rename || {})) if (year >= Number(since)) current = renamed;
    return current;
  }

  /** Bir harita ve yıl için eyalet → { names, city } tablosu */
  function table(grid, year) {
    const key = grid.source + ':' + year;
    if (cache.has(key)) return cache.get(key);
    const { provinces } = grid;
    const city = new Array(provinces.length).fill(null);
    const placed = [];
    const km = (p, lon, lat) => {
      const k = Math.cos((lat * Math.PI) / 180);
      return Math.hypot((p.lon - lon) * k, p.lat - lat) * 111.32;
    };
    for (const entry of CITIES) {
      const name = nameFor(entry, year);
      if (!name) continue;
      // Şehri içeren eyalet; bulunamazsa merkezi en yakın eyalet (en fazla 260 km)
      let pid = grid.containingNear ? grid.containingNear(entry[1], entry[2]) : -1;
      if (pid < 0) {
        pid = grid.nearest(entry[1], entry[2]);
        if (km(provinces[pid], entry[1], entry[2]) > 260) continue;
      }
      // Eyalet başka bir şehre aitse en yakın boş komşuya kaydır
      if (city[pid]) {
        const free = provinces[pid].neighbors.filter((n) => !city[n]).sort((a, b) => km(provinces[a], entry[1], entry[2]) - km(provinces[b], entry[1], entry[2]));
        if (!free.length || km(provinces[free[0]], entry[1], entry[2]) > 260) continue;
        pid = free[0];
      }
      city[pid] = name;
      placed.push(pid);
    }
    const names = provinces.map((p) => {
      if (city[p.id]) return city[p.id];
      let best = null;
      let bestD = Infinity;
      for (const c of placed) {
        const d = km(provinces[c], p.lon, p.lat);
        if (d < bestD) { bestD = d; best = c; }
      }
      return best !== null && bestD < 450 ? city[best] + ' yöresi' : null;
    });
    const t = { names, city };
    cache.set(key, t);
    return t;
  }

  /** Eyaletin adı ("Belgrad", "Belgrad yöresi" ya da "<Ulus> taşrası") */
  function nameOf(game, pid) {
    const t = table(game.grid, game.scenario.year);
    if (t.names[pid]) return t.names[pid];
    const owner = game.state.owner[pid];
    return owner ? game.nation(owner).name + ' taşrası' : 'Sahipsiz topraklar';
  }

  function isCity(game, pid) {
    return !!table(game.grid, game.scenario.year).city[pid];
  }

  // Şehrin önem sırası (listede ne kadar öndeyse o kadar önemli)
  const RANK = new Map();
  CITIES.forEach((c, i) => {
    RANK.set(c[0], i);
    for (const v of Object.values(c[3]?.alt || {})) RANK.set(v, i);
    for (const v of Object.values(c[3]?.rename || {})) RANK.set(v, i);
  });
  const rank = (name) => RANK.get(name) ?? 1e9;

  MH.places = { CITIES, nameOf, isCity, table, rank };
})((globalThis.MH = globalThis.MH || {}));
