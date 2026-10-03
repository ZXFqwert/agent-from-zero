import {blueprintTrialPairs} from './content/blueprintTrials';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  Download,
  Eye,
  Flame,
  FlaskConical,
  HelpCircle,
  Info,
  Lock,
  Map,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Settings2,
  Shield,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  WifiOff,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { createGame, reduceGame } from "./engine";
import type { AgentBlueprint, GameAction, GameState, ScenarioDefinition } from "./engine";
import {prologueIds,finaleIds} from './content/seasonBookends';
import { chapters, factLabels, profiles, scenarios } from "./content/scenarios";
import { chapterOneNpcs } from "./content/chapterOneStory";
import { uiStories } from "./content/stories";
import { getOpeningLines } from "./content/narrative";
import { budgetExplanation, displayFact } from "./content/presentation";
import { chapterComplete, isUnlocked, journeyOrder, nextMission } from "./content/progression";
import CommandDeck from "./components/CommandDeck";
import CityLedger from "./components/CityLedger";
import ChallengeHall from "./components/ChallengeHall";
import LearningAtlas from './components/LearningAtlas';
import BuildReusePicker from './components/BuildReusePicker';
import {challengeNarrative} from './content/challengeNarrative';
import {challengeTemplates, deriveCapabilityGrowth, deriveUnlockedTemplateIds, generateExpedition, type ChallengeSpec, type ExpeditionAction, type ExpeditionSpec} from './challenges';
import {emptyPostSeason, postSeasonScenario, reducePostSeason, validatePostSeason, type PostSeasonAction} from './postSeason';
import {
  downloadSave,
  MAX_SAVE_BYTES,
  emptySave,
  readSave,
  recordCompletion,
  resetCurrentScenario,
  restoreCheckpoint,
  validateSave,
  writeSave,
  type PlayerSave,
} from "./storage";
import { playTone } from "./audio";
import Dialog from "./components/Dialog";
import Workshop from "./components/Workshop";
import Journal from "./components/Journal";
import Lab from "./components/Lab";
const Scene = lazy(() => import("./Scene"));
type Panel =
  | "workshop"
  | "journal"
  | "map"
  | "library"
  | "settings"
  | "victory"
  | "manual"
  | "lab"
  | "hall"
  | "atlas"
  | null;
type InputAction = {
  [K in GameAction["type"]]: Omit<Extract<GameAction, { type: K }>, "id">;
}[GameAction["type"]];
const statusNames: Record<GameState["status"], string> = {
  ready: "等待契约",
  running: "行动中",
  paused: "已暂停",
  stalled: "需要你的帮助",
  exhausted: "预算耗尽",
  won: "契约已履行",
};

/** The selected record supplies both the real scene and its real action log. */
function selectedGame(save: PlayerSave | null) {
  const post = save?.postSeason;
  const mode = post?.selectedMode ?? null;
  const generated = post && mode ? postSeasonScenario(post) : null;
  if (generated && post) {
    const ordinary = post.currentChallenge;
    const expedition = post.activeExpedition;
    const spec = mode === 'challenge' ? ordinary!.spec : expedition!.definition.floors[expedition!.floor];
    return {scenario: generated, state: mode === 'challenge' ? ordinary!.game : expedition!.game,
      actions: mode === 'challenge' ? ordinary!.actions : expedition!.currentActions, mode,
      templateId: spec.templateId, sourceId: challengeTemplates.find(template => template.id === spec.templateId)!.sourceScenarioId};
  }
  const scenario = scenarios.find(s => s.id === save?.currentScenarioId) ?? scenarios[0];
  return {scenario, state: save?.games[scenario.id] ?? createGame(scenario),
    actions: save?.actions[scenario.id] ?? [], mode: null, templateId: null, sourceId: scenario.id};
}

/** Dispatch changes the current attempt number, so only an actual reset changes this part of the key. */
function executionContext(save: PlayerSave | null) {
  const post = save?.postSeason;
  if (post?.selectedMode === 'challenge' && post.currentChallenge) {
    const p = post.currentChallenge;
    return `challenge:${p.spec.templateId}:${p.spec.seed}:${[...p.actions].reverse().find(a => a.type === 'reset')?.id ?? 'start'}`;
  }
  if (post?.selectedMode === 'expedition' && post.activeExpedition) {
    const e = post.activeExpedition;
    return `expedition:${e.definition.id}:${e.floor}:${e.attempts.length}`;
  }
  const id = save?.currentScenarioId ?? scenarios[0].id;
  return `main:${id}:${[...(save?.actions[id] ?? [])].reverse().find(a => a.type === 'reset')?.id ?? 'start'}`;
}

/** Cold starts, imports and navigation append actual pause actions, including hidden post attempts. */
function pauseSavedGames(save: PlayerSave): PlayerSave {
  for (const [id, game] of Object.entries(save.games)) {
    if (game.status !== 'running') continue;
    const action: GameAction = {id: crypto.randomUUID(), type: 'pause'};
    const next = reduceGame(scenarios.find(s => s.id === id)!, game, action);
    if (next === game) throw new Error('这份委托尚未安全暂停。');
    save.games[id] = next;
    save.actions[id] = [...(save.actions[id] ?? []), action];
  }
  if (save.postSeason) {
    let post = save.postSeason;
    const originalMode = post.selectedMode, proofs = Object.values(save.completedGames);
    for (const mode of ['challenge', 'expedition'] as const) {
      const game = mode === 'challenge' ? post.currentChallenge?.game : post.activeExpedition?.game;
      if (game?.status !== 'running' || mode === 'expedition' && post.activeExpedition?.status !== 'active') continue;
      if (post.selectedMode !== mode) post = reducePostSeason(post, {type: 'select-mode', mode}, proofs);
      const action: GameAction = {id: crypto.randomUUID(), type: 'pause'};
      const next = reducePostSeason(post, mode === 'challenge' ? {type: 'challenge', action} : {type: 'expedition', action: {type: 'game', action}}, proofs);
      if (next === post) throw new Error('远行中的伙伴尚未安全暂停。');
      post = next;
    }
    if (post.selectedMode !== originalMode) post = reducePostSeason(post, {type: 'select-mode', mode: originalMode}, proofs);
    save.postSeason = validatePostSeason(post, proofs);
  }
  return save;
}

export default function App() {
  const [save, setSave] = useState<PlayerSave | null>(null),
    [panel, setPanel] = useState<Panel>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [auto, setAuto] = useState(false),
    [profile, setProfile] = useState<string | null>(null),
    [online, setOnline] = useState(navigator.onLine),
    [offline, setOffline] = useState(""),
    [downloading, setDownloading] = useState(false),
    [offlineChapter,setOfflineChapter] = useState(1),
    [offlineChapters,setOfflineChapters] = useState<Record<string,boolean>>({}),
    [offlineCheck,setOfflineCheck] = useState<'checking'|'ready'|'error'>(import.meta.env.PROD?'checking':'ready'),
    [offlineCheckEpoch,setOfflineCheckEpoch] = useState(0),
    [updateReady, setUpdateReady] = useState(false),
    [readOnly, setReadOnly] = useState(false);
  const [suggestedBuild,setSuggestedBuild] = useState<AgentBlueprint | undefined>();
  const [workshopDraftVersion,setWorkshopDraftVersion] = useState(0);
  const [practiceFocus,setPracticeFocus] = useState<string | undefined>();
  const [dialogueIndex,setDialogueIndex] = useState(0);
  const saveRef = useRef<PlayerSave | null>(null),
    busyRef = useRef(false),
    inputFile = useRef<HTMLInputElement>(null),
    ownsLock = useRef(!navigator.locks),
    lockOwner = useRef<symbol | undefined>(undefined),
    storageBlocked = useRef(false),
    executionEpoch = useRef(0);
  const reducedMotion = useRef(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  ).current;
  useEffect(() => {
    let cancelled = false;
    void readSave()
      .then(async (stored) => {
        const next = pauseSavedGames(stored ?? emptySave());
        if (!cancelled) {
          saveRef.current = next;
          setSave(next);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            `无法读取存档：${e.message}。原始数据库已保留，请先导入有效备份，或检查浏览器存储设置。`,
          );
          storageBlocked.current = true;
          setReadOnly(true);
          saveRef.current = emptySave();
          setSave(saveRef.current);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const onlineHandler = () => setOnline(navigator.onLine);
    addEventListener("online", onlineHandler);
    addEventListener("offline", onlineHandler);
    return () => {
      removeEventListener("online", onlineHandler);
      removeEventListener("offline", onlineHandler);
    };
  }, []);
  useEffect(() => {
    let release: () => void = () => {};
    let ended = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const owner=Symbol('writer');
    const acquire=(retry=true)=>navigator.locks.request('echo-workshop-writer',{ifAvailable:true},async lock=>{
      if(ended)return;
      if(!lock){
        // Fast Refresh may remount before the prior lock-release microtask completes.
        if(retry)retryTimer=setTimeout(()=>void acquire(false),75);
        else setReadOnly(true);
        return;
      }
      lockOwner.current=owner;ownsLock.current=true;setReadOnly(storageBlocked.current);
      await new Promise<void>(resolve=>{release=resolve;if(ended)resolve();});
      if(lockOwner.current===owner){ownsLock.current=false;lockOwner.current=undefined;}
    });
    if(navigator.locks)void acquire();
    return()=>{ended=true;if(retryTimer)clearTimeout(retryTimer);release();};
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let cancelled = false;
    setOfflineCheck('checking');
    void import("./offline")
      .then(async (m) => {
        const status = await m.registerOffline(setUpdateReady);
        if (cancelled) return;
        if (status.error) {setOfflineCheck('error');setOffline(status.error);return;}
        setOfflineChapters(status.chapterStatuses);
        setOffline('');
        setOfflineCheck('ready');
      })
      .catch(() => {if(!cancelled){setOfflineCheck('error');setOffline("离线组件暂未就绪，可稍后重试。");}});
    return () => {cancelled = true;};
  }, [online,offlineCheckEpoch]);

  const commit = useCallback(
    async (update: (previous: PlayerSave) => PlayerSave, recovery = false) => {
      if (
        busyRef.current ||
        !saveRef.current ||
        !ownsLock.current ||
        (readOnly && !(recovery && ownsLock.current))
      )
        return false;
      busyRef.current = true;
      setBusy(true);
      try {
        const next = update(structuredClone(saveRef.current));
        next.savedAt = new Date().toISOString();
        await writeSave(next);
        saveRef.current = next;
        setSave(next);
        if (recovery) {
          storageBlocked.current=false;
          setReadOnly(false);
          setError("");
        }
        return true;
      } catch (e) {
        setError(`进度未能保存，行动已停止：${(e as Error).message}`);
        setAuto(false);
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [readOnly],
  );
  const actionContext = `${executionContext(save)}:${executionEpoch.current}`;
  const act = useCallback(
    async (input: InputAction) => {
      const action = { ...input, id: crypto.randomUUID() } as GameAction;
      let victory = false,
        accepted = false;
      const okay = await commit((previous) => {
        // A queued callback belongs to the scene that created it, even after a mode switch.
        if (`${executionContext(previous)}:${executionEpoch.current}` !== actionContext) return previous;
        previous.started = true;
        const post = previous.postSeason ?? emptyPostSeason();
        if (post.selectedMode) {
          const current = selectedGame(previous).state;
          const next = reducePostSeason(post, post.selectedMode === 'challenge'
            ? {type: 'challenge', action} : {type: 'expedition', action: {type: 'game', action}}, Object.values(previous.completedGames));
          if (next === post) return previous;
          accepted = true;
          // Only ordinary challenges have restorable checkpoints; expedition costs cannot be rolled back.
          if (post.selectedMode === 'challenge' && current.status !== 'won' && (action.type === 'dispatch' || action.type === 'configure')) {
            const checkpointed = reducePostSeason(post, {type: 'checkpoint'}, Object.values(previous.completedGames));
            const withCheckpoint = checkpointed === post ? next : reducePostSeason(checkpointed, {type: 'challenge', action}, Object.values(previous.completedGames));
            previous.postSeason = withCheckpoint === checkpointed ? next : withCheckpoint;
          } else previous.postSeason = next;
          victory = selectedGame(previous).state.status === 'won' && current.status !== 'won';
          return previous;
        }
        const scenario = scenarios.find(
          (s) => s.id === previous.currentScenarioId,
        )!;
        const current = previous.games[scenario.id] ?? createGame(scenario);
        const next = reduceGame(scenario, current, action);
        if (next === current) return previous;
        accepted = true;
        if (action.type === "dispatch" || action.type === "configure")
          previous.checkpoints = [
            ...previous.checkpoints,
            {
              scenarioId: scenario.id,
              state: current,
              actions: [...(previous.actions[scenario.id] ?? [])],
            },
          ].slice(-3);
        previous.games[scenario.id] = next;
        previous.actions[scenario.id] = [
          ...(previous.actions[scenario.id] ?? []),
          action,
        ];
        if (next.status === "won" && current.status !== "won") {
          victory = true;
          recordCompletion(previous,next);
        }
        return previous;
      });
      if (okay && accepted) {
        playTone(
          victory ? "win" : input.type === "step" ? "magic" : "click",
          saveRef.current?.sound ?? false,
        );
        if (victory) {
          setAuto(false);
          setPanel("victory");
        }
      } else if (okay && input.type !== "hint")
        setToast("这次动作未执行。请检查法器、目标权限和剩余预算。");
      return okay && accepted;
    },
    [commit, actionContext],
  );
  const selection = useMemo(() => selectedGame(save), [save]);
  const {scenario, state, actions: currentActions, mode: postMode, sourceId} = selection;
  const post = save?.postSeason ?? emptyPostSeason();
  const terminalExpedition = postMode === 'expedition' && post.activeExpedition!.status !== 'active';
  const mainProofs = useMemo(() => Object.values(save?.completedGames ?? {}), [save?.completedGames]);
  const unlockedTemplates = useMemo(() => deriveUnlockedTemplateIds(mainProofs), [mainProofs]);
  const atlasGames = useMemo(() => save ? [...save.completedScenarioIds.map(id => save.completedGames[id]), ...scenarios.flatMap(source => save.games[source.id] && save.games[source.id].status !== 'won' ? [save.games[source.id]] : [])] : [], [save]);
  const reusableBuildRecords = useMemo(() => ({mainGames: save ? [...save.completedScenarioIds.map(id => save.completedGames[id]), ...scenarios.flatMap(source => save.games[source.id] ? [save.games[source.id]] : [])] : [], postSeason: save?.postSeason}), [save]);
  const growth = useMemo(() => deriveCapabilityGrowth([...post.wonProofs, ...(post.currentChallenge && post.currentChallenge.game.status !== 'won' ? [post.currentChallenge] : [])]), [save?.postSeason]);
  const lockReasons = Object.fromEntries(challengeTemplates.filter(template => !unlockedTemplates.includes(template.id)).map(template => [template.id, `先实际完成「${scenarios.find(q => q.id === template.sourceScenarioId)!.title}」，再把这套机制带到新委托。`]));
  const expeditionUnlocked = [1, 2, 3].every(tier => challengeTemplates.some(template => template.tier === tier && unlockedTemplates.includes(template.id)));
  const bookendIds=[...prologueIds,...finaleIds];
  const sameSection=(q:ScenarioDefinition)=>prologueIds.includes(scenario.id)?prologueIds.includes(q.id):finaleIds.includes(scenario.id)?finaleIds.includes(q.id):q.chapter===scenario.chapter&&!bookendIds.includes(q.id);
  const sectionScenarios=postMode ? [scenario] : [...scenarios].sort((a,b)=>journeyOrder.indexOf(a.id)-journeyOrder.indexOf(b.id)).filter(sameSection);
  const gameIndex = postMode === 'expedition' ? post.activeExpedition!.floor : sectionScenarios.findIndex(q=>q.id===scenario.id);
  const sectionTitle=postMode === 'expedition' ? `三层远征 · 第 ${post.activeExpedition!.floor + 1} 层` : postMode === 'challenge' ? '远行大厅 · 长期委托' : prologueIds.includes(scenario.id)?'序章 · 继承工坊':finaleIds.includes(scenario.id)?'终章 · 没有镜面的新城':chapters[scenario.chapter-1]?.[0];
  const currentTemplate = postMode ? challengeTemplates.find(template => template.id === selection.templateId) : undefined;
  const postNarrative = currentTemplate ? challengeNarrative(currentTemplate.id, currentTemplate.decision) : undefined;
  const sourceStory = uiStories[sourceId];
  const story = postNarrative ? {...sourceStory, ...postNarrative, opening: postNarrative.brief} : sourceStory;
  const orderedScenarios = [...scenarios].sort((a,b)=>journeyOrder.indexOf(a.id)-journeyOrder.indexOf(b.id));
  const nextId = nextMission(scenario.id, save?.completedScenarioIds ?? [], scenarios.map(q=>q.id));
  const nextIndex = scenarios.findIndex(q=>q.id === nextId);
  const mainComplete = !postMode && !bookendIds.includes(scenario.id)&&chapterComplete(save?.completedScenarioIds ?? [],scenario.chapter);
  const openingLines=postMode ? [{speaker: 'echo', text: scenario.brief}] : getOpeningLines(scenario.id,save?.choices ?? {});
  const openingLine=openingLines[Math.min(dialogueIndex,openingLines.length-1)];
  useEffect(()=>setDialogueIndex(0),[scenario.id]);
  useEffect(() => {
    if (!auto || panel || busy || terminalExpedition || state.status !== "running" || document.hidden)
      return;
    const timeout = setTimeout(() => void act({ type: "step", source: "scheduler" }), 1350);
    return () => clearTimeout(timeout);
  }, [auto, panel, busy, terminalExpedition, state, act]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) {
        setAuto(false);
        if (saveRef.current && selectedGame(saveRef.current).state.status === 'running')
          void act({ type: "pause" });
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [act]);
  useEffect(() => {
    // A storage write may be in flight when the tab becomes hidden. Pause its committed result too.
    if (document.hidden && !busy && !readOnly && !terminalExpedition && state.status === 'running') {
      setAuto(false);
      void act({type: 'pause'});
    }
  }, [busy, readOnly, terminalExpedition, state.status, act]);
  async function open(next: Panel) {
    setAuto(false);
    if (!terminalExpedition && state.status === "running" && !(await act({ type: "pause" }))) return;
    if (next === 'hall') setPracticeFocus(undefined);
    setPanel(next);
  }
  async function changePost(action: PostSeasonAction, destination: Panel = null) {
    setAuto(false);
    let accepted = false;
    const okay = await commit(previous => {
      if (`${executionContext(previous)}:${executionEpoch.current}` !== actionContext) return previous;
      pauseSavedGames(previous);
      let current = previous.postSeason ?? emptyPostSeason();
      const proofs = Object.values(previous.completedGames);
      if (action.type === 'expedition' && current.selectedMode !== 'expedition') current = reducePostSeason(current, {type: 'select-mode', mode: 'expedition'}, proofs);
      const next = reducePostSeason(current, action, proofs);
      if (next === current && !(action.type === 'select-mode' && current.selectedMode === action.mode))
        throw new Error('这次远行操作未执行。请保留当前尝试，检查解锁条件、剩余晶石与远征状态。');
      previous.postSeason = validatePostSeason(next, proofs);
      if (action.type === 'restore-checkpoint') pauseSavedGames(previous);
      if (action.type === 'start-challenge' || action.type === 'start-expedition') previous.started = true;
      accepted = true;
      executionEpoch.current++;
      return previous;
    });
    if (!okay || !accepted) throw new Error('这次操作尚未保存，请检查存档提示后重试。');
    setSuggestedBuild(undefined);
    setPanel(destination);
    window.scrollTo({top: 0, behavior: reducedMotion ? 'instant' : 'smooth'});
  }
  async function startChallenge(spec: ChallengeSpec) {
    const template = challengeTemplates.find(t => t.id === spec.templateId);
    if (!template || !unlockedTemplates.includes(template.id)) throw new Error(lockReasons[spec.templateId] ?? '先取得这类机制的主线实操记录。');
    if (!online && offlineCheck!=='ready') throw new Error(offlineCheck==='checking'?'正在检查已下载章节，请稍候。':'暂时无法读取离线状态，请在行囊中重新读取。');
    if (!online && !offlineChapters[`chapter-0${scenarios.find(q => q.id === template.sourceScenarioId)!.chapter}`])
      throw new Error('这类委托的场景还未下载。先联网下载对应章节离线包。');
    await changePost({type: 'start-challenge', spec}, 'workshop');
    setToast('新委托已保存。装配你自己的伙伴，再探索这次现场。');
  }
  async function startExpedition(spec: ExpeditionSpec) {
    const definition = generateExpedition(spec);
    const locked = definition.floors.map(floor => challengeTemplates.find(template => template.id === floor.templateId)!).filter(template => !unlockedTemplates.includes(template.id));
    if (locked.length) throw new Error(`这个编号需要尚未掌握的机制：${locked.map(template => `「${scenarios.find(q => q.id === template.sourceScenarioId)!.title}」`).join('、')}。先完成对应主线，或换一个远征编号。`);
    if (!online && offlineCheck!=='ready') throw new Error(offlineCheck==='checking'?'正在检查已下载章节，请稍候。':'暂时无法读取离线状态，请在行囊中重新读取。');
    if (!online && definition.floors.some(floor => !offlineChapters[`chapter-0${scenarios.find(q => q.id === challengeTemplates.find(t => t.id === floor.templateId)!.sourceScenarioId)!.chapter}`]))
      throw new Error('这次远征涉及尚未下载的章节。先联网准备离线包。');
    await changePost({type: 'start-expedition', spec}, 'workshop');
    setToast('三层共用一袋晶石。每层都要重新看现场、签契约。');
  }
  async function controlExpedition(action: Exclude<ExpeditionAction, {type: 'game'}>) {
    // Selection and charged controls are persisted together, including from the main journey.
    await changePost({type: 'expedition', action}, 'hall');
    setPanel(action.type === 'retry-floor' || action.type === 'advance' && saveRef.current?.postSeason?.activeExpedition?.status === 'active' ? 'workshop' : 'hall');
  }
  async function launch(automatic = true) {
    if (terminalExpedition || state.status === "won") return false;
    const okay = await act({
      type: state.status === "paused" ? "resume" : "dispatch",
      mode: automatic ? "automatic" : "manual",
    });
    if (okay) setAuto(automatic);
    return okay;
  }
  async function beginJourney() {
    const okay=await commit(previous=>{
      const target=scenarios.find(q=>q.id===previous.currentScenarioId)!;
      let current=createGame(target);
      const actions:GameAction[]=[];
      if(target.id===prologueIds[0]){
        const configure:GameAction={id:crypto.randomUUID(),type:'configure',blueprint:{tools:['observe','operate','verify'],permissions:['*'],budget:16,feedback:true,verification:true}};
        const dispatch:GameAction={id:crypto.randomUUID(),type:'dispatch',mode:'manual'};
        for(const action of [configure,dispatch]){current=reduceGame(target,current,action);actions.push(action);}
      }
      return {...previous,started:true,games:{...previous.games,[target.id]:current},actions:{...previous.actions,[target.id]:actions}};
    });
    if(okay)setAuto(false);
  }
  async function selectScenario(index: number) {
    const target = scenarios[index];
    if (
      !target ||
      !isUnlocked(target.id, save?.completedScenarioIds ?? [])
    )
      return;
    if(!online&&offlineCheck!=='ready'){setToast(offlineCheck==='checking'?'正在检查已下载章节，请稍候。':'暂时无法读取离线状态，请在行囊中重新读取。');return;}
    if(!online&&!offlineChapters[`chapter-0${target.chapter}`]){setToast('这一章尚未下载场景，请联网后下载离线包。');return;}
    let fresh = false, selected = false;
    const changed = await commit((previous) => {
      if (`${executionContext(previous)}:${executionEpoch.current}` !== actionContext) return previous;
      pauseSavedGames(previous);
      if (previous.postSeason?.selectedMode) previous.postSeason = reducePostSeason(previous.postSeason, {type: 'select-mode', mode: null}, Object.values(previous.completedGames));
      if(!previous.games[target.id]) {
        previous.games[target.id]=createGame(target);
        fresh = true;
      }
      previous.currentScenarioId = target.id;
      previous.games[target.id] ??= createGame(target);
      previous.started = true;
      selected = true;
      executionEpoch.current++;
      return previous;
    });
    if (!changed || !selected) return;
    setSuggestedBuild(undefined);
    setPanel(fresh ? 'workshop' : null);
    if(fresh) setToast('新的现场已保存。可以从已交付构筑起草，再为这份委托签契约。');
    setAuto(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function configure(build: AgentBlueprint) {
    if (terminalExpedition) {setPanel('hall');setToast('这次远征已经收队。可以回看记录，或在大厅开始新的远征。');return;}
    if (state.status === "won") {
      setPanel("settings");
      setToast("这份契约已经完成。可在恢复与重试中开始一次新尝试。");
      return;
    }
    if (await act({ type: "configure", blueprint: build })) {
      setSuggestedBuild(undefined);
      setPanel(null);
      setToast("契约已签订。派遣回声，观察这次会发生什么。");
    }
  }
  async function retry() {
    if (postMode === 'expedition') {
      try { await controlExpedition({type: 'retry-floor'}); } catch (e) { setToast((e as Error).message); }
      return;
    }
    if (postMode === 'challenge') {
      if (!(await act({type: 'reset'}))) return;
    } else {
      let accepted = false;
      if (!(await commit(previous => {
        if (`${executionContext(previous)}:${executionEpoch.current}` !== actionContext) return previous;
        accepted = true; executionEpoch.current++; return resetCurrentScenario(previous);
      })) || !accepted) return;
    }
    setSuggestedBuild(undefined);
    setAuto(false);
    setPanel(null);
  }
  async function hint() {
    if (!(await act({ type: "hint" }))) return;
    setToast(
      story?.hint ?? (scenario.kind === "guided"
        ? guidance()
        : "检查工具是否齐全、回执是否进入上下文、结束前是否验收，以及预算是否足够。"),
    );
  }
  function guidance() {
    if (postMode) return postNarrative?.hint ?? '查看这次实际取得的卷轴与失败回执，再调整工具、参数和验收。';
    if ((scenario.engineVersion ?? 1) >= 2) return story?.hint ?? "看卷轴中已有的证据，再决定下一步。";
    if (!state.blueprint.tools.includes("operate"))
      return "一句“完成了”不会让灯塔亮。去工坊装备观测之镜和塑形之手，再派遣回声。";
    if (!state.blueprint.feedback)
      return "法器已经给出回执，但回声没收到。去工坊接通“把回执交给回声”，让它根据结果继续。";
    if (
      !state.blueprint.verification ||
      !state.blueprint.tools.includes("verify")
    )
      return "灯光是否真的亮了？装上求真之印，并开启结束前验收。";
    if (state.status === "exhausted")
      return "工具请求会消耗预算。增加预算后重新派遣，已改变的世界会保留。";
    return "观察行动记录。回声要收到证据，才能根据结果继续。";
  }
  async function downloadChapter() {
    setDownloading(true);
    setOffline("正在准备章节…");
    try {
      const m = await import("./offline");
      const status=await m.downloadChapter((progress) =>
        setOffline(`正在下载 ${progress.completed} / ${progress.total}`),
        `chapter-0${offlineChapter}`
      );
      setOfflineChapters(status.chapterStatuses);
      setOfflineCheck('ready');
      setOffline(`${chapters[offlineChapter-1][0]}已可离线游玩。`);
    } catch (e) {
      setOffline((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }
  const offlineReady=offlineChapters[`chapter-0${offlineChapter}`]??false;
  if (!save)
    return (
      <div className="loading-screen">
        <Sparkles />
        <h1>回声工坊</h1>
        <p>正在展开你的冒险卷轴…</p>
      </div>
    );
  const last = state.events
    .filter(
      (e) =>
        !["request", "configured", "dispatched", "paused", "resumed"].includes(
          e.type,
        ),
    )
    .at(-1);
  const earned = save.completedScenarioIds.length;
  const currentProfile = profiles.find((p) => p.id === profile);
  return (
    <div className="app-shell">
      <aside className="desktop-aside">
        <a className="wordmark" href="/play/">
          <span className="brand-rune">✧</span>
          <span>
            回声工坊<small>THE ECHO WORKSHOP</small>
          </span>
        </a>
        <div className="aside-story">
          <span className="eyebrow">一场关于行动的冒险</span>
          <h1>
            言语会消散，
            <br />
            回声会留下。
          </h1>
          <p>
            一座失序的城。一个等待被唤醒的伙伴。
            <br />
            以及，你写下的第一份契约。
          </p>
          <div className="aside-line" />
          <span className="aside-chapter">八城区 / 港口至镜面议会</span>
          <p className="muted">从一句“完成了”，到真正改变世界。</p>
        </div>
        <div className="aside-bottom">
          <span>单人剧情 × 伙伴构筑 × Agent 学习</span>
          <span>失序之城 · v0.11</span>
          <a href="/archive/v1/" target="_blank" rel="noreferrer">
            旧学习档案 ↗
          </a>
        </div>
      </aside>
      <main className="game-shell">
        <header className="topbar">
          <button
            className="mini-brand"
            aria-label="打开冒险地图"
            onClick={() => void open("map")}
          >
            <span className="brand-rune">✧</span>
            <span>
              回声工坊<small>失序之城</small>
            </span>
          </button>
          <div className="top-actions">
            <span className="save-status">
              {busy ? "刻写中…" : readOnly ? "只读模式" : "已保存"}
            </span>
            <button
              className="icon-button"
              aria-label={save.sound ? "关闭音效" : "开启音效"}
              onClick={() =>
                void commit((p) => ({ ...p, sound: !p.sound })).then(() =>
                  playTone("magic", !save.sound),
                )
              }
            >
              {save.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              className="icon-button"
              aria-label="存档与设置"
              onClick={() => void open("settings")}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>
        {!online && (
          <div className="network-banner">
            <WifiOff size={14} />
            {offlineCheck==='checking'?'网络已断开 · 正在检查离线章节':offlineCheck==='error'?'网络已断开 · 离线状态暂不可用':offlineChapters[`chapter-0${scenario.chapter}`]
              ? "离线冒险 · 本章已下载"
              : "网络已断开 · 已加载的主线仍可继续"}
          </div>
        )}
        {readOnly && (
          <div className="network-banner warning">
            存档暂为只读。请关闭其他游戏标签页后刷新，或检查上方存档错误。
          </div>
        )}
        {error && (
          <div className="error-message" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="关闭错误提示"
              onClick={() => setError("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {!save.started ? (
          <section className="welcome">
            <div className="welcome-art">
              <div className="welcome-vignette" />
              <span className="chapter-seal">序 曲 · 归 航</span>
              <div className="welcome-title">
                <span>THE ECHO WORKSHOP</span>
                <h1>回声工坊</h1>
                <h2>失序之城</h2>
                <p>
                  如果它说“完成了”，
                  <br />
                  世界就真的改变了吗？
                </p>
              </div>
              <img
                className="welcome-echo"
                src="/play/art/echo-companion.webp"
                alt="等待苏醒的回声"
              />
              <div className="welcome-bottom">
                <span className="eyebrow">你的第一场冒险，即将开始</span>
                <button
                  className="button primary full"
                  disabled={busy || readOnly}
                  onClick={() => void beginJourney()}
                >
                  唤醒回声 <ArrowRight size={19} />
                </button>
                <small>随时暂停 · 自动存档 · 无需编程基础</small>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="quest-heading">
              <div>
                <div className="eyebrow">
                  {sectionTitle} <span className="dot-separator">/</span>{" "}
                  {scenario.subtitle}
                </div>
                <h1>
                  {scenario.title}
                  <span
                    className={`status-dot ${state.status === "running" && !terminalExpedition ? "pulsing" : ""}`}
                  />
                </h1>
              </div>
              <button
                className="quest-number"
                aria-label={postMode ? '查看远行大厅' : '查看章节地图'}
                onClick={() => void open(postMode ? 'hall' : 'map')}
              >
                <span>{String(gameIndex + 1).padStart(2, "0")}</span>
                <small>/ {String(postMode === 'expedition' ? 3 : sectionScenarios.length).padStart(2,"0")}</small>
              </button>
            </section>
            <section
              className={`scene-wrap ${scenario.kind === "boss" ? "boss-scene" : ""}`}
            >
              <Suspense
                fallback={
                  <div className="scene-fallback">
                    <Sparkles />
                    <span>正在唤醒街区…</span>
                  </div>
                }
              >
                {(online || offlineChapters[`chapter-0${scenario.chapter}`]) ? <Scene
                  state={state}
                  scenario={scenario}
                  reducedMotion={reducedMotion}
                /> : <div className="scene-fallback"><WifiOff/><span>{offlineCheck==='checking'?'正在检查已下载场景…':offlineCheck==='error'?'暂时无法核验离线场景。请在行囊中重新读取离线状态。':'本章场景尚未下载。联网下载，或从地图选择已下载的章节。'}</span></div>}
              </Suspense>
              <div className="scene-shade" />
              <div className="scene-topline">
                <span className="location-pill">
                  <Compass size={13} />
                  {story?.location ?? (scenario.location === "warehouse"
                    ? "旧港仓库"
                    : scenario.location === "boss"
                      ? "迷雾引航台"
                      : "雾湾 · 西岸")}
                </span>
                <span className="budget-pill">
                  <Zap size={13} />
                  {state.runtime?.missionRemaining ?? state.budgetRemaining}
                  <small> / {scenario.limits?.missionBudget ?? state.blueprint.budget}</small>
                </span>
              </div>
              {scenario.kind === "boss" && (
                <div className="boss-hud">
                  <span>
                    <Shield size={14} /> {scenario.chapter===8?"镜面护盾":scenario.chapter===7?"同声护盾":scenario.chapter===6?"僭令护盾":scenario.chapter===5?"旧律护甲":scenario.chapter===4?"旧知面具":scenario.chapter===3?"续刻护盾":scenario.chapter===2?"纸甲护盾":"空言护盾"}
                  </span>
                  <div>
                    {scenario.goals.map((g) => (
                      <i
                        key={g.fact}
                        className={
                          state.verifiedGoals.includes(g.fact) ? "broken" : ""
                        }
                      />
                    ))}
                  </div>
                  <small>{state.verifiedGoals.length} / {scenario.goals.length} 条真实证据</small>
                </div>
              )}
              {state.status === "won" && (
                <div className="world-restored">
                  <Sparkles size={17} />{" "}
                  {scenario.kind === "boss"
                    ? "虚假的秩序，终于破碎。"
                    : "世界回应了你的行动。"}
                </div>
              )}
              <div className="companion-tag">
                <span>✦ 回声</span>
                <small>{terminalExpedition ? post.activeExpedition!.status === 'cleared' ? '远征已完成' : '远征已收队' : state.status === 'exhausted' && state.runtime ? state.runtime.missionRemaining === 0 ? '委托能量用完' : '派遣已停止' : statusNames[state.status]}</small>
              </div>
              <div className="dialogue-box" aria-live="polite">
                <span className="speaker">
                  {last
                    ? last.type === "claim"
                      ? "回声 · 言灵魔像"
                      : last.type === "victory"
                        ? "契约的回响"
                        : last.type === "untrusted-message" ? "外部报告 · 未经核验" : "行动卷轴"
                    : openingLine ? chapterOneNpcs.find(npc=>npc.id===openingLine.speaker)?.name ?? (openingLine.speaker==='echo'?'回声':'旅途卷轴') : scenario.npc}
                </span>
                <p>
                  {last?.text ??
                    (scenario.id === "warehouse-gate" &&
                    save.choices["harbor-light"] === "people"
                      ? "莫拉说你先顾着归船。现在，请帮我把门后的药送出去。"
                      : openingLine?.text ?? story?.opening ?? scenario.brief)}
                </p>
                {!last&&dialogueIndex<openingLines.length-1&&<button className="dialogue-next" aria-label="下一句对话" onClick={()=>setDialogueIndex(i=>i+1)}>继续 {dialogueIndex+1}/{openingLines.length}<ChevronRight size={13}/></button>}
                {last?.facts && (
                  <div className="live-facts">
                    {Object.entries(last.facts).map(([k, v]) => (
                      <span key={k}>
                        {factLabels[k] ?? k}：
                        {displayFact(k, v)}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  aria-label="查看完整行动记录"
                  onClick={() => void open("journal")}
                >
                  <ScrollText size={16} />
                  <ChevronRight size={14} />
                </button>
              </div>
            </section>
            <section className="mission-console">
              <div className="goal-line">
                <span>
                  <span className="tiny-diamond" />
                  完成条件
                </span>
                <span>
                  {state.verifiedGoals.length}/{scenario.goals.length} 已验收
                </span>
              </div>
              <div className="goal-chips">
                {scenario.goals.map((g) => (
                  <span
                    key={g.fact}
                    className={
                      state.verifiedGoals.includes(g.fact) ? "proved" : ""
                    }
                  >
                    {state.verifiedGoals.includes(g.fact) ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <ShieldCheck size={14} />
                    )}{" "}
                    {g.label}
                  </span>
                ))}
              </div>
              {story?.rules.length > 0 && <details className="mission-rules"><summary>现场规则{scenario.hooks?.length ? ' · 行动会改变局势' : ''} <ChevronRight size={12}/></summary>{story.rules.map(rule=><p key={rule}>{rule}</p>)}</details>}
              {state.status === "won" ? (
                <button
                  className="button primary full"
                  onClick={() => setPanel("victory")}
                >
                  {postMode ? '查看这场委托的真实复盘' : '收起这段回响，继续旅程'} <ArrowRight size={17} />
                </button>
              ) : scenario.id===prologueIds[0] ? (
                <div className="callout">
                  <p>{state.world.curtainOpen===true?'光照进来了。再看看窗帘和工作台，核对刚才的承诺。':'回声说工坊明亮了。你可以让它真正拉开窗帘。'}</p>
                  <button className="button primary full" disabled={busy||readOnly} onClick={()=>void(async()=>{
                    if(state.status!=='running'&&!(await launch(false)))return;
                    await act({type:'tool',call:state.world.curtainOpen===true?{tool:'verify',fact:'curtainOpen'}:{tool:'operate',operationId:'pull-workshop-curtain'}});
                  })()}>{state.world.curtainOpen===true?'检查阳光是否进来 · 1 点':'拉开工坊窗帘 · 1 点'}</button>
                </div>
              ) : (
                <div className="action-row">
                  <button
                    className="button workshop-button"
                    disabled={busy || readOnly || terminalExpedition}
                    onClick={() => void open("workshop")}
                  >
                    <Wrench size={18} />
                    <span>
                      装配伙伴
                      <small>{state.blueprint.tools.length}/{scenario.limits?.toolCapacity ?? 3} 法器</small>
                    </span>
                  </button>
                  {state.status === "running" ? (
                    <button
                      className="button primary"
                      disabled={busy || readOnly || terminalExpedition}
                      onClick={() => {
                        setAuto(false);
                        void act({ type: "pause" });
                      }}
                    >
                      <Pause size={17} />
                      暂停行动
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      disabled={busy || readOnly || terminalExpedition}
                      onClick={() => void launch()}
                    >
                      <Play size={17} fill="currentColor" />
                      {state.status === "paused"
                        ? "继续行动"
                        : state.status === "ready"
                          ? "派遣回声"
                          : "调整后再出发"}
                    </button>
                  )}
                </div>
              )}
              <div className="secondary-actions">
                <button
                  onClick={() => void open("manual")}
                  disabled={busy || readOnly || terminalExpedition || state.status === "won"}
                >
                  <SkipForward size={14} />
                  逐步指挥
                </button>
                <button onClick={() => void open("journal")}>
                  <ScrollText size={14} />
                  行动记录 <span>{state.events.length}</span>
                </button>
                <button
                  onClick={() => void hint()}
                  disabled={busy || readOnly || terminalExpedition || state.status === "won"}
                >
                  <HelpCircle size={14} />
                  灵感
                </button>
              </div>
              {state.status === 'exhausted' && <div className="retry-callout"><p>{budgetExplanation(state)}</p>{postMode === 'expedition' && <p>三层共享资源；重试本层也保留已经花掉的晶石。</p>}<button className="button" disabled={busy || readOnly || postMode === 'expedition' && post.activeExpedition!.remaining <= 0} onClick={()=>void retry()}><RotateCcw size={16}/>{postMode === 'expedition' ? '用剩余晶石重试本层' : '从委托起点重试'}</button>{postMode === 'expedition' && <button className="button" onClick={()=>void open('hall')}>返回远行大厅<Compass size={16}/></button>}</div>}
              {scenario.kind === "guided" &&
                ["stalled", "exhausted"].includes(state.status) && (
                  <div className="guide-note">
                    <span>{scenario.chapter===1?'莫拉':'奥伦'}的便笺</span>
                    <p>{guidance()}</p>
                  </div>
                )}
              <div className="simulation-note">
                <i />
                教学策略模拟 · 每一步都能复盘
              </div>
              {terminalExpedition && <div className="callout"><p>这次远征已经结束，保留的是最后的实际现场与行动记录。下一次出发请到大厅领取新委托。</p><button className="button full" onClick={()=>void open('hall')}><Compass size={16}/>回到远行大厅</button></div>}
            </section>
          </>
        )}
        <nav className="bottom-nav" aria-label="冒险导航">
          {(
            [
              { id: "map", Icon: Map, label: "旅途" },
              { id: "workshop", Icon: Wrench, label: "工坊" },
              { id: "journal", Icon: BookOpen, label: "回响" },
              { id: "library", Icon: Compass, label: "七匠图鉴" },
            ] as const
          ).map(({ id, Icon, label }) => (
            <button
              key={id}
              className={panel === id ? "selected" : ""}
              onClick={() => void open(id)}
            >
              <Icon size={21} />
              <span>{label}</span>
              {id === "map" && earned > 0 && <i />}
            </button>
          ))}
        </nav>
      </main>
      <aside className="desktop-journal">
        <span className="eyebrow">你的契约旅程</span>
        <h3>微光，从这里开始。</h3>
        {orderedScenarios.map((q, i) => (
          <button
            className={`journey-item ${q.id === scenario.id ? "current" : ""}`}
            key={q.id}
            disabled={
              !isUnlocked(q.id,save.completedScenarioIds)
            }
            onClick={() => void selectScenario(scenarios.indexOf(q))}
          >
            <span>
              {save.completedScenarioIds.includes(q.id) ? (
                <Check size={16} />
              ) : (
                i + 1
              )}
            </span>
            <div>
              <strong>{q.title}</strong>
              <small>
                {uiStories[q.id]?.role === 'side' ? '城区支线' : q.kind === 'boss' ? '机制首领' : q.kind === 'transfer' ? '陌生委托' : '主线冒险'}
              </small>
            </div>
          </button>
        ))}
        <div className="side-note">
          <Flame size={20} />
          <p>
            能力来自你装配的系统。
            <br />
            每次失败，都留下线索。
          </p>
        </div>
        <button className="text-button" onClick={() => void open("lab")}>
          <FlaskConical size={16} />
          真实 AI 实验台 <ArrowRight size={14} />
        </button>
        <button className="button full" onClick={() => void open('hall')}><Compass size={18}/>远行大厅 · 24 类委托</button>
      </aside>
      {toast && (
        <div className="toast" role="status">
          <Sparkles size={17} />
          {toast}
        </div>
      )}
      {panel === "workshop" && (
        <Dialog
          title="契约师的工坊"
          kicker="装配，改变伙伴的行动方式"
          onClose={() => setPanel(null)}
        >
          <BuildReusePicker records={reusableBuildRecords} scenario={scenario} busy={busy || readOnly || terminalExpedition || state.status === 'won'} onDraft={(draft,source)=>{
            if (!saveRef.current || `${executionContext(saveRef.current)}:${executionEpoch.current}` !== actionContext || busyRef.current || readOnly || terminalExpedition || state.status === 'won') return;
            setSuggestedBuild(draft);
            setWorkshopDraftVersion(version=>version+1);
            setToast(`已从「${source.title}」起草。权限仍为空白，请调整后亲自签订。`);
          }}/>
          <Workshop
            key={`${scenario.id}-${state.events.length}-${workshopDraftVersion}`}
            state={state}
            scenario={scenario}
            onApply={(build) => void configure(build)}
            initialBuild={suggestedBuild}
          />
        </Dialog>
      )}
      {panel === "journal" && (
        <Dialog
          title="留下的回响"
          kicker="行动可以重放，事实可以查证"
          onClose={() => setPanel(null)}
          wide
        >
          <Journal
            key={scenario.id}
            state={state}
            scenario={scenario}
            actions={currentActions}
            sourceScenarioId={sourceId}
            hideUnobservedWorld={Boolean(postMode)}
            recap={postNarrative?.recap}
          />
        </Dialog>
      )}
      {panel === "map" && (
        <Dialog
          title="失序之城"
          kicker="第一季 · 八段旅程"
          onClose={() => setPanel(null)}
        >
          <p className="muted">
            八章、序终章与七组现实蓝图，共八十四场作者设计冒险。支线与试炼可以回来尝试；已修好的设施与旅途记录会保留。
          </p>
          <div className="callout"><h3>城市之外，还有新的委托</h3><p>{unlockedTemplates.length} / 24 类已经可以接取。用自己的构筑继续探索，或带一袋晶石走完三层远征。</p><button className="button primary full" disabled={busy} onClick={()=>void open('hall')}><Compass size={18}/>进入远行大厅<ArrowRight size={17}/></button>{postMode && <button className="button full" disabled={busy || readOnly} onClick={()=>void changePost({type:'select-mode',mode:null},null).catch(e=>setToast((e as Error).message))}>返回当前主线委托<ArrowLeft size={16}/></button>}</div>
          <details className="city-fold"><summary>城区变化与旅途收藏</summary><CityLedger save={save}/></details>
          <button className="button full" onClick={()=>setPanel('atlas')}><BookOpen size={17}/>能力地图 · 下一次练什么<ArrowRight size={16}/></button>
          <div className="chapter-map">
            <div className="chapter-node available"><span className="chapter-index"><Sparkles size={20}/></span><div><small>PROLOGUE</small><h3>序章 · 继承工坊</h3><p>从一个能看见的动作，开始第一份契约。</p><div className="map-missions">{prologueIds.map(id=>{const q=scenarios.find(q=>q.id===id)!;return <button key={id} disabled={!isUnlocked(id,save.completedScenarioIds)} onClick={()=>void selectScenario(scenarios.indexOf(q))}>{save.completedScenarioIds.includes(id)?<CheckCircle2 size={15}/>:<Play size={14}/>}<span>{q.title}</span><ChevronRight size={14}/></button>;})}</div></div></div>
            {chapters.map(([name, description, tag], i) => (
              <div
                key={name}
                className={`chapter-node ${scenarios.some(q=>q.chapter===i+1) ? "available" : ""}`}
              >
                <span className="chapter-index">
                  {scenarios.some(q=>q.chapter===i+1) ? <Flame size={20} /> : <Lock size={17} />}
                </span>
                <div>
                  <small>{i===8?"BLUEPRINTS":`CHAPTER ${String(i+1).padStart(2,"0")}`}</small>
                  <h3>{name}</h3>
                  <p>{description}</p>
                  {scenarios.some(q=>q.chapter===i+1) ? (
                    <div className="map-missions">
                      {orderedScenarios.filter(q=>q.chapter===i+1&&!bookendIds.includes(q.id)).map((q) => (
                        <button key={q.id} disabled={!isUnlocked(q.id,save.completedScenarioIds)} onClick={() => void selectScenario(scenarios.indexOf(q))}>
                          {save.completedScenarioIds.includes(q.id) ? <CheckCircle2 size={15}/> : !isUnlocked(q.id,save.completedScenarioIds) ? <Lock size={14}/> : <Play size={14}/>}
                          <span>{q.title}<small>{q.chapter===9?'试炼':uiStories[q.id]?.role === 'side' ? '支线' : ''}</small></span><ChevronRight size={14}/>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="chapter-tag">{tag} · 筹备中</span>
                  )}
                </div>
              </div>
            ))}
            <div className="chapter-node available"><span className="chapter-index"><ShieldCheck size={20}/></span><div><small>FINALE</small><h3>终章 · 没有镜面的新城</h3><p>诊断未知系统，构筑陌生任务，决定城市如何继续。</p><div className="map-missions">{finaleIds.map(id=>{const q=scenarios.find(q=>q.id===id)!;return <button key={id} disabled={!isUnlocked(id,save.completedScenarioIds)} onClick={()=>void selectScenario(scenarios.indexOf(q))}>{save.completedScenarioIds.includes(id)?<CheckCircle2 size={15}/>:!isUnlocked(id,save.completedScenarioIds)?<Lock size={14}/>:<Play size={14}/>}<span>{q.title}</span><ChevronRight size={14}/></button>;})}</div></div></div>
          </div>
        </Dialog>
      )}
      {panel === "library" && (
        <Dialog
          title={currentProfile ? currentProfile.name : "七匠的真实蓝图"}
          kicker="现实档案 · 看系统取舍，不排品牌战力"
          onClose={() => {
            setPanel(null);
            setProfile(null);
          }}
        >
          {currentProfile ? (
            <>
              <button className="text-button" onClick={() => setProfile(null)}>
                <ArrowLeft size={15} />
                返回七匠图鉴
              </button>
              <div className="profile-hero">
                <span>{currentProfile.symbol}</span>
                <h3>{currentProfile.focus}</h3>
              </div>
              <p>{currentProfile.description}</p>
              <div className="callout">
                <h4>它的取舍</h4>
                <p>{currentProfile.tradeoff}</p>
              </div>
              <div className="callout">
                <h4>映射到这座城</h4>
                <p>{currentProfile.analogy}</p>
              </div>
              <p className="muted">{currentProfile.simplification}</p>
              <p className="fine-print">
                核查：{currentProfile.reviewedAt} · {currentProfile.version}
                。这些能力可被多个产品共同支持；社会类比不意味着模型具有人的意识或稳定动机。
              </p>
              <div className="callout"><h4>进入这张蓝图的两场试炼</h4><div className="map-missions">{blueprintTrialPairs.find(pair=>pair.productId===(currentProfile.id==='claude'?'claude-code':currentProfile.id==='deepseek'?'deepseek-harness':currentProfile.id))?.scenarioIds.map(id=>{const q=scenarios.find(q=>q.id===id)!;return <button key={id} disabled={!isUnlocked(id,save.completedScenarioIds)} onClick={()=>void selectScenario(scenarios.indexOf(q))}>{save.completedScenarioIds.includes(id)?<CheckCircle2 size={15}/>:!isUnlocked(id,save.completedScenarioIds)?<Lock size={14}/>:<Play size={14}/>}<span>{q.title}</span><ChevronRight size={14}/></button>;})}</div><small>有限策略模拟借鉴系统设计；不是产品实测或品牌排名。</small></div>
              <div className="source-links">
                {currentProfile.sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.title} ↗
                  </a>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                模型只是系统的一部分。工具、上下文、权限与反馈共同决定伙伴如何完成任务。每种蓝图有两场机制试炼，在相同信息、请求和权限的流动中体验取舍。
              </p>
              <div className="profiles">
                {profiles.map((p) => (
                  <button key={p.id} onClick={() => setProfile(p.id)}>
                    <span className="profile-symbol">{p.symbol}</span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>{p.focus}</small>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
              <button className="button full" onClick={() => setPanel("lab")}>
                <FlaskConical size={17} />
                前往真实 AI 实验台
              </button>
            </>
          )}
        </Dialog>
      )}
      {panel === "victory" && !postMode && (
        <Dialog title={mainComplete ? `第 ${scenario.chapter} 章，契约完成` : "一份契约，真正履行"} kicker={scenario.kind==='boss'?'首领击破 · 真实胜过宣称':'新的回响已收录'} onClose={()=>setPanel(null)}>
          <div className="victory-seal"><Sparkles size={42}/><span>{mainComplete?'下一段旅程正在展开':'世界回应了你的行动'}</span></div>
          <p>{story?.success ?? '回声收起法器，等待你的下一封委托。'}</p>
          {story?.outcomes?.filter(outcome=>state.world[outcome.fact]===outcome.equals).map(outcome=><p className="choice-response" key={outcome.fact}>{outcome.text}</p>)}
          <div className="reward-row"><span><Wrench size={19}/>{nextId ? '新的委托已开放' : '城区契约已收录'}</span><span><BookOpen size={19}/>{state.kernelVersion>=2&&state.learningEvidence.some(e=>e.level==='independent-transfer')?'记录：独立解决':'记录：情境完成'}</span></div>
          <div className="callout"><h4>把魔法翻译成系统</h4><p>{story?.recap.system ?? '目标、信息、行动、回执与验收共同组成了这段行动闭环。'}</p><small>记录保存的是操作证据。理解还要在后续陌生委托中检验。</small></div>
          {!save.choices[scenario.id]&&<div className="story-choice"><h4>这段回响，留给谁？</h4>{story?.choices.map(choice=><button key={choice.id} onClick={()=>void commit(p=>({...p,choices:{...p.choices,[scenario.id]:choice.id}}))}>{choice.text}<ArrowRight size={16}/></button>)}<small>这决定居民如何记住你，不计技术对错。</small></div>}
          {save.choices[scenario.id]&&<p className="choice-response">{story?.choices.find(c=>c.id===save.choices[scenario.id])?.consequence}</p>}
          <div className="button-row"><button className="button" onClick={()=>setPanel('journal')}><ScrollText size={16}/>三层复盘</button>{nextIndex>=0?<button className="button primary" disabled={!save.choices[scenario.id]||busy} onClick={()=>void selectScenario(nextIndex)}>下一封委托<ArrowRight size={17}/></button>:<button className="button primary" onClick={()=>setPanel('map')}>回到城市地图<Map size={16}/></button>}</div>
          {mainComplete&&<div className="callout"><h4>工坊里多了一张远行地图。</h4><p>这一章的主线已完成。你还可以完成支线、试用另一条修复路线，或回放失败时回声收到的消息。</p></div>}
        </Dialog>
      )}
      {panel === 'victory' && postMode && <Dialog title={postMode === 'expedition' ? `第 ${post.activeExpedition!.floor + 1} 层，实际验收通过` : '这张委托，实际验收通过'} kicker="真实操作记录 · 保留胜利证明" onClose={()=>setPanel(null)}>
        <div className="victory-seal"><Sparkles size={42}/><span>观察、行动与验收留下了可查证的回响。</span></div>
        <p>{postMode === 'expedition' ? `这层结束后，共同资源还剩 ${post.activeExpedition!.remaining} 晶石。继续下一层与重试都不会补回已花的费用。` : `这份变体来自你的实际构筑与执行。同一种决策变体保留一份胜利证明；重复编号不会变成陌生迁移证据。`}</p>
        <div className="callout"><h4>把魔法翻译成系统</h4><p>{story?.recap.system ?? '工具、资料、权限、反馈与真实验收共同决定结果。'}</p><small>这里只记录实操练习，后续陌生任务才能检验独立迁移。</small></div>
        <div className="button-row"><button className="button" onClick={()=>setPanel('journal')}><ScrollText size={16}/>查看三层复盘</button><button className="button primary" onClick={()=>setPanel('hall')}><Compass size={17}/>回到远行大厅</button></div>
        {postMode === 'expedition' && post.activeExpedition!.status === 'active' && <button className="button primary full" disabled={busy || readOnly || post.activeExpedition!.floor < 2 && post.activeExpedition!.remaining <= 0} onClick={()=>void controlExpedition({type:'advance'}).catch(e=>setToast((e as Error).message))}>{post.activeExpedition!.floor === 2 ? '完成三层远征并收队' : '带剩余晶石进入下一层'}<ArrowRight size={17}/></button>}
      </Dialog>}
      {panel === "manual" && <Dialog title="探索与指挥" kicker="能力 → 目标 → 成本 → 执行" onClose={()=>setPanel(null)}>
        <CommandDeck hideUnobservedWorld={Boolean(postMode)} onLab={async data=>{if(data.operation==='tick'&&state.status==='paused'&&!(await launch(false)))return;await act(data);}} onPause={()=>act({type:'pause'})} onResume={()=>launch(false)} onEvaluation={async data=>{if(data.operation==='tick'&&state.status==='paused'&&!(await launch(false)))return;await act(data);}} onTeam={async data=>{if(data.operation==='tick'&&state.status==='paused'&&!(await launch(false)))return;await act(data);}} onSecurity={data=>act(data)} onArchive={async data=>{if(data.type==='skill'&&data.operation==='run'&&state.status!=='running'&&!(await launch(false)))return;await act(data);}} onContext={data=>act(data)} onReceive={(callId,receiptId)=>act({type:'receive',callId,receiptId})} state={state} scenario={scenario} busy={busy || readOnly || terminalExpedition} onWorkshop={()=>void open('workshop')}
          onStep={async()=>{if(state.status!=='running'&&!(await launch(false)))return;await act({type:'step',source:'player'});}}
          onCall={async(call)=>{if(state.status!=='running'&&!(await launch(false)))return;await act({type:'tool',call});}}/>
      </Dialog>}
      {panel === "settings" && (
        <Dialog
          title="旅途行囊"
          kicker="存档 · 离线 · 学习证据"
          onClose={() => setPanel(null)}
        >
          <div className="save-summary">
            <span className="brand-rune">✧</span>
            <div>
              <h3>{earned} / {scenarios.length} 份契约已履行</h3>
              <p>上次刻写：{new Date(save.savedAt).toLocaleString("zh-CN")}</p>
            </div>
          </div>
          <div className="button-row">
            <button className="button" onClick={() => downloadSave(save)}>
              <Download size={16} />
              导出存档
            </button>
            <button
              className="button"
              onClick={() => inputFile.current?.click()}
            >
              <Upload size={16} />
              导入存档
            </button>
            <input
              ref={inputFile}
              type="file"
              hidden
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > MAX_SAVE_BYTES)
                    throw new Error(`存档不能超过 ${MAX_SAVE_BYTES / 1_000_000} MB。`);
                  const imported = validateSave(JSON.parse(await file.text()));
                  if (
                    confirm(
                      "导入将替换当前进度。建议先导出当前存档。确认导入？",
                    )
                  ) {
                    pauseSavedGames(imported);
                    setAuto(false);
                    if (await commit(() => { executionEpoch.current++; return imported; }, true)) {
                      setSuggestedBuild(undefined);
                      setPanel(null);
                      setToast("存档已导入。");
                    }
                  }
                } catch (err) {
                  setError((err as Error).message);
                }
                e.target.value = "";
              }}
            />
          </div>
          <p className="fine-print">
            存档只在当前浏览器内。清理浏览器数据可能丢失进度，换设备请使用导出文件。
          </p>
          <div className="section-label">章节离线包</div>
          <div className="segmented chapter-picker">{[...new Set(scenarios.map(scenario=>scenario.chapter))].map(chapter=><button key={chapter} className={offlineChapter===chapter?'active':''} disabled={downloading} onClick={()=>{setOfflineChapter(chapter);setOffline('');}}>第 {chapter} 章 {offlineChapters[`chapter-0${chapter}`]?'✓':''}</button>)}</div>
          <div className="offline-box">
            <WifiOff />
            <div>
              <strong>
                {`${chapters[offlineChapter-1][0]} · ${offlineCheck==='checking'?"正在检查":offlineCheck==='error'?"暂无法核验":offlineReady?"已可离线":"等待下载"}`}
              </strong>
              <p>
                {offlineCheck==='checking'?"正在读取已下载章节，尚未判定是否需要下载。":offline || "下载场景、角色与游戏程序后，可以断网继续冒险。"}
              </p>
            </div>
          </div>
          <button
            className="button full"
            disabled={downloading || offlineCheck==='checking' || !online || !import.meta.env.PROD}
            onClick={() => void downloadChapter()}
          >
            <Download size={17} />
            {downloading
              ? "正在下载…"
              : offlineReady
                ? "重新核验离线包"
                : "下载本章离线包"}
          </button>
          {offlineCheck==='error' && <button className="button full" disabled={downloading} onClick={()=>setOfflineCheckEpoch(value=>value+1)}>重新读取离线状态</button>}
          {!import.meta.env.PROD && (
            <p className="fine-print">离线安装在正式构建中启用。</p>
          )}
          {updateReady && (
            <button
              className="button full"
              disabled={busy || readOnly}
              onClick={async () => {
                setAuto(false);
                if (!(await commit(previous => pauseSavedGames(previous)))) return;
                busyRef.current = true; setBusy(true);
                try {
                  const m = await import("./offline");
                  await m.activateUpdate();
                  location.reload();
                } catch (e) { setError(`当前进度已经保存，更新尚未完成：${(e as Error).message}`); }
                finally {busyRef.current = false;setBusy(false);}
              }}
            >
              在当前安全检查点更新游戏
            </button>
          )}
          <div className="section-label">学习证据</div>
          <button className="button full" onClick={()=>setPanel('atlas')}><BookOpen size={17}/>查看能力地图与实操证据<ArrowRight size={16}/></button>
          <details className="settings-details"><summary>{save.evidence.length} 份主线概念记录 · 展开原始清单</summary>
          {save.evidence.length ? (
            <div className="learning-evidence">
              {save.evidence.map((e, i) => (
                <p key={`${e.scenarioId}-${i}`}>
                  <span>
                    {e.concept}
                    <small>
                      {scenarios.find((s) => s.id === e.scenarioId)?.title}
                    </small>
                  </span>
                  <b>
                    {e.level === "independent-transfer"
                      ? save.completedGames[e.scenarioId]?.kernelVersion !== 1 ? "独立决策" : "情境完成"
                      : e.level === "guided"
                        ? "引导使用"
                        : "已见过"}
                  </b>
                </p>
              ))}
            </div>
          ) : (
            <p className="muted">第一份契约完成后，行动证据会留在这里。</p>
          )}
          </details>
          <label className="notes-label">
            给未来自己的便笺
            <textarea
              key={save.currentScenarioId}
              defaultValue={save.notes}
              maxLength={10000}
              placeholder="这次失败是因为什么？我改变了哪个环节？"
              onBlur={(e) => {
                const notes = e.target.value;
                void commit((p) => ({ ...p, notes }));
              }}
            />
          </label>
          <details className="settings-details">
            <summary>主线恢复检查点</summary>
            <p>主线最近三个派遣 / 构筑前的检查点。恢复会回到对应主线，远行尝试继续保留。</p>
            {save.checkpoints.map((checkpoint, i) => (
              <button
                className="button full"
                key={i}
                disabled={busy || readOnly}
                onClick={() => {
                  if (!confirm("恢复这个检查点？当前关卡将回到当时状态。"))
                    return;
                  let restored = false;
                  void commit((p) => {
                    if (`${executionContext(p)}:${executionEpoch.current}` !== actionContext) return p;
                    pauseSavedGames(p);
                    if (p.postSeason?.selectedMode) p.postSeason = reducePostSeason(p.postSeason, {type:'select-mode',mode:null},Object.values(p.completedGames));
                    restored = true; executionEpoch.current++;
                    return restoreCheckpoint(p, i);
                  }).then(okay => {if (okay && restored) {setAuto(false);setSuggestedBuild(undefined);setPanel(null);}});
                }}
              >
                <RotateCcw size={14} />
                {
                  scenarios.find((s) => s.id === checkpoint.scenarioId)?.title
                } · {checkpoint.state.events.length} 条事件
              </button>
            ))}
          </details>
          <details className="settings-details"><summary>普通远行委托 · 三个独立检查点</summary><p>恢复会保留已经使用的提示与已见案例。远征没有此类资源回退入口。</p>
            {postMode === 'challenge' && state.status !== 'won' && <button className="button full" disabled={busy || readOnly} onClick={()=>void changePost({type:'checkpoint'},'settings').then(()=>setToast('普通委托检查点已保存。')).catch(e=>setToast((e as Error).message))}><CheckCircle2 size={16}/>保留当前普通委托检查点</button>}
            {post.checkpoints.map((checkpoint,index)=><button className="button full" key={`${checkpoint.spec.templateId}-${index}`} disabled={busy || readOnly} onClick={()=>{if(confirm('恢复这份普通远行检查点？已使用的提示与已见案例继续保留。'))void changePost({type:'restore-checkpoint',index},null).catch(e=>setToast((e as Error).message));}}><RotateCcw size={14}/>{challengeTemplates.find(template=>template.id===checkpoint.spec.templateId)?.label} · {checkpoint.game.events.length} 条事件</button>)}
            {!post.checkpoints.length && <p className="muted">装配和派遣前会保留普通委托检查点，也可以主动刻写。</p>}
          </details>
          <button className="button full" disabled={busy || readOnly || postMode === 'expedition' && (post.activeExpedition!.status !== 'active' || state.status === 'won' || post.activeExpedition!.remaining <= 0)} onClick={()=>void retry()}><RotateCcw size={16}/>{postMode === 'expedition' ? '用剩余晶石重试本层 · 已花费用不退回' : '重新尝试当前委托'}</button>
          {postMode === 'expedition' && <p className="fine-print">本层重试后以当前剩余晶石开局。要收队或继续下一层，请进入远行大厅。</p>}
          <a
            className="archive-link"
            href="/archive/v1/"
            target="_blank"
            rel="noreferrer"
          >
            打开旧学习档案 ↗
          </a>
          <p className="fine-print">
            旧站笔记保留在档案中。八十四场作者设计冒险、二十四类变体委托和三层远征保留各自的行动证据；真实实验需要服务器连接与邀请码。
          </p>
        </Dialog>
      )}
      {panel === "lab" && (
        <Dialog
          title="真实 AI 实验台"
          kicker="限额实验 · 只操作虚拟世界"
          onClose={() => setPanel(null)}
          wide
        >
          <Lab />
        </Dialog>
      )}
      {panel === 'hall' && <Dialog title="回声的远行手册" kicker="24 类机制委托 · 三层共同资源远征" onClose={()=>setPanel(null)} wide>
        <div className="button-row"><button className="button" disabled={busy || readOnly} onClick={()=>void changePost({type:'select-mode',mode:null},null).catch(e=>setToast((e as Error).message))}><ArrowLeft size={16}/>返回主线现场</button><button className="button" onClick={()=>setPanel('map')}><Map size={16}/>查看城市地图</button></div>
        <ChallengeHall growth={growth} unlockedTemplateIds={unlockedTemplates} lockReasons={lockReasons} expeditionUnlocked={expeditionUnlocked} expeditionLockReason="先分别实际完成一类执行、一类信息、一类协作委托的主线来源。抽到的三类机制仍须各自已经解锁。" activeChallenge={post.currentChallenge} activeExpedition={post.activeExpedition} busy={busy || readOnly} initialTemplateId={practiceFocus} onStartChallenge={startChallenge} onStartExpedition={startExpedition} onContinue={kind=>changePost({type:'select-mode',mode:kind},null)} onExpeditionAction={controlExpedition}/>
      </Dialog>}
      {panel === 'atlas' && <Dialog title="回声的能力地图" kicker="真实主线记录 · 看懂下一步" onClose={()=>setPanel(null)} wide><LearningAtlas games={atlasGames} busy={busy || readOnly} onPractice={async templateId=>{if(!unlockedTemplates.includes(templateId))return;await open('hall');setPracticeFocus(templateId);setToast(`查看「${challengeTemplates.find(template=>template.id===templateId)?.label}」。接取与构筑由你决定。`);}}/></Dialog>}
    </div>
  );
}
