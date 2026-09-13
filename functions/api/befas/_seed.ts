/**
 * BEFAS BES fonlari seed listesi — kural olarak kod + isim + kurucu.
 * TEFAS/BEFAS'in bot koruma nedeniyle Cloudflare Workers'tan cekilemedigi durumlarda
 * kullanicilara bos ekran gostermek yerine bu curated listeyi kullaniriz.
 *
 * NAV/getiri bilgisi burada YOK; Python cron tefas.json'a yazinca primary path
 * bu seed'i override eder.
 *
 * Kaynak: EGM BEFAS resmi liste (fon-listesi sayfasi manuel derleme, Eylul 2026).
 * Kurucu adlari resmi tam unvan; kod ve fon adi resmi TEFAS kayitlariyla ayni.
 */

export interface BesSeedFund {
  code: string;
  name: string;
  founder: string;
  besKategori: string; // Hisse Senedi / Değişken / Katılım Standart / Altın / Standart / Para Piyasası
}

export const BES_SEED: BesSeedFund[] = [
  // ==== Kuveyt Türk Katılım Emeklilik (KUVEYT TÜRK PORTFÖY) ====
  { code: 'KEA', name: 'ALTIN KATILIM EMEKLİLİK YATIRIM FONU',                          founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'Altın' },
  { code: 'KEB', name: 'BÜYÜME KATILIM DEĞİŞKEN EMEKLİLİK YATIRIM FONU',                founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'Değişken' },
  { code: 'KEG', name: 'KATILIM DEĞİŞKEN GRUP EMEKLİLİK YATIRIM FONU',                  founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'Değişken' },
  { code: 'KEH', name: 'KATILIM HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',                   founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'Hisse Senedi' },
  { code: 'KEI', name: 'KATILIM STANDART EMEKLİLİK YATIRIM FONU',                       founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'Standart' },
  { code: 'KEK', name: 'MUHAFAZAKAR KATILIM DEĞİŞKEN EMEKLİLİK YATIRIM FONU',           founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'Değişken' },
  { code: 'KEO', name: 'KATILIM DEĞİŞKEN EMEKLİLİK YATIRIM FONU',                       founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'Değişken' },
  { code: 'KEP', name: 'KATILIM KATKI EMEKLİLİK YATIRIM FONU',                          founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'Standart' },
  { code: 'KTG', name: 'OKS KATILIM DEĞİŞKEN GRUP EMEKLİLİK YATIRIM FONU',              founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'OKS Standart' },
  { code: 'KTJ', name: 'OKS ATAK KATILIM DEĞİŞKEN EMEKLİLİK YATIRIM FONU',              founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'OKS Standart' },
  { code: 'KTL', name: 'OKS BAŞLANGIÇ KATILIM EMEKLİLİK YATIRIM FONU',                  founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'OKS Standart' },
  { code: 'KTP', name: 'OKS KATILIM STANDART EMEKLİLİK YATIRIM FONU',                   founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'OKS Standart' },
  { code: 'KZH', name: 'ALTIN KATILIM EMEKLİLİK YATIRIM FONU (GRUP)',                   founder: 'Katılım Emeklilik ve Hayat A.Ş.', besKategori: 'Altın' },

  // ==== AVIVASA / Anadolu Hayat Emeklilik ====
  { code: 'AH1', name: 'ANADOLU HAYAT DEĞİŞKEN EMEKLİLİK YATIRIM FONU',                  founder: 'Anadolu Hayat Emeklilik A.Ş.',                besKategori: 'Değişken' },
  { code: 'AH2', name: 'ANADOLU HAYAT HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',              founder: 'Anadolu Hayat Emeklilik A.Ş.',                besKategori: 'Hisse Senedi' },
  { code: 'AVJ', name: 'BAŞLANGIÇ KATILIM EMEKLİLİK YATIRIM FONU',                       founder: 'Agesa Hayat ve Emeklilik A.Ş.',               besKategori: 'Standart' },
  { code: 'AYJ', name: 'OKS KATILIM STANDART EMEKLİLİK YATIRIM FONU',                    founder: 'Agesa Hayat ve Emeklilik A.Ş.',               besKategori: 'OKS Standart' },

  // ==== Ak Emeklilik ====
  { code: 'AE1', name: 'AK EMEKLİLİK PARA PİYASASI EMEKLİLİK YATIRIM FONU',              founder: 'AvivaSA Emeklilik ve Hayat A.Ş.',             besKategori: 'Para Piyasası' },
  { code: 'AE2', name: 'AK EMEKLİLİK STANDART EMEKLİLİK YATIRIM FONU',                   founder: 'AvivaSA Emeklilik ve Hayat A.Ş.',             besKategori: 'Standart' },
  { code: 'AE3', name: 'AK EMEKLİLİK HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',               founder: 'AvivaSA Emeklilik ve Hayat A.Ş.',             besKategori: 'Hisse Senedi' },

  // ==== Garanti Emeklilik ====
  { code: 'GEA', name: 'GARANTİ EMEKLİLİK STANDART EMEKLİLİK YATIRIM FONU',              founder: 'Garanti Emeklilik ve Hayat A.Ş.',             besKategori: 'Standart' },
  { code: 'GEB', name: 'GARANTİ EMEKLİLİK DEĞİŞKEN EMEKLİLİK YATIRIM FONU',              founder: 'Garanti Emeklilik ve Hayat A.Ş.',             besKategori: 'Değişken' },
  { code: 'GEH', name: 'GARANTİ EMEKLİLİK HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',          founder: 'Garanti Emeklilik ve Hayat A.Ş.',             besKategori: 'Hisse Senedi' },
  { code: 'GEK', name: 'GARANTİ EMEKLİLİK KATILIM STANDART EMEKLİLİK YATIRIM FONU',      founder: 'Garanti Emeklilik ve Hayat A.Ş.',             besKategori: 'Katılım' },
  { code: 'GES', name: 'GARANTİ EMEKLİLİK ALTIN EMEKLİLİK YATIRIM FONU',                 founder: 'Garanti Emeklilik ve Hayat A.Ş.',             besKategori: 'Altın' },

  // ==== Ziraat Emeklilik / Ziraat Katılım Emeklilik ====
  { code: 'ZKD', name: 'ZİRAAT KATILIM EMEKLİLİK DEĞİŞKEN EMEKLİLİK YATIRIM FONU',       founder: 'Ziraat Hayat ve Emeklilik A.Ş.',              besKategori: 'Değişken' },
  { code: 'ZKH', name: 'ZİRAAT KATILIM EMEKLİLİK HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',   founder: 'Ziraat Hayat ve Emeklilik A.Ş.',              besKategori: 'Hisse Senedi' },
  { code: 'ZKI', name: 'ZİRAAT KATILIM EMEKLİLİK STANDART EMEKLİLİK YATIRIM FONU',       founder: 'Ziraat Hayat ve Emeklilik A.Ş.',              besKategori: 'Standart' },
  { code: 'ZKA', name: 'ZİRAAT KATILIM EMEKLİLİK ALTIN EMEKLİLİK YATIRIM FONU',          founder: 'Ziraat Hayat ve Emeklilik A.Ş.',              besKategori: 'Altın' },

  // ==== Bereket Emeklilik (BER) ====
  { code: 'AGA', name: 'BEREKET ALTIN KATILIM EMEKLİLİK YATIRIM FONU',                   founder: 'Bereket Emeklilik ve Hayat A.Ş.',             besKategori: 'Altın' },
  { code: 'AGB', name: 'BEREKET BÜYÜME KATILIM DEĞİŞKEN EMEKLİLİK YATIRIM FONU',         founder: 'Bereket Emeklilik ve Hayat A.Ş.',             besKategori: 'Değişken' },
  { code: 'AGD', name: 'BEREKET KATILIM STANDART EMEKLİLİK YATIRIM FONU',                 founder: 'Bereket Emeklilik ve Hayat A.Ş.',             besKategori: 'Standart' },
  { code: 'AGG', name: 'BEREKET KATILIM DEĞİŞKEN GRUP EMEKLİLİK YATIRIM FONU',           founder: 'Bereket Emeklilik ve Hayat A.Ş.',             besKategori: 'Değişken' },
  { code: 'AGH', name: 'BEREKET KATILIM HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',            founder: 'Bereket Emeklilik ve Hayat A.Ş.',             besKategori: 'Hisse Senedi' },
  { code: 'AGM', name: 'BEREKET MUHAFAZAKAR KATILIM DEĞİŞKEN EMEKLİLİK YATIRIM FONU',    founder: 'Bereket Emeklilik ve Hayat A.Ş.',             besKategori: 'Değişken' },

  // ==== AXA Hayat ve Emeklilik ====
  { code: 'AJY', name: 'OKS ATAK KATILIM DEĞİŞKEN EMEKLİLİK YATIRIM FONU',                founder: 'AXA Hayat ve Emeklilik A.Ş.',                 besKategori: 'OKS Standart' },
  { code: 'AJZ', name: 'OKS AGRESİF KATILIM DEĞİŞKEN EMEKLİLİK YATIRIM FONU',             founder: 'AXA Hayat ve Emeklilik A.Ş.',                 besKategori: 'OKS Standart' },

  // ==== Vakıf Emeklilik ====
  { code: 'VEB', name: 'VAKIF EMEKLİLİK DEĞİŞKEN EMEKLİLİK YATIRIM FONU',                 founder: 'Vakıf Emeklilik ve Hayat A.Ş.',               besKategori: 'Değişken' },
  { code: 'VEH', name: 'VAKIF EMEKLİLİK HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',             founder: 'Vakıf Emeklilik ve Hayat A.Ş.',               besKategori: 'Hisse Senedi' },
  { code: 'VEK', name: 'VAKIF EMEKLİLİK KATILIM STANDART EMEKLİLİK YATIRIM FONU',         founder: 'Vakıf Emeklilik ve Hayat A.Ş.',               besKategori: 'Katılım' },
  { code: 'VES', name: 'VAKIF EMEKLİLİK STANDART EMEKLİLİK YATIRIM FONU',                 founder: 'Vakıf Emeklilik ve Hayat A.Ş.',               besKategori: 'Standart' },
  { code: 'VEA', name: 'VAKIF EMEKLİLİK ALTIN EMEKLİLİK YATIRIM FONU',                    founder: 'Vakıf Emeklilik ve Hayat A.Ş.',               besKategori: 'Altın' },

  // ==== NN Emeklilik / BNP Paribas Cardif Emeklilik ====
  { code: 'NNH', name: 'NN HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',                          founder: 'NN Hayat ve Emeklilik A.Ş.',                  besKategori: 'Hisse Senedi' },
  { code: 'NND', name: 'NN DEĞİŞKEN EMEKLİLİK YATIRIM FONU',                              founder: 'NN Hayat ve Emeklilik A.Ş.',                  besKategori: 'Değişken' },
  { code: 'NNK', name: 'NN KATILIM STANDART EMEKLİLİK YATIRIM FONU',                      founder: 'NN Hayat ve Emeklilik A.Ş.',                  besKategori: 'Katılım' },

  // ==== Allianz Hayat ve Emeklilik ====
  { code: 'ALH', name: 'ALLIANZ HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',                     founder: 'Allianz Yaşam ve Emeklilik A.Ş.',             besKategori: 'Hisse Senedi' },
  { code: 'ALD', name: 'ALLIANZ DEĞİŞKEN EMEKLİLİK YATIRIM FONU',                         founder: 'Allianz Yaşam ve Emeklilik A.Ş.',             besKategori: 'Değişken' },
  { code: 'ALS', name: 'ALLIANZ STANDART EMEKLİLİK YATIRIM FONU',                         founder: 'Allianz Yaşam ve Emeklilik A.Ş.',             besKategori: 'Standart' },

  // ==== Halk Hayat ve Emeklilik ====
  { code: 'HKD', name: 'HALK HAYAT DEĞİŞKEN EMEKLİLİK YATIRIM FONU',                      founder: 'Halk Hayat ve Emeklilik A.Ş.',                besKategori: 'Değişken' },
  { code: 'HKH', name: 'HALK HAYAT HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',                  founder: 'Halk Hayat ve Emeklilik A.Ş.',                besKategori: 'Hisse Senedi' },
  { code: 'HKS', name: 'HALK HAYAT STANDART EMEKLİLİK YATIRIM FONU',                      founder: 'Halk Hayat ve Emeklilik A.Ş.',                besKategori: 'Standart' },

  // ==== Fiba Emeklilik ====
  { code: 'FEH', name: 'FİBA EMEKLİLİK HİSSE SENEDİ EMEKLİLİK YATIRIM FONU',              founder: 'Fiba Emeklilik ve Hayat A.Ş.',                besKategori: 'Hisse Senedi' },
  { code: 'FED', name: 'FİBA EMEKLİLİK DEĞİŞKEN EMEKLİLİK YATIRIM FONU',                  founder: 'Fiba Emeklilik ve Hayat A.Ş.',                besKategori: 'Değişken' },
];
