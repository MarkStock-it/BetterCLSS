export const DEFAULT_STUDY_DURATIONS = { work: 25, break: 5, long: 15 };
export const STUDY_DURATION_PROFILES = {
  Quick: { work: 15, break: 5, long: 10 },
  Balanced: DEFAULT_STUDY_DURATIONS,
  Deep: { work: 50, break: 10, long: 20 }
};
export const MODE_CAROUSEL_SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.82 };

export function readStudyDurations() {
  try {
    const stored = JSON.parse(localStorage.getItem('bclss_study_durations') || '{}');
    const candidate = {
      work: Number(stored.work) || DEFAULT_STUDY_DURATIONS.work,
      break: Number(stored.break) || DEFAULT_STUDY_DURATIONS.break,
      long: Number(stored.long) || DEFAULT_STUDY_DURATIONS.long
    };
    return Object.values(STUDY_DURATION_PROFILES).find((profile) => (
      profile.work === candidate.work && profile.break === candidate.break && profile.long === candidate.long
    )) || DEFAULT_STUDY_DURATIONS;
  } catch {
    return DEFAULT_STUDY_DURATIONS;
  }
}

export function readCustomSessions() {
  try {
    const stored = JSON.parse(localStorage.getItem('bclss_custom_sessions') || '[]');
    return Array.isArray(stored)
      ? stored
        .map((session) => ({
          id: String(session.id || ''),
          label: String(session.label || '').trim().slice(0, 40),
          minutes: Math.max(1, Math.min(120, Number(session.minutes) || 25)),
          custom: true,
          icon: 'tag'
        }))
        .filter((session) => session.id && session.label)
      : [];
  } catch {
    return [];
  }
}
