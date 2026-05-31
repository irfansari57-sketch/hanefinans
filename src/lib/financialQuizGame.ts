/**
 * Finansal Quiz — günlük 3 soru oyunu.
 */

import { QUIZ_QUESTIONS, type QuizQuestion } from './quizQuestions';

const STORAGE_KEY = 'fa.financialQuiz.v1';

export interface QuizSubmission {
  date: string;
  questionIds: number[];
  answers: (number | null)[];  // her soruya 0-3 veya henuz cevaplanmadi
  finishedAt?: number;
  points?: number;
  correctCount?: number;
}

interface StoredState {
  [date: string]: QuizSubmission;
}

function load(): StoredState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredState;
  } catch {
    return {};
  }
}

function save(s: StoredState): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* */ }
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date-seeded deterministic 3-soru pick. */
function pickQuestionsForDate(date: string): QuizQuestion[] {
  let seed = 0;
  for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rand = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Fisher-Yates shuffle first 3
  const arr = QUIZ_QUESTIONS.map((q) => q.id);
  for (let i = 0; i < 3; i++) {
    const j = i + Math.floor(rand() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 3).map((id) => QUIZ_QUESTIONS.find((q) => q.id === id)!).filter(Boolean);
}

/** Bugünün soru setini al — yoksa yeni olustur. */
export function getTodaysQuiz(): { submission: QuizSubmission; questions: QuizQuestion[] } {
  const date = todayIso();
  const all = load();
  const questions = pickQuestionsForDate(date);
  if (all[date]) return { submission: all[date], questions };
  const submission: QuizSubmission = {
    date,
    questionIds: questions.map((q) => q.id),
    answers: [null, null, null],
  };
  all[date] = submission;
  save(all);
  return { submission, questions };
}

/** Bir soruya cevap kaydet — finishedAt set edildiyse no-op. */
export function answerQuestion(index: number, optionIdx: number): QuizSubmission {
  const all = load();
  const date = todayIso();
  const sub = all[date] ?? getTodaysQuiz().submission;
  if (sub.finishedAt) return sub;
  if (index < 0 || index >= sub.answers.length) return sub;
  sub.answers[index] = optionIdx;
  all[date] = sub;
  save(all);
  return sub;
}

/** Quiz'i bitir — puan hesabi yapilir. */
export function finishQuiz(): QuizSubmission {
  const all = load();
  const date = todayIso();
  const sub = all[date] ?? getTodaysQuiz().submission;
  if (sub.finishedAt) return sub;
  const questions = pickQuestionsForDate(date);
  let correct = 0;
  for (let i = 0; i < sub.answers.length; i++) {
    if (sub.answers[i] === questions[i]?.correctIdx) correct += 1;
  }
  let points = correct * 10;
  if (correct === 3) points += 25;  // 3/3 bonus
  sub.correctCount = correct;
  sub.points = points;
  sub.finishedAt = Date.now();
  all[date] = sub;
  save(all);
  return sub;
}

export function getHistory(): QuizSubmission[] {
  const all = load();
  return Object.values(all)
    .filter((g) => g.finishedAt != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
}

export function getStats() {
  const h = getHistory();
  const totalCorrect = h.reduce((s, g) => s + (g.correctCount ?? 0), 0);
  const totalQuestions = h.length * 3;
  const points = h.reduce((s, g) => s + (g.points ?? 0), 0);
  let perfectStreak = 0;
  for (let i = 0; i < h.length; i++) {
    if (h[i].correctCount === 3) {
      if (i === perfectStreak) perfectStreak += 1;
    } else break;
  }
  return {
    totalGames: h.length,
    totalCorrect,
    totalQuestions,
    accuracy: totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0,
    totalPoints: points,
    perfectStreak,
  };
}
