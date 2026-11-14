// Types shared by server and client. No answer data lives here.

export const CATEGORY_IDS = [
  "animals", "geography", "countries", "history", "science", "technology", "programming",
  "games", "movies", "music", "food", "sports", "astronomy", "space", "transport",
  "internet", "memes", "nature", "literature", "general",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export type Lang = "uk" | "ru";
export type Loc = { uk: string; ru: string };

export const RARITY_TIERS = ["common", "uncommon", "interesting", "rare", "veryRare", "extreme", "exceptional"] as const;
export type RarityTier = (typeof RARITY_TIERS)[number];
export const TIER_POINTS: Record<RarityTier, number> = {
  common: 10, uncommon: 25, interesting: 50, rare: 85, veryRare: 150, extreme: 200, exceptional: 250,
};

export const AVATAR_KINDS = ["astro", "moon", "alien", "planet", "robot", "comet", "octo", "star"] as const;
export type AvatarKind = (typeof AVATAR_KINDS)[number];
// monochrome tones: players are told apart by silhouette + name; tone only shifts brightness slightly
export const PLAYER_COLORS = ["#FFFFFF", "#D9D9D9", "#EDEDED", "#C4C4C4", "#F5F5F5", "#B5B5B5", "#E3E3E3", "#CFCFCF"];

export type GameMode = "classic" | "potato";
export type Visibility = "live" | "hidden";

export interface RoomSettings {
  mode: GameMode;
  rounds: 0 | 5 | 10 | 15 | 20; // 0 = endless
  timer: 10 | 15 | 20 | 30 | 45;
  categories: CategoryId[]; // empty = all
  visibility: Visibility;
  earlyEnd: boolean;
  lives: number; // potato mode
  difficulty: 1 | 2 | 3; // max question difficulty: 1 = easy only
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: AvatarKind;
  color: string;
  ready: boolean;
  host: boolean;
  online: boolean;
  score: number;
  // in-round state
  typing: boolean;
  answered: boolean;
  liveText?: string; // only in live visibility
  textLen: number;
  // potato
  lives: number;
  shards: number;
  out: boolean;
}

export type Phase = "lobby" | "intro" | "question" | "reveal" | "finished" | "potato";

export interface QuestionPublic {
  id: string;
  category: CategoryId;
  difficulty: number;
  text: Loc;
  answerCount: number;
}

export interface RevealEntry {
  playerId: string;
  answer: Loc | null;
  tier: RarityTier | null;
  points: number;
  total: number;
  share: number | null; // estimated popularity share (0..1)
}

export interface RoundSummary {
  round: number;
  question: QuestionPublic;
  entries: RevealEntry[];
  topAnswers: { label: Loc; tier: RarityTier }[]; // a few example common answers
}

export interface EndStats {
  ranking: { playerId: string; name: string; avatar: AvatarKind; color: string; score: number; correct: number; bestRound: number; bestRoundPoints: number }[];
  rarest: { playerId: string; name: string; answer: Loc; points: number; tier: RarityTier } | null;
}

export interface PotatoState {
  holderId: string | null;
  question: QuestionPublic | null;
  used: Loc[];
  sequence: number;
  lastPass: { from: string; to: string; answer: Loc; tier: RarityTier } | null;
  startedAt: number; // fuse started (server ms); end is secret
  explodedId: string | null;
  winnerId: string | null;
}

export interface RoomSnapshot {
  code: string;
  phase: Phase;
  settings: RoomSettings;
  players: PublicPlayer[];
  round: number;
  totalRounds: number;
  question: QuestionPublic | null;
  endsAt: number | null; // server ms timestamp
  reveal: RoundSummary | null;
  end: EndStats | null;
  potato: PotatoState | null;
  serverNow: number;
}

export type MatchKind = "exact" | "alias" | "translit" | "typo" | "morph" | "phrase" | "phonetic";
export interface PreviewResult {
  status: "match" | "ambiguous" | "none" | "empty";
  input: string;
  answer?: { id: string; label: Loc };
  kind?: MatchKind;
  options?: { id: string; label: Loc }[];
}

export type SubmitResult =
  | { ok: true; answer: { id: string; label: Loc } }
  | { ok: false; reason: "notFound" | "wrongLetter" | "ambiguous" | "already" | "closed" | "used" | "rate" | "notYourTurn"; options?: { id: string; label: Loc }[] };

export const ERROR_CODES = ["roomNotFound", "roomFull", "badName", "notHost", "notEnoughPlayers", "notReady", "inProgress", "rate"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
