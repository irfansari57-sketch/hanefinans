/**
 * Warmer'ın periyodik olarak ısıttığı sembol listesi.
 *
 * Kaynak: src/data/bistAll.ts + src/data/kapSlugs.ts (KAP BIST şirketler)
 * birleşimi, dedupe edilmiş, 4-5 char alfa-only ticker filter'ından geçmiş.
 * Toplam: 819 + 5 endeks.
 *
 * BIST sembolleri Yahoo'da '.IS' suffix'i alır — index.ts içinde eklenir.
 * Yahoo'da olmayan ticker'lar 404 alır, otomatik elenir (kod: if (res.ok) write).
 */

export const BIST_SYMBOLS: readonly string[] = [
  'AAGYO', 'ACSEL', 'ADAY', 'ADEL', 'ADESE', 'ADGYO', 'ADLVY', 'AEFES',
  'AFYON', 'AGESA', 'AGHOL', 'AGROT', 'AGYO', 'AHGAZ', 'AHSGY', 'AKBNK',
  'AKCNS', 'AKCVR', 'AKDFA', 'AKENR', 'AKFEN', 'AKFGY', 'AKFIS', 'AKFK',
  'AKFYE', 'AKGRT', 'AKHAN', 'AKMEN', 'AKMERK', 'AKMGY', 'AKSA', 'AKSAN',
  'AKSEN', 'AKSFA', 'AKSGY', 'AKSIS', 'AKSUE', 'AKTIF', 'AKYHO', 'ALARK',
  'ALBRK', 'ALCAR', 'ALCTL', 'ALFAS', 'ALGYO', 'ALJF', 'ALKA', 'ALKIM',
  'ALKLC', 'ALMAD', 'ALNUS', 'ALTIN', 'ALTNY', 'ALVES', 'ANACM', 'ANELE',
  'ANGEN', 'ANHYT', 'ANIL', 'ANSGR', 'ARASE', 'ARCLK', 'ARDYZ', 'AREN',
  'ARENA', 'ARFYE', 'ARMDA', 'ARMGD', 'ARSAN', 'ARSEN', 'ARSVY', 'ARTMS',
  'ARZUM', 'ASELS', 'ASGYO', 'ASLAN', 'ASTOR', 'ASUZU', 'ATAGY', 'ATAKP',
  'ATATP', 'ATATR', 'ATAVK', 'ATAYM', 'ATEKS', 'ATLAS', 'ATLFA', 'ATSYH',
  'AVGYO', 'AVHOL', 'AVISA', 'AVOD', 'AVPGY', 'AVTUR', 'AYDEM', 'AYEN',
  'AYGAZ', 'AYMA', 'AZTEK', 'BAGFS', 'BAHKM', 'BAKAB', 'BAKIM', 'BAKIR',
  'BAKIS', 'BALAT', 'BALIK', 'BALSU', 'BANVT', 'BAREM', 'BASCM', 'BASER',
  'BASGZ', 'BASIM', 'BAYRK', 'BEGYO', 'BERA', 'BESLR', 'BESTE', 'BETON',
  'BEYAZ', 'BFREN', 'BIENY', 'BIGCH', 'BIGEN', 'BIGTK', 'BILGI', 'BIMAS',
  'BINBN', 'BINHO', 'BIOEN', 'BIRKO', 'BITKI', 'BIZIM', 'BJKAS', 'BLCYT',
  'BLKOM', 'BLSMD', 'BLUME', 'BMSCH', 'BMSTL', 'BNPPI', 'BNTAS', 'BORLS',
  'BORSK', 'BOSSA', 'BRGAN', 'BRGFK', 'BRISA', 'BRKO', 'BRKSN', 'BRKT',
  'BRKVY', 'BRLSM', 'BRMEN', 'BRSAN', 'BRYAT', 'BSOKE', 'BTCIM', 'BUCIM',
  'BULGS', 'BURCE', 'BURVA', 'BVSAN', 'BYDNR', 'CAGFA', 'CANTE', 'CASA',
  'CATES', 'CCOLA', 'CELHA', 'CELIK', 'CEMAS', 'CEMTS', 'CEMZY', 'CEOEM',
  'CEPHE', 'CGCAM', 'CIMSA', 'CLEBI', 'CLKMT', 'CMBTN', 'CMENT', 'CMNTA',
  'CMSAN', 'CONSE', 'COSMO', 'COZUM', 'CRDFA', 'CRFSA', 'CUSAN', 'CVKMD',
  'CWENE', 'DAGI', 'DAMGA', 'DAMLA', 'DAPGM', 'DARDL', 'DCTTR', 'DEGER',
  'DEMIR', 'DENCM', 'DENET', 'DENFA', 'DENGE', 'DENIZ', 'DERHL', 'DERIM',
  'DESA', 'DESPC', 'DETAY', 'DEVA', 'DFKTR', 'DGATE', 'DGGYO', 'DGNMO',
  'DGRVK', 'DIMES', 'DIRIT', 'DITAS', 'DKVRL', 'DMRGD', 'DMSAS', 'DNFIN',
  'DNISI', 'DNYVA', 'DOAS', 'DOCO', 'DOFER', 'DOFRB', 'DOGAN', 'DOGRU',
  'DOGUB', 'DOHOL', 'DOKTA', 'DSTKF', 'DSYAT', 'DUNYA', 'DURKN', 'DVRLK',
  'DYBNK', 'DYOBY', 'DZGYO', 'EBEBK', 'ECILC', 'ECOGR', 'ECZIP', 'ECZYT',
  'EDATA', 'EDIP', 'EFOR', 'EGEEN', 'EGEGY', 'EGEPO', 'EGGUB', 'EGPRO',
  'EGSER', 'EGYO', 'EKER', 'EKGYO', 'EKIZ', 'EKOFA', 'EKOS', 'EKSUN',
  'EKTVK', 'ELITE', 'ELYAF', 'EMIRV', 'EMKEL', 'EMNIS', 'EMPAE', 'EMTIA',
  'EMVAR', 'ENDAE', 'ENERY', 'ENJSA', 'ENKAI', 'ENPRA', 'ENSRI', 'ENTRA',
  'EPLAS', 'ERBOS', 'ERCB', 'EREGL', 'EREN', 'ERGLI', 'ERSAN', 'ERSU',
  'ESCAR', 'ESCOM', 'ESEN', 'ETILR', 'ETYAT', 'EUHOL', 'EUKYO', 'EUPWR',
  'EUREN', 'EUYO', 'EXIMB', 'EYGYO', 'FADE', 'FBBNK', 'FENER', 'FIRCA',
  'FKPET', 'FLAP', 'FMIZP', 'FONET', 'FORMT', 'FORTE', 'FRIGO', 'FRMPL',
  'FROTO', 'FUZUL', 'FZLGY', 'GARAN', 'GARFA', 'GARFL', 'GATEG', 'GEDIK',
  'GEDIZ', 'GEDZA', 'GENIL', 'GENKM', 'GENTS', 'GEREL', 'GESAN', 'GGBVK',
  'GIMAT', 'GIPTA', 'GIYIM', 'GLBMD', 'GLCVY', 'GLRMK', 'GLRYH', 'GLYHO',
  'GMTAS', 'GOKNR', 'GOLTS', 'GOODY', 'GORUS', 'GOZDE', 'GRNYO', 'GRSEL',
  'GRTHO', 'GRTRK', 'GRUP', 'GSDDE', 'GSDHO', 'GSIPD', 'GSRAY', 'GUBRF',
  'GUNDG', 'GUNES', 'GUNEY', 'GUSGR', 'GWIND', 'GYVAR', 'GZNMI', 'HABER',
  'HALKB', 'HALKF', 'HALKI', 'HALKS', 'HATAY', 'HATEK', 'HATSN', 'HAYAL',
  'HAYVK', 'HAZIR', 'HDFFL', 'HDFGS', 'HDFVK', 'HDFYB', 'HEKIM', 'HEKTS',
  'HITIT', 'HKTM', 'HLGYO', 'HLVKS', 'HOROZ', 'HRKET', 'HUBVC', 'HUNER',
  'HURGZ', 'HUZFA', 'ICBCT', 'ICUGS', 'IDEAS', 'IDGYO', 'IEYHO', 'IHEVA',
  'IHGZT', 'IHLAS', 'IHLGM', 'IHYAY', 'IMASM', 'INDES', 'INFO', 'INGRM',
  'INTEK', 'INTEM', 'INVAZ', 'INVEO', 'INVES', 'IPEKE', 'IRFAN', 'ISATR',
  'ISBIR', 'ISCTR', 'ISDMR', 'ISFAK', 'ISFIN', 'ISGSY', 'ISGYO', 'ISIK',
  'ISKPL', 'ISMEN', 'ISSEN', 'ISTFK', 'ISTVY', 'ISYAT', 'IZENR', 'IZFAS',
  'IZINV', 'IZMDC', 'JANTS', 'KAGIT', 'KAPLM', 'KARAR', 'KAREL', 'KARSN',
  'KARSU', 'KARTN', 'KARYE', 'KATMR', 'KATVK', 'KAYSE', 'KBORU', 'KCAER',
  'KCHOL', 'KENT', 'KERVN', 'KERVT', 'KFEIN', 'KFILO', 'KGYO', 'KILER',
  'KIMMR', 'KIMYA', 'KIRAC', 'KLGYO', 'KLIMA', 'KLKIM', 'KLMSN', 'KLNMA',
  'KLRHO', 'KLSER', 'KLSYN', 'KLVKS', 'KMPUR', 'KNFRT', 'KNTFA', 'KOCFN',
  'KOCMT', 'KONKA', 'KONTR', 'KONYA', 'KOPOL', 'KOPUK', 'KORAY', 'KORDS',
  'KORTS', 'KOTON', 'KOZAA', 'KPMG', 'KPTGY', 'KRDMA', 'KRDMB', 'KRDMD',
  'KRGYO', 'KRONT', 'KRPLS', 'KRSTL', 'KRTEK', 'KRVGD', 'KSFIN', 'KSTUR',
  'KTKVK', 'KTLEV', 'KTSKR', 'KTSVK', 'KUTPO', 'KUVVA', 'KUYAS', 'KZBGY',
  'KZGYO', 'LIDER', 'LIDFA', 'LILAK', 'LIMAK', 'LIMAN', 'LINK', 'LOGO',
  'LORAS', 'LRSHO', 'LUKSK', 'LXGYO', 'LYDHO', 'LYDYE', 'MAALT', 'MACKO',
  'MAGEN', 'MAKIM', 'MAKTK', 'MALI', 'MANAS', 'MARBL', 'MARKA', 'MARMR',
  'MARTI', 'MAVI', 'MBFTR', 'MCARD', 'MDASM', 'MDIAZ', 'MEDTR', 'MEGA',
  'MEGAP', 'MEGMT', 'MEKAG', 'MEKMD', 'MEPET', 'MERCN', 'MERIT', 'MERKO',
  'METEN', 'METRO', 'METUR', 'MEYSU', 'MEYVE', 'MGROS', 'MHRGY', 'MIATK',
  'MINTF', 'MIPAZ', 'MITRA', 'MMCAS', 'MNDRS', 'MNDTR', 'MNGFA', 'MOBTL',
  'MODEL', 'MOGAN', 'MOMTR', 'MOPAS', 'MPARK', 'MRBAS', 'MRBKF', 'MRDIN',
  'MRGYO', 'MRSHL', 'MSGYO', 'MSYBN', 'MTRKS', 'MTRYO', 'MZHLD', 'NATEN',
  'NETAS', 'NETCD', 'NETHA', 'NIBAS', 'NOTE', 'NRBNK', 'NTGAZ', 'NTHOL',
  'NUGYO', 'NUHCM', 'NURVK', 'OBAMS', 'OBASE', 'ODAS', 'ODINE', 'OFSYM',
  'ONCSM', 'ONDER', 'ONRYT', 'OPET', 'ORCAY', 'ORFIN', 'ORGE', 'ORMAN',
  'OSMEN', 'OSTIM', 'OSVKS', 'OTEL', 'OTKAR', 'OTOKC', 'OTOSR', 'OTTO',
  'OYAKC', 'OYAYO', 'OYLUM', 'OYYAT', 'OZATA', 'OZGYO', 'OZKGY', 'OZRDN',
  'OZYSR', 'PAGYO', 'PAHOL', 'PAMEL', 'PAPIL', 'PARSN', 'PASEU', 'PASHA',
  'PATEK', 'PCILT', 'PEGYO', 'PEKER', 'PEKGY', 'PENGD', 'PENTA', 'PETKM',
  'PETUN', 'PGSUS', 'PINSU', 'PKART', 'PKENT', 'PLTUR', 'PNSUT', 'POLHO',
  'POLTK', 'PRDGS', 'PRFFK', 'PRKAB', 'PRKME', 'PRZMA', 'PSDTC', 'PSGYO',
  'QFINF', 'QNBFB', 'QNBFF', 'QNBFK', 'QNBTR', 'QNBVK', 'QUAGR', 'QUFIN',
  'QYATB', 'QYHOL', 'RALYH', 'RAYSG', 'REEDR', 'RGYAS', 'RHEAG', 'RNPOL',
  'RODRG', 'RTALB', 'RUBNS', 'RUZYE', 'RYGYO', 'RYSAS', 'SAFKR', 'SAHOL',
  'SAMAT', 'SANEL', 'SANFM', 'SANKO', 'SASA', 'SAVUR', 'SAYAS', 'SDTTR',
  'SEGMN', 'SEGYO', 'SEKFK', 'SEKUR', 'SELEC', 'SELGD', 'SELVA', 'SERNT',
  'SERUM', 'SERVE', 'SEYKM', 'SILVR', 'SISE', 'SKBNK', 'SKTAS', 'SKYLP',
  'SKYMD', 'SMART', 'SMMM', 'SMRFA', 'SMRTG', 'SMRVA', 'SNGYO', 'SNICA',
  'SNPAM', 'SODA', 'SODAS', 'SODSN', 'SOKE', 'SOKM', 'SRVGY', 'SUMAS',
  'SUNTK', 'SURGY', 'SUWEN', 'TABGD', 'TAMFA', 'TAPDI', 'TATEN', 'TATGD',
  'TAVHL', 'TBORG', 'TCELL', 'TCRYT', 'TDGYO', 'TEBFA', 'TEHOL', 'TEKTU',
  'TENET', 'TEVKS', 'TEZOL', 'TFNVK', 'TGSAS', 'THYAO', 'TIMUR', 'TKFEN',
  'TKNSA', 'TLMAN', 'TMPOL', 'TMSN', 'TNZTP', 'TOASO', 'TRALT', 'TRBNK',
  'TRCAS', 'TRENJ', 'TRFFA', 'TRGYO', 'TRHOL', 'TRILC', 'TRIVE', 'TRKCM',
  'TRKFN', 'TRKNT', 'TRMET', 'TRYKI', 'TSGYO', 'TSKB', 'TSPOR', 'TTKOM',
  'TTRAK', 'TUCLK', 'TUKAS', 'TUPRS', 'TUREX', 'TURGG', 'TURSG', 'UCAYM',
  'UFUK', 'ULAS', 'ULKER', 'ULUFA', 'ULUSE', 'ULUUN', 'UMPAS', 'UNLU',
  'UNYE', 'USAK', 'VAKBN', 'VAKFA', 'VAKFN', 'VAKKO', 'VAKVK', 'VANET',
  'VANGD', 'VBTYZ', 'VDFAS', 'VDFLO', 'VERTU', 'VERUS', 'VESBE', 'VESTL',
  'VEZIN', 'VISNE', 'VKFYO', 'VKGYO', 'VKING', 'VRGYO', 'YAPRK', 'YATAK',
  'YATAS', 'YATVK', 'YAYLA', 'YBTAS', 'YEOTK', 'YESIL', 'YGGYO', 'YGYO',
  'YIGIT', 'YKBNK', 'YKFIN', 'YKFKT', 'YKGYO', 'YKSLN', 'YKYAT', 'YONGA',
  'YORUM', 'YUNLU', 'YUNSA', 'YYAPI', 'ZEDUR', 'ZERAY', 'ZGYO', 'ZKBVK',
  'ZKBVR', 'ZOREN', 'ZRGYO',
];

/** BIST endeksleri — Yahoo formatında tam sembol */
export const BIST_INDICES: readonly string[] = [
  'XU100.IS', 'XU030.IS', 'XUSIN.IS', 'XUMAL.IS', 'XUTUM.IS',
];

/** BIST sembolüne .IS suffix'i ekle (zaten varsa atla). */
export function toYahooSymbol(s: string): string {
  if (s.includes('.') || s.startsWith('^') || s.includes('=')) return s;
  return `${s}.IS`;
}

/** Warmer'ın quote (range=2d, interval=1d) ısıtacağı tüm semboller. */
export function allWarmupSymbols(): string[] {
  const out: string[] = [];
  for (const s of BIST_SYMBOLS) out.push(toYahooSymbol(s));
  for (const i of BIST_INDICES) out.push(i);
  return out;
}
