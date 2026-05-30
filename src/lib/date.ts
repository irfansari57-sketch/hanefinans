import { format, parseISO, formatDistanceToNowStrict, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';

export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

export const formatDateTR = (iso: string) =>
  format(parseISO(iso), 'd MMM yyyy', { locale: tr });

export const formatDateShort = (iso: string) =>
  format(parseISO(iso), 'd MMM', { locale: tr });

export const formatRelative = (iso: string) => {
  const d = parseISO(iso);
  const diffMin = (Date.now() - d.getTime()) / 60_000;
  if (diffMin < 1) return 'az önce';
  if (diffMin < 60) return `${Math.floor(diffMin)} dk önce`;
  const diffH = diffMin / 60;
  if (diffH < 24) return `${Math.floor(diffH)} sa önce`;
  return formatDistanceToNowStrict(d, { locale: tr, addSuffix: true });
};

export const daysUntil = (iso: string) => {
  const d = parseISO(iso);
  return differenceInDays(d, new Date());
};
