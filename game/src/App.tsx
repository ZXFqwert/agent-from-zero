import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
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
import { createGame, reduceGame, validateBlueprint } from "./engine";
import type { AgentBlueprint, GameAction, GameState } from "./engine";
import { chapters, factLabels, profiles, scenarios } from "./content/scenarios";
import { chapterOneNpcs } from "./content/chapterOneStory";
import { uiStories } from "./content/stories";
import { getOpeningLines } from "./content/narrative";
import { budgetExplanation, displayFact } from "./content/presentation";
import { chapterComplete, isUnlocked, journeyOrder, nextMission } from "./content/progression";
import CommandDeck from "./components/CommandDeck";
import CityLedger from "./components/CityLedger";
import {
  downloadSave,
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
    [updateReady, setUpdateReady] = useState(false),
    [readOnly, setReadOnly] = useState(false);
  const [suggestedBuild,setSuggestedBuild] = useState<AgentBlueprint | undefined>();
  const [dialogueIndex,setDialogueIndex] = useState(0);
  const saveRef = useRef<PlayerSave | null>(null),
    busyRef = useRef(false),
    inputFile = useRef<HTMLInputElement>(null),
    ownsLock = useRef(!navigator.locks),
    lockOwner = useRef<symbol | undefined>(undefined),
    storageBlocked = useRef(false);
  const reducedMotion = useRef(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  ).current;
  useEffect(() => {
    let cancelled = false;
    void readSave()
      .then(async (stored) => {
        const next = stored ?? emptySave();
        for (const [id, game] of Object.entries(next.games)) {
          if (game.status === "running") {
            const action: GameAction = {
              id: crypto.randomUUID(),
              type: "pause",
            };
            next.games[id] = reduceGame(
              scenarios.find((s) => s.id === id)!,
              game,
              action,
            );
            next.actions[id] = [...(next.actions[id] ?? []), action];
          }
        }
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
    void import("./offline")
      .then(async (m) => {
        await m.registerOffline(setUpdateReady);
        const status = await m.getOfflineStatus();
        setOfflineChapters(status.chapterStatuses);
      })
      .catch(() => setOffline("离线组件暂未就绪，可稍后重试。"));
  }, []);

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
  const act = useCallback(
    async (input: InputAction) => {
      const action = { ...input, id: crypto.randomUUID() } as GameAction;
      let victory = false,
        accepted = false;
      const okay = await commit((previous) => {
        previous.started = true;
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
    [commit],
  );
  const scenario =
    scenarios.find((s) => s.id === save?.currentScenarioId) ?? scenarios[0];
  const state = save?.games[scenario.id] ?? createGame(scenario);
  const gameIndex = [...scenarios].sort((a,b)=>journeyOrder.indexOf(a.id)-journeyOrder.indexOf(b.id)).filter(q=>q.chapter===scenario.chapter).findIndex(q=>q.id===scenario.id);
  const story = uiStories[scenario.id];
  const orderedScenarios = [...scenarios].sort((a,b)=>journeyOrder.indexOf(a.id)-journeyOrder.indexOf(b.id));
  const nextId = nextMission(scenario.id, save?.completedScenarioIds ?? [], scenarios.map(q=>q.id));
  const nextIndex = scenarios.findIndex(q=>q.id === nextId);
  const mainComplete = chapterComplete(save?.completedScenarioIds ?? [],scenario.chapter);
  const openingLines=getOpeningLines(scenario.id,save?.choices ?? {});
  const openingLine=openingLines[Math.min(dialogueIndex,openingLines.length-1)];
  useEffect(()=>setDialogueIndex(0),[scenario.id]);
  useEffect(() => {
    if (!auto || panel || busy || state.status !== "running" || document.hidden)
      return;
    const timeout = setTimeout(() => void act({ type: "step", source: "scheduler" }), 1350);
    return () => clearTimeout(timeout);
  }, [auto, panel, busy, state, act]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) {
        setAuto(false);
        if (
          saveRef.current?.games[saveRef.current.currentScenarioId]?.status ===
          "running"
        )
          void act({ type: "pause" });
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [act]);
  async function open(next: Panel) {
    setAuto(false);
    if (state.status === "running" && !(await act({ type: "pause" }))) return;
    setPanel(next);
  }
  async function launch(automatic = true) {
    if (state.status === "won") return false;
    const okay = await act({
      type: state.status === "paused" ? "resume" : "dispatch",
      mode: automatic ? "automatic" : "manual",
    });
    if (okay) setAuto(automatic);
    return okay;
  }
  async function selectScenario(index: number) {
    const target = scenarios[index];
    if (
      !target ||
      !isUnlocked(target.id, save?.completedScenarioIds ?? [])
    )
      return;
    if(!online&&!offlineChapters[`chapter-0${target.chapter}`]){setToast('这一章尚未下载场景，请联网后下载离线包。');return;}
    let draft: AgentBlueprint | undefined;
    const changed = await commit((previous) => {
      const prior=previous.games[previous.currentScenarioId]?.blueprint;
      if(!previous.games[target.id]) {
        previous.games[target.id]=createGame(target);
        if(prior) {
          const inherited={...structuredClone(prior),budget:Math.min(prior.budget,target.limits?.maxBudget ?? 20)};
          const targetIds=new Set([...target.observations,...target.operations].map(o=>o.target));
          inherited.permissions=inherited.permissions.filter(id=>id==='*'||targetIds.has(id));
          if(inherited.toolPermissions)for(const key of ['observe','operate','verify'] as const){const values=inherited.toolPermissions[key];if(values)inherited.toolPermissions[key]=values.filter(id=>id==='*'||targetIds.has(id));}
          delete inherited.goalOrder;
          delete inherited.toolArguments;
          if((target.engineVersion??1)<3)delete inherited.stableRequestKeys;
          if((target.engineVersion??1)<4)delete inherited.loopPolicy;
          if((target.engineVersion??1)<7)delete inherited.instructionPolicy;
          if(validateBlueprint(target,inherited).length === 0) {
            const action:GameAction={id:crypto.randomUUID(),type:'configure',blueprint:inherited};
            previous.games[target.id]=reduceGame(target,previous.games[target.id],action);
            previous.actions[target.id]=[action];
          } else draft=inherited;
        }
      }
      previous.currentScenarioId = target.id;
      previous.games[target.id] ??= createGame(target);
      previous.started = true;
      return previous;
    });
    if (!changed) return;
    setSuggestedBuild(draft);
    setPanel(draft ? 'workshop' : null);
    if(draft) setToast('上份契约已经带来。新的现场约束需要你调整装配。');
    setAuto(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function configure(build: AgentBlueprint) {
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
    if (!(await commit(resetCurrentScenario))) return;
    setAuto(false);
    setPanel(null);
  }
  async function hint() {
    await act({ type: "hint" });
    setToast(
      story?.hint ?? (scenario.kind === "guided"
        ? guidance()
        : "检查工具是否齐全、回执是否进入上下文、结束前是否验收，以及预算是否足够。"),
    );
  }
  function guidance() {
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
          <span className="aside-chapter">前七章 / 港口至七匠之桥</span>
          <p className="muted">从一句“完成了”，到真正改变世界。</p>
        </div>
        <div className="aside-bottom">
          <span>单人剧情 × 伙伴构筑 × Agent 学习</span>
          <span>失序之城 · v0.8</span>
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
            {offlineChapters[`chapter-0${scenario.chapter}`]
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
                  onClick={() =>
                    void commit((p) => ({
                      ...p,
                      started: true,
                      games: { [scenarios[0].id]: createGame(scenarios[0]) },
                    }))
                  }
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
                  {chapters[scenario.chapter-1]?.[0]} <span className="dot-separator">/</span>{" "}
                  {scenario.subtitle}
                </div>
                <h1>
                  {scenario.title}
                  <span
                    className={`status-dot ${state.status === "running" ? "pulsing" : ""}`}
                  />
                </h1>
              </div>
              <button
                className="quest-number"
                aria-label="查看章节地图"
                onClick={() => void open("map")}
              >
                <span>{String(gameIndex + 1).padStart(2, "0")}</span>
                <small>/ {String(scenarios.filter(q=>q.chapter===scenario.chapter).length).padStart(2,"0")}</small>
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
                /> : <div className="scene-fallback"><WifiOff/><span>本章场景尚未下载。联网下载，或从地图选择已下载的章节。</span></div>}
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
                    <Shield size={14} /> {scenario.chapter===7?"同声护盾":scenario.chapter===6?"僭令护盾":scenario.chapter===5?"旧律护甲":scenario.chapter===4?"旧知面具":scenario.chapter===3?"续刻护盾":scenario.chapter===2?"纸甲护盾":"空言护盾"}
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
                <small>{state.status === 'exhausted' && state.runtime ? state.runtime.missionRemaining === 0 ? '委托能量用完' : '派遣已停止' : statusNames[state.status]}</small>
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
                  收起这段回响，继续旅程 <ArrowRight size={17} />
                </button>
              ) : (
                <div className="action-row">
                  <button
                    className="button workshop-button"
                    disabled={busy || readOnly}
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
                      disabled={busy}
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
                      disabled={busy || readOnly}
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
                  disabled={busy || state.status === "won"}
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
                  disabled={busy || state.status === "won"}
                >
                  <HelpCircle size={14} />
                  灵感
                </button>
              </div>
              {state.status === 'exhausted' && <div className="retry-callout"><p>{budgetExplanation(state)}</p><button className="button" disabled={busy} onClick={()=>void retry()}><RotateCcw size={16}/>从委托起点重试</button></div>}
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
          <Workshop
            key={`${scenario.id}-${state.events.length}`}
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
            state={state}
            scenario={scenario}
            actions={save.actions[scenario.id] ?? []}
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
            已制作七章，共四十二场主线与十四条支线。支线可以晚些回来；已修好的设施与旅途记录会保留。
          </p>
          <details className="city-fold"><summary>城区变化与旅途收藏</summary><CityLedger save={save}/></details>
          <div className="chapter-map">
            {chapters.map(([name, description, tag], i) => (
              <div
                key={name}
                className={`chapter-node ${scenarios.some(q=>q.chapter===i+1) ? "available" : ""}`}
              >
                <span className="chapter-index">
                  {scenarios.some(q=>q.chapter===i+1) ? <Flame size={20} /> : <Lock size={17} />}
                </span>
                <div>
                  <small>CHAPTER {String(i + 1).padStart(2, "0")}</small>
                  <h3>{name}</h3>
                  <p>{description}</p>
                  {scenarios.some(q=>q.chapter===i+1) ? (
                    <div className="map-missions">
                      {orderedScenarios.filter(q=>q.chapter===i+1).map((q) => (
                        <button key={q.id} disabled={!isUnlocked(q.id,save.completedScenarioIds)} onClick={() => void selectScenario(scenarios.indexOf(q))}>
                          {save.completedScenarioIds.includes(q.id) ? <CheckCircle2 size={15}/> : !isUnlocked(q.id,save.completedScenarioIds) ? <Lock size={14}/> : <Play size={14}/>}
                          <span>{q.title}<small>{uiStories[q.id]?.role === 'side' ? '支线' : ''}</small></span><ChevronRight size={14}/>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="chapter-tag">{tag} · 筹备中</span>
                  )}
                </div>
              </div>
            ))}
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
                模型只是系统的一部分。工具、上下文、权限与反馈共同决定伙伴如何完成任务。七组专属试炼将在后续章节开放。
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
      {panel === "victory" && (
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
      {panel === "manual" && <Dialog title="探索与指挥" kicker="能力 → 目标 → 成本 → 执行" onClose={()=>setPanel(null)}>
        <CommandDeck onTeam={async data=>{if(data.operation==='tick'&&state.status==='paused'&&!(await launch(false)))return;await act(data);}} onSecurity={data=>act(data)} onArchive={async data=>{if(data.type==='skill'&&data.operation==='run'&&state.status!=='running'&&!(await launch(false)))return;await act(data);}} onContext={data=>act(data)} onReceive={(callId,receiptId)=>act({type:'receive',callId,receiptId})} state={state} scenario={scenario} busy={busy} onWorkshop={()=>void open('workshop')}
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
                  if (file.size > 8_000_000)
                    throw new Error("存档不能超过 8 MB。");
                  const imported = validateSave(JSON.parse(await file.text()));
                  if (
                    confirm(
                      "导入将替换当前进度。建议先导出当前存档。确认导入？",
                    )
                  ) {
                    for (const [id, game] of Object.entries(imported.games)) {
                      if (game.status === "running") {
                        const action: GameAction = {
                          id: crypto.randomUUID(),
                          type: "pause",
                        };
                        imported.games[id] = reduceGame(
                          scenarios.find((s) => s.id === id)!,
                          game,
                          action,
                        );
                        imported.actions[id] = [
                          ...(imported.actions[id] ?? []),
                          action,
                        ];
                      }
                    }
                    if (await commit(() => imported, true)) {
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
          <div className="segmented">{[...new Set(scenarios.map(scenario=>scenario.chapter))].map(chapter=><button key={chapter} className={offlineChapter===chapter?'active':''} disabled={downloading} onClick={()=>{setOfflineChapter(chapter);setOffline('');}}>第 {chapter} 章 {offlineChapters[`chapter-0${chapter}`]?'✓':''}</button>)}</div>
          <div className="offline-box">
            <WifiOff />
            <div>
              <strong>
                {`${chapters[offlineChapter-1][0]} · ${offlineReady?"已可离线":"等待下载"}`}
              </strong>
              <p>
                {offline || "下载场景、角色与游戏程序后，可以断网继续冒险。"}
              </p>
            </div>
          </div>
          <button
            className="button full"
            disabled={downloading || !online || !import.meta.env.PROD}
            onClick={() => void downloadChapter()}
          >
            <Download size={17} />
            {downloading
              ? "正在下载…"
              : offlineReady
                ? "重新核验离线包"
                : "下载本章离线包"}
          </button>
          {!import.meta.env.PROD && (
            <p className="fine-print">离线安装在正式构建中启用。</p>
          )}
          {updateReady && (
            <button
              className="button full"
              onClick={async () => {
                const m = await import("./offline");
                await m.activateUpdate();
                location.reload();
              }}
            >
              在当前安全检查点更新游戏
            </button>
          )}
          <div className="section-label">学习证据</div>
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
            <summary>恢复检查点与重试</summary>
            <p>最近三个派遣 / 构筑前的检查点保留在本机。</p>
            {save.checkpoints.map((checkpoint, i) => (
              <button
                className="button full"
                key={i}
                onClick={() => {
                  if (!confirm("恢复这个检查点？当前关卡将回到当时状态。"))
                    return;
                  void commit((p) => {
                    return restoreCheckpoint(p, i);
                  }).then(() => setPanel(null));
                }}
              >
                <RotateCcw size={14} />
                {
                  scenarios.find((s) => s.id === checkpoint.scenarioId)?.title
                } · {checkpoint.state.events.length} 条事件
              </button>
            ))}
            <button className="button full" onClick={() => void retry()}>
              <RotateCcw size={16} />
              重新尝试当前委托
            </button>
          </details>
          <a
            className="archive-link"
            href="/archive/v1/"
            target="_blank"
            rel="noreferrer"
          >
            打开旧学习档案 ↗
          </a>
          <p className="fine-print">
            旧站笔记保留在档案中。目前开放七章共五十六场冒险，后续章节继续制作。
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
    </div>
  );
}
