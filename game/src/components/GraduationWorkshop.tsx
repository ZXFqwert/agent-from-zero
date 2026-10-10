import {useEffect, useRef, useState, type ReactNode} from 'react';
import {ArrowRight, BookOpen, Check, Code2, Download, FileCheck2, Hammer, Route, Upload} from 'lucide-react';
import {GRADUATION_PROJECT, GRADUATION_STAGES, type GraduationStageId} from '../graduation/project';
import {emptyGraduationProgress, MAX_PROGRESS_BYTES, MAX_REPORT_BYTES, personalBriefFingerprint, personalBriefJson, readGraduationProgress, validateGraduationProgress, validateLocalExecutionReport, writeGraduationProgress, type GraduationProgress, type LocalExecutionReport, type PersonalBrief} from '../graduationProgress';
import {MAX_HISTORY_BYTES, validateCurriculumHistory, type CurriculumHistory} from '../curriculumHistory';
import './learning-workshop.css';

export interface GraduationWorkshopProps {
  architectureTrial?: ReactNode;
  onCurriculum: () => void;
  history: CurriculumHistory | null;
  historyNotice?: string;
  onHistoryImport: (history: CurriculumHistory) => Promise<void>;
  busy?: boolean;
}

function download(filename: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], {type: 'application/json;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const examples: Array<{title: string; brief: PersonalBrief}> = [
  {title: '我的笔记管家', brief: {purpose: '整理专用目录中的学习笔记，生成下一次要复习的清单。', acceptance: '清单只引用实际读过的笔记；每项包含来源文件、要复习的问题和完成条件。文件写好后再次读取验证。', toolBoundaries: '只能读取练习目录中的文本；写入清单必须逐次批准；不得访问目录外文件或执行系统命令。'}},
  {title: '我的清单助手', brief: {purpose: '根据专用目录里的任务清单，生成今天可以执行的三个具体动作。', acceptance: '三个动作都来自现有清单，保留原编号；已完成任务不会重复出现；生成文件与实际内容一致。', toolBoundaries: '只读任务清单；生成计划时先展示写入内容并取得批准；不发送消息、不删除原任务。'}},
];

export default function GraduationWorkshop({architectureTrial, onCurriculum, history, historyNotice, onHistoryImport, busy = false}: GraduationWorkshopProps) {
  const [progress, setProgress] = useState<GraduationProgress>(emptyGraduationProgress), [draft, setDraft] = useState<PersonalBrief>({purpose: '', acceptance: '', toolBoundaries: ''});
  const [view, setView] = useState<'brief' | 'build' | 'blind'>('brief'), [notice, setNotice] = useState(''), [working, setWorking] = useState(false), [storageReady, setStorageReady] = useState(false);
  const [briefHash, setBriefHash] = useState<string | null>(null);
  const [pendingHistory, setPendingHistory] = useState<CurriculumHistory | null>(null), [pendingProgress, setPendingProgress] = useState<GraduationProgress | null>(null);
  const reportInput = useRef<HTMLInputElement>(null), backupInput = useRef<HTMLInputElement>(null), historyInput = useRef<HTMLInputElement>(null);
  const pending = working || busy;
  const active = GRADUATION_STAGES.find(stage => stage.id === progress.activeStage)!;
  const report = progress.reports[active.id];
  const locallyPassed = (item?: LocalExecutionReport) => !!item && item.summary.failed === 0 && item.summary.total > 0 && (item.stageId !== 'personal' || item.scope.briefSha256 === briefHash && briefHash !== null);
  const passed = GRADUATION_STAGES.filter(stage => locallyPassed(progress.reports[stage.id])).length;
  const activeIndex = GRADUATION_STAGES.findIndex(stage => stage.id === active.id);
  const implementationVersions = new Set(Object.values(progress.reports).map(item => item?.scope.learnerImplementationSha256)).size;

  useEffect(() => {
    try {const stored = readGraduationProgress(); setProgress(stored); setDraft(stored.brief); setView(stored.brief.purpose ? 'build' : 'brief'); setStorageReady(true);}
    catch {setNotice('学习工坊记录暂时无法读取，原记录保留。可以导入兼容备份后继续；主线存档不受影响。');}
  }, []);
  useEffect(() => {
    let cancelled = false;
    setBriefHash(null);
    void personalBriefFingerprint(progress.brief).then(hash => {if (!cancelled) setBriefHash(hash);}).catch(() => {
      if (!cancelled) setNotice('个人委托指纹暂未核对。个人阶段暂不显示通过；可在HTTPS连接下重新打开工坊。');
    });
    return () => {cancelled = true;};
  }, [progress.brief]);

  const persist = (next: GraduationProgress, recovery = false) => {
    if (!storageReady && !recovery) {setNotice('请先导入兼容的工坊备份，避免覆盖无法读取的原记录。'); return false;}
    try {writeGraduationProgress(next); setProgress(next); setStorageReady(true); return true;}
    catch {setNotice('工坊记录未能保存，请检查浏览器存储设置。当前填写内容仍留在页面上。'); return false;}
  };
  const chooseStage = (id: GraduationStageId) => {if (!pending && persist({...progress, activeStage: id})) {setView('build'); setNotice('');}};
  const saveBrief = () => {
    if (pending) return;
    if (Object.values(draft).some(value => value.trim().length < 10)) {setNotice('把三项都写具体一点：至少10个字，说明做什么、怎样验收，以及能动哪些东西。'); return;}
    const reports = {...progress.reports};
    if (personalBriefJson(draft) !== personalBriefJson(progress.brief)) delete reports.personal;
    if (persist({...progress, brief: draft, reports})) {setView('build'); setNotice('个人委托已留档。先接通一个小环节，再逐步让它运行。修改委托后，个人阶段需要针对新委托重跑。');}
  };
  const importReport = async (file?: File) => {
    if (!file || pending) return;
    setWorking(true); setNotice('');
    try {
      if (file.size > MAX_REPORT_BYTES) throw new Error('报告超过256KiB。');
      const checked = validateLocalExecutionReport(JSON.parse(await file.text()));
      if (checked.stageId === 'personal' && checked.scope.briefSha256 !== await personalBriefFingerprint(progress.brief)) throw new Error('这份个人阶段报告对应另一份委托。请导出当前 personal-brief.json 并重跑检查。');
      if (persist({...progress, activeStage: checked.stageId, reports: {...progress.reports, [checked.stageId]: checked}})) {
        setView('build'); setNotice(checked.summary.failed === 0 ? '本机检查报告已收录。继续下一步，或修改代码后重新检查。报告没有调用真实模型。' : '失败线索已收录。先修好其中一个问题，再重跑本阶段。');
      }
    } catch (error) {setNotice(`报告没有导入：${(error as Error).message}`);}
    finally {setWorking(false); if (reportInput.current) reportInput.current.value = '';}
  };
  const readBackup = async (file?: File, kind: 'progress' | 'history' = 'progress') => {
    if (!file || pending) return;
    setWorking(true); setNotice('');
    try {
      if (file.size > (kind === 'history' ? MAX_HISTORY_BYTES : MAX_PROGRESS_BYTES)) throw new Error('备份超过容量。');
      const value: unknown = JSON.parse(await file.text());
      if (kind === 'history') setPendingHistory(validateCurriculumHistory(value));
      else setPendingProgress(validateGraduationProgress(value));
    } catch (error) {setNotice(`备份没有导入：${(error as Error).message}`);}
    finally {setWorking(false); if (backupInput.current) backupInput.current.value = ''; if (historyInput.current) historyInput.current.value = '';}
  };
  const applyHistory = async () => {
    if (!pendingHistory || pending) return;
    setWorking(true);
    try {await onHistoryImport(pendingHistory); setPendingHistory(null); setNotice('学习回访备份已恢复，主线存档与奖励保持原样。');}
    catch (error) {setNotice(`学习回访尚未恢复：${(error as Error).message}`);}
    finally {setWorking(false);}
  };
  return <div className="graduation-workshop learning-workshop">
    <header className="workshop-hero"><span className="workshop-kicker"><Hammer size={16}/>把回声带到你的世界</span><h2>契约师毕业工坊</h2><p>先接一份属于你的委托，再亲手接通模型、工具和验收。游戏行动记录、本机编程检查和真实模型实验各自留痕。</p><div className="workshop-metrics"><span><strong>{passed}<small> / 8</small></strong>阶段有通过的本机报告</span><span><strong>{history?.records.length ?? '—'}</strong>保留的新委托完成记录</span></div></header>
    <div className="workshop-nav" aria-label="毕业工坊区域"><button className={view === 'brief' ? 'is-active' : ''} onClick={() => setView('brief')}><BookOpen size={16}/>我的委托</button><button className={view === 'build' ? 'is-active' : ''} onClick={() => setView('build')}><Code2 size={16}/>亲手构筑</button>{architectureTrial && <button className={view === 'blind' ? 'is-active' : ''} onClick={() => setView('blind')}><Route size={16}/>七匠盲试</button>}</div>
    {view === 'brief' && <section className="graduation-brief" aria-labelledby="personal-brief-title"><h3 id="personal-brief-title">你希望它每天替你做什么？</h3><p>从可核验的小事开始。回声的本领由这份契约决定。</p><div className="workshop-examples">{examples.map(example => <button className="workshop-button secondary" key={example.title} disabled={pending} onClick={() => {setDraft({...example.brief}); setNotice('范例已经放进草稿。把它改成你的真实用途后，签订委托。');}}>{example.title}<ArrowRight size={15}/></button>)}</div>
      <label>我真正的用途<textarea value={draft.purpose} maxLength={2000} rows={3} placeholder="例如：把我的学习笔记整理成明天能执行的复习计划。" onChange={event => setDraft({...draft, purpose: event.target.value})}/></label>
      <label>我怎样知道它完成了<textarea value={draft.acceptance} maxLength={2000} rows={3} placeholder="必须能通过文件、状态或实际结果检查，不能只说‘回答正确’。" onChange={event => setDraft({...draft, acceptance: event.target.value})}/></label>
      <label>工具能做什么，什么时候需要我批准<textarea value={draft.toolBoundaries} maxLength={2000} rows={3} placeholder="明确可读的目录、可写的目标，以及不能执行的动作。" onChange={event => setDraft({...draft, toolBoundaries: event.target.value})}/></label>
      <button className="workshop-button" disabled={pending} onClick={saveBrief}>签订我的委托<ArrowRight size={16}/></button>
    </section>}
    {view === 'build' && <section aria-labelledby="personal-build-title">
      <div className="graduation-brief-strip"><BookOpen size={16}/><p>{progress.brief.purpose || '先写下自己的用途，让毕业构筑有明确的完成条件。'}</p><button className="workshop-button secondary" onClick={() => setView('brief')}>修改委托</button></div>
      <article className="workshop-next"><span className="workshop-kicker"><Code2 size={16}/>这一步，只接通一个环节</span><h3 id="personal-build-title">{active.title}</h3><p>{active.principle}</p><p className="graduation-task">{active.task}</p><details className="workshop-explainer"><summary>本步怎样验收</summary><ul>{active.acceptance.map(line => <li key={line}>{line}</li>)}</ul></details>
        <ol className="graduation-run-steps"><li>下载项目并解压到专用文件夹。首次下载后先读 README.md。<a className="workshop-button secondary" href={GRADUATION_PROJECT.downloadUrl} download={GRADUATION_PROJECT.filename}><Download size={16}/>下载可运行 Python 工坊</a></li><li>只补本步对应函数；在这个文件夹的终端运行：<code>{active.command}</code>{active.id === 'personal' && <button className="workshop-button secondary" disabled={!progress.brief.purpose || pending} onClick={() => download('personal-brief.json', personalBriefJson(progress.brief))}><Download size={15}/>导出当前个人委托</button>}</li><li>查看失败线索，修正后重跑，再把对应 reports 文件带回这里。<button className="workshop-button" disabled={pending || !storageReady} onClick={() => reportInput.current?.click()}><Upload size={16}/>导入本机检查报告</button></li></ol>
        <p className="workshop-note">Python 3.10+；前八步使用本机脚本模型，不需要 API Key，也不消耗实验额度。需要在可运行 Python 的电脑上完成，手机可以继续看记录、玩游戏。真实连接按项目 README 的显式 --live 步骤另行验证。</p>
      </article>
      {report && <article className={`graduation-report ${locallyPassed(report) ? 'is-passed' : ''}`} aria-labelledby="graduation-report-title"><h3 id="graduation-report-title"><FileCheck2 size={18}/>{locallyPassed(report) ? '本机检查通过' : '回执里还有失败线索'}</h3><p>{report.summary.passed} / {report.summary.total} 项通过 · {report.createdAt.replace('T', ' ').replace('Z', ' UTC')}</p><ul>{report.checks.map(check => <li key={check.id}><span className={check.status === 'passed' ? 'is-passed' : ''}>{check.status === 'passed' ? <Check size={14}/> : <Route size={14}/>}</span><div><strong>{check.id}</strong><p>{check.message}</p></div></li>)}</ul><details className="workshop-explainer"><summary>报告来源与代码指纹</summary><code>{report.scope.learnerImplementationSha256}</code><p>这份本机文件可以编辑，只作为你带回的执行记录。通过脚本情境不代表真实模型、独立理解或个人用途已经验证。</p></details></article>}
      {report?.stageId === 'personal' && report.scope.briefSha256 !== briefHash && <p className="workshop-note">这份个人阶段报告尚未与当前委托匹配。请导出当前委托并重新运行检查。</p>}
      {implementationVersions > 1 && <p className="workshop-note">报告来自 {implementationVersions} 个代码版本，呈现的是各步历史检查。改动后请重跑受影响的步骤；这些报告尚不能说明同一份最终代码全部通过。</p>}
      {locallyPassed(report) && activeIndex < GRADUATION_STAGES.length - 1 && <button className="workshop-button" disabled={pending} onClick={() => chooseStage(GRADUATION_STAGES[activeIndex + 1].id)}>接通下一环<ArrowRight size={16}/></button>}
      <details className="workshop-explainer graduation-stage-selector"><summary>八环构筑路线 · 自己选择当前环节</summary><div>{GRADUATION_STAGES.map(stage => <button className="workshop-button secondary" key={stage.id} disabled={pending} aria-current={stage.id === active.id ? 'step' : undefined} onClick={() => chooseStage(stage.id)}>{locallyPassed(progress.reports[stage.id]) ? <Check size={15}/> : <Route size={15}/>}<span>{stage.title}<small>{locallyPassed(progress.reports[stage.id]) ? '有通过的本机报告' : progress.reports[stage.id] ? '有待修正的报告' : '尚无检查报告'}</small></span></button>)}</div></details>
    </section>}
    {view === 'blind' && <section aria-label="无名蓝图试炼">{architectureTrial}<p className="workshop-note">盲试的构筑留在此浏览器，独立于主线与编程报告。下方备份覆盖委托、报告与学习回访；盲试可以重新构筑。</p></section>}
    {notice && <p className="workshop-notice" role="status">{notice}</p>}
    {historyNotice && <p className="workshop-note">{historyNotice}</p>}
    <button className="workshop-button secondary" onClick={onCurriculum}><LinkIcon/>返回核心学习链<ArrowRight size={15}/></button>
    <details className="workshop-explainer"><summary>工坊备份与换设备</summary><p>主线存档仍在行囊中导出。个人委托／本机报告与新的间隔回访记录各自导出，不改变旧存档格式。</p><div className="workshop-backup-buttons"><button className="workshop-button secondary" disabled={pending || !storageReady} onClick={() => download('echo-graduation-workshop-v1.json', JSON.stringify(progress, null, 2))}><Download size={15}/>导出委托与报告</button><button className="workshop-button secondary" disabled={pending} onClick={() => backupInput.current?.click()}><Upload size={15}/>导入委托与报告</button><button className="workshop-button secondary" disabled={pending || !history} onClick={() => history && download('echo-curriculum-history-v1.json', JSON.stringify(history))}><Download size={15}/>导出学习回访</button><button className="workshop-button secondary" disabled={pending} onClick={() => historyInput.current?.click()}><Upload size={15}/>导入学习回访</button></div>
      {pendingProgress && <div className="workshop-import-preview"><p>将恢复这份个人委托：{pendingProgress.brief.purpose || '尚未填写'}，包含 {Object.keys(pendingProgress.reports).length} 份检查报告。会替换此工坊的委托与报告。</p><button className="workshop-button" disabled={pending} onClick={() => {if (persist(pendingProgress, true)) {setDraft(pendingProgress.brief); setPendingProgress(null); setNotice('工坊备份已恢复，主线存档保持原样。');}}}>确认恢复委托与报告</button><button className="workshop-button secondary" onClick={() => setPendingProgress(null)}>保留当前记录</button></div>}
      {pendingHistory && <div className="workshop-import-preview"><p>这份备份包含 {pendingHistory.records.length} 条已验证委托完成记录。将替换当前学习回访历史，主线进度和奖励不变。</p><button className="workshop-button" disabled={pending} onClick={() => void applyHistory()}>确认恢复学习回访</button><button className="workshop-button secondary" onClick={() => setPendingHistory(null)}>保留当前记录</button></div>}
    </details>
    <input ref={reportInput} type="file" accept="application/json,.json" hidden aria-label="本机检查报告文件" onChange={event => void importReport(event.target.files?.[0])}/>
    <input ref={backupInput} type="file" accept="application/json,.json" hidden aria-label="个人工坊备份文件" onChange={event => void readBackup(event.target.files?.[0])}/>
    <input ref={historyInput} type="file" accept="application/json,.json" hidden aria-label="学习回访备份文件" onChange={event => void readBackup(event.target.files?.[0], 'history')}/>
  </div>;
}

function LinkIcon() {return <BookOpen size={15}/>;}
