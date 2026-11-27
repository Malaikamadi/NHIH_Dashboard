import {useEffect,useState} from 'react'
import {fetchPowerStatus,fetchPowerHistory,updatePower,type PowerStatus,type PowerEvent} from '../api'
const label=(source:PowerStatus['source'])=>source==='grid'?'National Grid':source==='generator'?'Generator':'Not recorded'
const date=(value:string|null)=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Freetown'}):'—'
export function PowerCard(){
 const [status,setStatus]=useState<PowerStatus|null>(null)
 const [failed,setFailed]=useState(false)
 useEffect(()=>{let alive=true;const load=()=>fetchPowerStatus().then(s=>{if(alive){setStatus(s);setFailed(false)}}).catch(()=>{if(alive)setFailed(true)});void load();const timer=setInterval(load,15000);return()=>{alive=false;clearInterval(timer)}},[])
 return <div className={`gcard gcard-${failed?'warn':status?.source==='grid'?'ok':status?.source==='generator'?'warn':'info'} is-static`}><div><span>Hub Power Status</span><strong style={{fontSize:'clamp(16px,1.6vw,24px)'}}>{failed?'Unavailable':status?label(status.source):'Loading…'}</strong><em>{failed?'Unable to verify source':status?.changedAt?'Since '+date(status.changedAt):'Awaiting operator update'}</em></div><span className="gcard-icon" aria-hidden="true">ϟ</span></div>
}
export function PowerDesk(){
 const [status,setStatus]=useState<PowerStatus|null>(null)
 const [history,setHistory]=useState<PowerEvent[]>([])
 const [source,setSource]=useState<'grid'|'generator'>('grid')
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [page,setPage]=useState(1)
 const refresh=async()=>{const [s,h]=await Promise.all([fetchPowerStatus(),fetchPowerHistory()]);setStatus(s);setHistory(h)}
 useEffect(()=>{void refresh().catch(e=>setError(String(e)))},[])
 return <main className="office-power"><header><h1>Power management</h1><p>Record the Hub's active electricity supply and review switching history.</p></header><section className="office-power-current"><small>CURRENT RECORDED SOURCE</small><h2>{status?label(status.source):'Unavailable'}</h2><p>Last transition: {date(status?.changedAt??null)}</p></section><form className="office-power-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await updatePower(source,reason);setReason('');setPage(1);await refresh()}catch(e){setError(String(e))}finally{setBusy(false)}}}><h2>Update power source</h2><div className="office-power-options">{(['grid','generator'] as const).map(s=><label key={s}><input type="radio" name="source" checked={source===s} onChange={()=>setSource(s)}/><strong>{label(s)}</strong><small>{s==='grid'?'Utility supply':'Backup supply'}</small></label>)}</div><label>Reason (optional)<textarea value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Grid outage, supply restored…"/></label><button className="primary-btn" disabled={busy||!status||status.source===source}>{busy?'Saving…':'Save power source'}</button></form>{error&&<p role="alert" className="warn-text">{error}</p>}<section className="office-power-history"><h2>Transition history</h2><p>Latest 100 recorded changes · GMT</p><div className="office-power-table"><div><strong>Source</strong><strong>Switched at</strong><strong>Reason</strong></div>{history.slice((page-1)*10,page*10).map(h=><div key={h.id}><strong>{label(h.source)}</strong><span>{date(h.changedAt)}</span><span>{h.reason||'—'}</span></div>)}</div>{!history.length&&<p>No transitions recorded.</p>}<div className="office-power-pages"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(history.length/10))}</span><button disabled={page*10>=history.length} onClick={()=>setPage(p=>p+1)}>Next</button></div></section></main>
}
