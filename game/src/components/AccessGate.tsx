import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowRight,KeyRound,WifiOff} from 'lucide-react';
import {canonicalWorkshopTarget,hasWorkshopAccess,readActiveSession,saveWorkshopAccess,verifyAndPersistAccess} from '../access';
import './access-gate.css';

export default function AccessGate({children,enabled=import.meta.env.VITE_ACCESS_ENABLED==='true'}:{children:ReactNode;enabled?:boolean}){
  const [unlocked,setUnlocked]=useState(()=>!enabled||hasWorkshopAccess()||Boolean(readActiveSession()));
  const [passphrase,setPassphrase]=useState(''),[online,setOnline]=useState(()=>typeof navigator==='undefined'||navigator.onLine),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null),working=useRef(false),alive=useRef(true);
  const target=typeof window==='undefined'?null:canonicalWorkshopTarget(window.location.pathname,enabled,unlocked);
  useEffect(()=>{alive.current=true;if(enabled&&unlocked)saveWorkshopAccess();return()=>{alive.current=false;controller.current?.abort();};},[enabled,unlocked]);
  useEffect(()=>{if(target)window.location.replace(target);},[target]);
  useEffect(()=>{const change=()=>setOnline(navigator.onLine);window.addEventListener('online',change);window.addEventListener('offline',change);return()=>{window.removeEventListener('online',change);window.removeEventListener('offline',change);};},[]);
  useEffect(()=>{if(!unlocked)input.current?.focus({preventScroll:true});},[unlocked]);
  async function enter(){
    if(working.current)return;
    if(!navigator.onLine){setError('首次进入需要联网验证。已进入过的工坊可以继续离线冒险。');return;}
    working.current=true;setBusy(true);setError('');controller.current=new AbortController();
    const timeout=window.setTimeout(()=>controller.current?.abort(),12000);
    try{
      await verifyAndPersistAccess(passphrase,controller.current.signal);
      if(!alive.current)return;
      // Only local access keys change. IndexedDB progress is opened by the game after this gate.
      setPassphrase('');setUnlocked(true);
    }catch(cause){if(alive.current){setError((cause as Error).message);input.current?.focus({preventScroll:true});}}
    finally{window.clearTimeout(timeout);working.current=false;if(alive.current)setBusy(false);}
  }
  if(target)return <main className="access-gate"><section className="access-card"><p role="status">工坊已解锁，正在继续冒险…</p></section></main>;
  if(unlocked)return <>{children}</>;
  return <main className="access-gate"><section className="access-card" aria-labelledby="access-title">
    <div className="access-emblem" aria-hidden="true"><KeyRound size={30}/></div>
    <p className="access-eyebrow">回声工坊 · 失序之城</p>
    <h1 id="access-title">门后的灯，<br/>等你点亮。</h1>
    <p className="access-story">一座依靠言灵魔像运转的城市正在失序。带上回声，从第一次行动开始，学会创造自己的 Agent。</p>
    <form onSubmit={event=>{event.preventDefault();void enter();}}>
      <label htmlFor="workshop-passphrase">工坊口令</label>
      <input ref={input} id="workshop-passphrase" type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={passphrase} onChange={event=>setPassphrase(event.target.value)} placeholder="输入工坊口令" minLength={1} maxLength={128} required disabled={busy}/>
      <button type="submit" disabled={busy||!online||!passphrase.trim()}>{busy?'正在开门…':'进入工坊'}<ArrowRight size={19} aria-hidden="true"/></button>
    </form>
    {!online&&<p className="access-offline" role="status"><WifiOff size={18} aria-hidden="true"/>首次进入请联网验证，之前的存档不会被改动。</p>}
    {error&&<p className="access-error" role="alert">{error}</p>}
    <p className="access-footnote">主线冒险不限次数 · 本机保存进度 · 真实 AI 实验共用服务额度</p>
  </section></main>;
}
