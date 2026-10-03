import { useState } from 'react';
import { Drawer } from './Drawer';

type Connection = {configured:boolean; configurable:boolean; status:string; app_configured?:boolean; message?:string};

export function WorkBuddyConnection({session,onChange}:{session:Connection;onChange:(value:Connection)=>void}) {
  const [open,setOpen]=useState(session.configurable&&new URLSearchParams(window.location.search).get('configure')==='workbuddy');
  const [clientId,setClientId]=useState('');
  const [secret,setSecret]=useState('');
  const [redirect,setRedirect]=useState(`${window.location.origin}/api/consumer/workbuddy/callback`);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const close=()=>{setSecret('');setOpen(false);};
  async function post(path:string,body?:unknown) {
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body??{})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.message||'连接配置未完成');
    return data;
  }
  async function save() {
    setBusy(true);setNotice('');
    try {
      const value=await post('/api/consumer/workbuddy/config',{client_id:clientId,client_secret:secret,redirect_uri:redirect});
      setSecret('');onChange({...value,configurable:true});setNotice('配置已保存。应用审核通过后，点击下方授权。');
    } catch(error) {setNotice(error instanceof Error?error.message:'配置未完成');}
    finally {setBusy(false);}
  }
  async function authorize() {
    setBusy(true);setNotice('');
    try {
      const value=await post('/api/consumer/workbuddy/authorize');
      const url=new URL(value.authorization_url);
      if(url.origin!=='https://www.workbuddy.cn'||url.pathname!=='/openapi/v2/authorize')throw new Error('授权地址无效');
      window.location.assign(url.href);
    } catch(error) {setNotice(error instanceof Error?error.message:'授权未完成');setBusy(false);}
  }
  const callbackStatus=new URLSearchParams(window.location.search).get('workbuddy');
  return <section aria-label="企查查连接状态">
    <strong>企查查 · WorkBuddy 自动查询</strong>
    <p role="status">{session.message}</p>
    <small>授权后，查询企业会自动取数并纳入风险判断。请保持 WorkBuddy 本地助理在线。</small>
    {session.configurable&&<button className="ghost" onClick={()=>setOpen(true)}>配置 WorkBuddy</button>}
    {callbackStatus&&callbackStatus!=='connected'&&<p role="alert">WorkBuddy 授权未完成，请重新连接并核对应用权限。</p>}
    {open&&<Drawer viewKey="workbuddy-connection" onClose={close}>
      <h2>连接 WorkBuddy</h2>
      <p>只需配置并授权一次，以后由网页自动查询，无需复制提示词。</p>
      <p><a href="https://open.workbuddy.cn/" target="_blank" rel="noreferrer">打开 WorkBuddy 开放平台，创建应用 ↗</a>。应用需审核启用，并申请以下两项权限：</p>
      <p><code>user.localassistant.readable</code><br/><code>user.localassistant.invokable</code></p>
      <form onSubmit={e=>{e.preventDefault();void save();}}>
        <label>OAuth 回调地址<input aria-label="WorkBuddy 回调地址" value={redirect} maxLength={2048} onChange={e=>setRedirect(e.target.value)}/></label>
        <p>将此地址原样登记到开放平台。授权时请使用相同主机名访问本页。</p>
        <label>应用 Client ID<input aria-label="WorkBuddy Client ID" value={clientId} maxLength={256} autoComplete="off" onChange={e=>setClientId(e.target.value)}/></label>
        <label>应用 Client Secret<input aria-label="WorkBuddy Client Secret" type="password" value={secret} maxLength={4096} autoComplete="off" onChange={e=>setSecret(e.target.value)}/></label>
        <p>凭据仅保存在本机后端，不进入模型、前端存储或 Git 仓库。已有 .env 配置时可直接授权，无需重复填写。</p>
        <button className="consumer-primary" disabled={busy||!clientId.trim()||!secret.trim()}>保存本机配置</button>
      </form>
      <button className="consumer-primary" disabled={busy||!session.app_configured} onClick={()=>void authorize()}>授权连接 WorkBuddy</button>
      {notice&&<p role="status">{notice}</p>}
    </Drawer>}
  </section>;
}
