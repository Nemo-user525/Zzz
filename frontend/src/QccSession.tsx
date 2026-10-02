import { useEffect, useRef, useState } from 'react';
import { Drawer } from './Drawer';
import { WorkBuddyConnection } from './WorkBuddyConnection';

type Session = {configured:boolean; status:string; configurable:boolean; provider?:string; app_configured?:boolean; message?:string};
export function QccSession({active}:{active:boolean}) {
  const [session,setSession]=useState<Session|null>(null);
  const [open,setOpen]=useState(false);
  const [cookie,setCookie]=useState('');
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);
  const prompted=useRef(false);
  useEffect(()=>{
    let stopped=false;
    const read=async()=>{
      try {
        const response=await fetch('/api/consumer/qcc-session',{cache:'no-store'});
        if(!response.ok)return;
        const value:Session=await response.json();
        if(stopped)return;
        setSession(value);
        if(value.provider!=='workbuddy' && value.configurable && !prompted.current && (!value.configured || value.status==='login_required' || value.status==='verification_required')) {
          prompted.current=true;setOpen(true);
        }
      } catch { /* The other research channels can continue. */ }
    };
    void read();
    const timer=setInterval(()=>void read(),15000);
    return ()=>{stopped=true;if(timer)clearInterval(timer);};
  },[active]);
  const close=()=>{setCookie('');setOpen(false);};
  async function save(value:string) {
    setSaving(true);setMessage('');
    try {
      const response=await fetch('/api/consumer/qcc-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:value})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.message||'会话配置失败');
      setSession({...data,configurable:true});setCookie('');
      if(value)prompted.current=false;
      setMessage(value?'已配置本次服务会话。请重新查询；实际访问结果见调查过程。':'已清除本次会话。');
    } catch(error) {setMessage(error instanceof Error?error.message:'会话配置失败');}
    finally {setSaving(false);}
  }
  if(session?.provider==='workbuddy')return <WorkBuddyConnection session={session} onChange={value=>setSession({...value,provider:'workbuddy'})}/>;
  if(!session?.configurable)return null;
  return <>
    <button className="ghost" onClick={()=>setOpen(true)}>企查查登录与 Cookie{session.configured?' · 已配置':''}</button>
    {session.status==='rate_limited'&&<small>企查查当前限制访问，其他来源调查继续。</small>}
    {session.status==='verification_required'&&<small>企查查要求浏览器验证；请在官网完成验证，其他来源调查继续。</small>}
    {session.status==='access_denied'&&<small>企查查拒绝网页访问，需在官网核对账户权限与访问状态。</small>}
    {open&&<Drawer viewKey="qcc-session" onClose={close}>
      <h2>登录企查查并配置本人 Cookie</h2>
      {session.status==='verification_required'&&<p role="status">企查查返回了验证页面，尚未取得公司正文。请打开官网完成验证；如会话已更新，再配置新的 Cookie。</p>}
      <p>用于读取你有权访问的公司网页。项目会自动加载已配置的会话；你可在此更新或清除本次会话。弹窗输入只保存在本机后端内存，重启后恢复项目配置。</p>
      <p><a href="https://www.qcc.com/" target="_blank" rel="noreferrer">打开企查查并登录 ↗</a></p>
      <ol><li>本人完成企查查登录，打开要查询的公司页面。</li><li>按 F12，在 Network 中刷新页面，选择该公司页面请求，在 Request Headers 中复制 Cookie 的值。</li><li>在下面粘贴值，不包含「Cookie:」前缀，再重新查询。</li></ol>
      <form onSubmit={e=>{e.preventDefault();void save(cookie);}}>
        <label>企查查 Cookie<input aria-label="企查查 Cookie" type="password" autoComplete="off" maxLength={16384} value={cookie} onChange={e=>setCookie(e.target.value)} placeholder="仅粘贴本人请求头的 Cookie 值"/></label>
        <p>会话失效会再次提示登录。网站限流或验证码需要你在官网处理；程序保留来源状态。</p>
        <button className="consumer-primary" disabled={saving||!cookie.trim()}>配置本次会话</button>
        {session.configured&&<button type="button" className="ghost" disabled={saving} onClick={()=>void save('')}>清除会话</button>}
        <button type="button" className="ghost" onClick={close}>继续其他来源调查</button>
      </form>
      {message&&<p role="status">{message}</p>}
    </Drawer>}
  </>;
}
